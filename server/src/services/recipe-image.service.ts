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

// Reuse signed URLs within their validity window so FastImage on the
// mobile client sees the same URL string between requests and serves
// images from its own cache instead of re-downloading on every home-
// screen visit. Without this, `createSignedUrls` returns a fresh
// `?token=...` each call and every list render flickers the images.
const SIGNED_URL_CACHE_BUFFER_MS = 5 * 60 * 1000;
const SIGNED_URL_CACHE_MAX_SIZE = 50_000;

interface CachedSignedUrl {
  signedUrl: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();

function getCachedSignedUrl(path: string): string | null {
  const entry = signedUrlCache.get(path);
  if (!entry) return null;
  if (entry.expiresAt - Date.now() <= SIGNED_URL_CACHE_BUFFER_MS) {
    return null;
  }
  return entry.signedUrl;
}

function setCachedSignedUrl(path: string, signedUrl: string): void {
  signedUrlCache.set(path, {
    signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX_SIZE) {
    evictSignedUrlCache();
  }
}

function evictSignedUrlCache(): void {
  const now = Date.now();
  for (const [path, entry] of signedUrlCache) {
    if (entry.expiresAt < now) signedUrlCache.delete(path);
  }
  if (signedUrlCache.size <= SIGNED_URL_CACHE_MAX_SIZE) return;
  const toDrop = signedUrlCache.size - SIGNED_URL_CACHE_MAX_SIZE;
  const iter = signedUrlCache.keys();
  for (let i = 0; i < toDrop; i++) {
    const next = iter.next();
    if (next.done) break;
    signedUrlCache.delete(next.value);
  }
}

/** Test-only: reset the module-level signed-URL cache between tests. */
export function __clearSignedUrlCacheForTests(): void {
  signedUrlCache.clear();
}

export interface ResolvedImageUrls {
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export async function resolveImageUrls(
  imageUrl: string | null,
): Promise<ResolvedImageUrls> {
  if (!imageUrl) {
    return { imageUrl: null, thumbnailUrl: null };
  }

  const heroPath = imageUrl;
  const thumbPath = imageUrl.replace(/\/hero\.jpg$/, "/thumb.jpg");

  const [heroSigned, thumbSigned] = await Promise.all([
    signWithCache(heroPath),
    signWithCache(thumbPath),
  ]);

  return {
    imageUrl: heroSigned,
    thumbnailUrl: thumbSigned,
  };
}

async function signWithCache(path: string): Promise<string | null> {
  const cached = getCachedSignedUrl(path);
  if (cached) return cached;

  const { data, error } = await getSupabase()
    .storage.from(RECIPE_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  setCachedSignedUrl(path, data.signedUrl);
  return data.signedUrl;
}

/**
 * Batch signed-URL resolution for a list of recipes. Takes an array of
 * hero-image paths (null-safe) and returns parallel signed URLs in the
 * same order. Uses Supabase's `createSignedUrls` batch endpoint — one
 * HTTP call per bucket regardless of input length — so the home-screen
 * list endpoint's Supabase load is O(1) instead of O(N).
 *
 * Why this matters: previously `GET /recipes` called `resolveImageUrls`
 * per recipe, each doing 2 `createSignedUrl` calls in parallel. With 50
 * recipes that was 100 parallel HTTPS calls to Supabase, which
 * throttled under load and drove home-screen latency to 20-30s.
 */
export async function resolveImageUrlsBatch(
  heroPaths: readonly (string | null)[],
): Promise<ResolvedImageUrls[]> {
  const results: ResolvedImageUrls[] = heroPaths.map(() => ({
    imageUrl: null,
    thumbnailUrl: null,
  }));

  // Build a task list of non-null entries; null hero paths stay null in
  // the output (recipe has no image yet).
  const tasks: Array<{ idx: number; heroPath: string; thumbPath: string }> = [];
  heroPaths.forEach((heroPath, idx) => {
    if (!heroPath) return;
    tasks.push({
      idx,
      heroPath,
      thumbPath: heroPath.replace(/\/hero\.jpg$/, "/thumb.jpg"),
    });
  });

  if (tasks.length === 0) return results;

  // Check the module-level cache first so we only pay the Supabase
  // sign cost for paths whose previous signatures are missing or
  // about to expire. Same rationale as resolveImageUrls — this is what
  // lets FastImage treat repeat home-screen visits as cache hits.
  const heroMap = new Map<string, string>();
  const thumbMap = new Map<string, string>();
  const heroToSign: string[] = [];
  const thumbToSign: string[] = [];
  for (const t of tasks) {
    const cachedHero = getCachedSignedUrl(t.heroPath);
    if (cachedHero) heroMap.set(t.heroPath, cachedHero);
    else heroToSign.push(t.heroPath);

    const cachedThumb = getCachedSignedUrl(t.thumbPath);
    if (cachedThumb) thumbMap.set(t.thumbPath, cachedThumb);
    else thumbToSign.push(t.thumbPath);
  }

  const supabase = getSupabase();
  const [heroResp, thumbResp] = await Promise.all([
    heroToSign.length > 0
      ? supabase.storage
          .from(RECIPE_IMAGES_BUCKET)
          .createSignedUrls(heroToSign, SIGNED_URL_TTL_SECONDS)
      : null,
    thumbToSign.length > 0
      ? supabase.storage
          .from(RECIPE_IMAGES_BUCKET)
          .createSignedUrls(thumbToSign, SIGNED_URL_TTL_SECONDS)
      : null,
  ]);

  // Build path → signedUrl lookups so we're robust against any
  // reordering by the Supabase API. Silently drop individual per-path
  // errors — the mobile client tolerates null signed URLs on the list
  // endpoint (FastImage shows a placeholder).
  heroResp?.data?.forEach((row) => {
    if (row.path && row.signedUrl && !row.error) {
      heroMap.set(row.path, row.signedUrl);
      setCachedSignedUrl(row.path, row.signedUrl);
    }
  });
  thumbResp?.data?.forEach((row) => {
    if (row.path && row.signedUrl && !row.error) {
      thumbMap.set(row.path, row.signedUrl);
      setCachedSignedUrl(row.path, row.signedUrl);
    }
  });

  for (const t of tasks) {
    results[t.idx] = {
      imageUrl: heroMap.get(t.heroPath) ?? null,
      thumbnailUrl: thumbMap.get(t.thumbPath) ?? null,
    };
  }

  return results;
}

/**
 * Create a signed URL for a source page image stored in the `recipe-pages` bucket.
 * Returns null if the path is empty or signing fails.
 */
export async function resolveSourcePageUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(RECIPE_PAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
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

/**
 * Normalizes image URLs pulled from JSON-LD / Microdata before fetching.
 * Handles the shapes we've seen from real recipe sites that would
 * otherwise throw "Invalid URL" from `fetch()`:
 *
 *   - Protocol-relative (`//cdn.example.com/path`) → prepend `https:`
 *     (observed on hungry-girl.com; CloudFront-backed recipe images are
 *     often published this way so the CDN can serve over whichever
 *     scheme the page was loaded with)
 *   - Already-qualified URLs pass through untouched
 *   - Anything that doesn't parse as a URL after normalization returns
 *     null so the caller knows to skip the download
 *
 * Returns the normalized URL or null if it can't be resolved to a
 * fetchable https/http URL.
 */
export function normalizeImageUrlForFetch(
  rawImageUrl: string | null | undefined,
): string | null {
  if (!rawImageUrl) return null;
  const trimmed = rawImageUrl.trim();
  if (!trimmed) return null;

  // Protocol-relative: "//cdn.foo.com/..." → "https://cdn.foo.com/..."
  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function downloadAndStoreFromUrl(
  userId: string,
  recipeId: string,
  imageUrl: string,
): Promise<string | null> {
  const fetchUrl = normalizeImageUrlForFetch(imageUrl);
  if (!fetchUrl) return null;

  try {
    const response = await fetch(fetchUrl);
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
