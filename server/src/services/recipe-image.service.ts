import { optimizeForHero, optimizeForThumbnail } from "../parsing/image/image-optimizer.js";
import { getSupabase } from "./supabase.js";

export const RECIPE_IMAGES_BUCKET = "recipe-images";
export const RECIPE_PAGES_BUCKET = "recipe-pages";
const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
let _imagesBucketReady = false;

function heroPathFor(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}/hero.jpg`;
}

function thumbnailPathFor(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}/thumb.jpg`;
}

export function draftPagePathFor(userId: string, draftId: string, pageId: string): string {
  return `${userId}/drafts/${draftId}/${pageId}.jpg`;
}

function isImageContentType(contentType: string | null): boolean {
  return typeof contentType === "string" && contentType.toLowerCase().startsWith("image/");
}

async function ensureRecipeImagesBucket(): Promise<void> {
  if (_imagesBucketReady) return;
  const supabase = getSupabase();
  const { data: bucket, error: bucketErr } = await supabase.storage.getBucket(
    RECIPE_IMAGES_BUCKET,
  );
  if (bucketErr) {
    const message = bucketErr.message?.toLowerCase() ?? "";
    const notFound =
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("no such bucket");
    if (!notFound) {
      throw bucketErr;
    }

    const { error: createErr } = await supabase.storage.createBucket(
      RECIPE_IMAGES_BUCKET,
      {
        public: false,
      },
    );
    if (createErr) {
      throw createErr;
    }
    _imagesBucketReady = true;
    return;
  }

  if (bucket.public) {
    await supabase.storage.updateBucket(RECIPE_IMAGES_BUCKET, { public: false });
  }
  _imagesBucketReady = true;
}

const SIGNED_URL_TTL_SECONDS = 3600;

export async function resolveImageUrls(imageUrl: string | null) {
  if (!imageUrl) {
    return { imageUrl: null, thumbnailUrl: null };
  }

  const heroPath = imageUrl;
  const thumbPath = imageUrl.replace(/\/hero\.jpg$/, "/thumb.jpg");
  const supabase = getSupabase();

  const [heroResult, thumbResult] = await Promise.all([
    supabase.storage
      .from(RECIPE_IMAGES_BUCKET)
      .createSignedUrl(heroPath, SIGNED_URL_TTL_SECONDS),
    supabase.storage
      .from(RECIPE_IMAGES_BUCKET)
      .createSignedUrl(thumbPath, SIGNED_URL_TTL_SECONDS),
  ]);

  return {
    imageUrl: heroResult.data?.signedUrl ?? null,
    thumbnailUrl: thumbResult.data?.signedUrl ?? null,
  };
}

export async function deleteRecipeImage(userId: string, recipeId: string): Promise<void> {
  await ensureRecipeImagesBucket();
  const paths = [heroPathFor(userId, recipeId), thumbnailPathFor(userId, recipeId)];
  await getSupabase().storage.from(RECIPE_IMAGES_BUCKET).remove(paths);
}

export async function uploadRecipeImage(
  userId: string,
  recipeId: string,
  imageBuffer: Buffer,
): Promise<string | null> {
  await ensureRecipeImagesBucket();
  const heroPath = heroPathFor(userId, recipeId);
  const thumbPath = thumbnailPathFor(userId, recipeId);
  const heroBuffer = await optimizeForHero(imageBuffer);
  const thumbBuffer = await optimizeForThumbnail(imageBuffer);

  const { error: heroErr } = await getSupabase().storage
    .from(RECIPE_IMAGES_BUCKET)
    .upload(heroPath, heroBuffer, {
      upsert: true,
      contentType: "image/jpeg",
    });
  if (heroErr) return null;

  const { error: thumbErr } = await getSupabase().storage
    .from(RECIPE_IMAGES_BUCKET)
    .upload(thumbPath, thumbBuffer, {
      upsert: true,
      contentType: "image/jpeg",
    });

  if (thumbErr) {
    await getSupabase().storage.from(RECIPE_IMAGES_BUCKET).remove([heroPath]);
    return null;
  }

  return heroPath;
}

export async function downloadAndStoreFromUrl(
  userId: string,
  recipeId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    if (!isImageContentType(contentType)) return null;

    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (typeof contentLength === "number" && Number.isFinite(contentLength)) {
      if (contentLength > REMOTE_IMAGE_MAX_BYTES) return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES) return null;

    return uploadRecipeImage(userId, recipeId, Buffer.from(arrayBuffer));
  } catch {
    return null;
  }
}

export async function copyFromDraftPage(
  userId: string,
  recipeId: string,
  draftPagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().storage
      .from(RECIPE_PAGES_BUCKET)
      .download(draftPagePath);
    if (error || !data) return null;
    const rawBuffer = Buffer.from(await data.arrayBuffer());
    return uploadRecipeImage(userId, recipeId, rawBuffer);
  } catch {
    return null;
  }
}

export async function deleteAllUserStorage(userId: string): Promise<void> {
  const supabase = getSupabase();
  for (const bucket of [RECIPE_IMAGES_BUCKET, RECIPE_PAGES_BUCKET]) {
    const { data: files } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: 10000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await supabase.storage.from(bucket).remove(paths);
    }
  }
}
