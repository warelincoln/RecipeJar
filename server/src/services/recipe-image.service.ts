import { optimizeForHero, optimizeForThumbnail } from "../parsing/image/image-optimizer.js";
import { getSupabase } from "./supabase.js";

export const RECIPE_IMAGES_BUCKET = "recipe-images";
export const RECIPE_PAGES_BUCKET = "recipe-pages";
const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
let _imagesBucketReady = false;

function heroPathFor(recipeId: string): string {
  return `${recipeId}/hero.jpg`;
}

function thumbnailPathFor(recipeId: string): string {
  return `${recipeId}/thumb.jpg`;
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
        public: true,
      },
    );
    if (createErr) {
      throw createErr;
    }
    _imagesBucketReady = true;
    return;
  }

  if (!bucket.public) {
    await supabase.storage.updateBucket(RECIPE_IMAGES_BUCKET, { public: true });
  }
  _imagesBucketReady = true;
}

export function resolveImageUrls(imageUrl: string | null) {
  if (!imageUrl) {
    return { imageUrl: null, thumbnailUrl: null };
  }

  const recipeId = imageUrl.split("/")[0];
  const heroPath = heroPathFor(recipeId);
  const thumbPath = thumbnailPathFor(recipeId);
  const supabase = getSupabase();
  const { data: heroData } = supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .getPublicUrl(heroPath);
  const { data: thumbData } = supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .getPublicUrl(thumbPath);

  return {
    imageUrl: heroData.publicUrl,
    thumbnailUrl: thumbData.publicUrl,
  };
}

export async function deleteRecipeImage(recipeId: string): Promise<void> {
  await ensureRecipeImagesBucket();
  const paths = [heroPathFor(recipeId), thumbnailPathFor(recipeId)];
  await getSupabase().storage.from(RECIPE_IMAGES_BUCKET).remove(paths);
}

export async function uploadRecipeImage(
  recipeId: string,
  imageBuffer: Buffer,
): Promise<string | null> {
  await ensureRecipeImagesBucket();
  const heroPath = heroPathFor(recipeId);
  const thumbPath = thumbnailPathFor(recipeId);
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

    return uploadRecipeImage(recipeId, Buffer.from(arrayBuffer));
  } catch {
    return null;
  }
}

export async function copyFromDraftPage(
  recipeId: string,
  draftPagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().storage
      .from(RECIPE_PAGES_BUCKET)
      .download(draftPagePath);
    if (error || !data) return null;
    const rawBuffer = Buffer.from(await data.arrayBuffer());
    return uploadRecipeImage(recipeId, rawBuffer);
  } catch {
    return null;
  }
}
