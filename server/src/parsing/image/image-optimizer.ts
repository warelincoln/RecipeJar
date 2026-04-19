import sharp from "sharp";

/**
 * Resize + auto-orient + JPEG compress for storage.
 * Keeps color. Used as a safety net at upload time.
 */
export async function optimizeForUpload(buffer: Buffer): Promise<Buffer> {
  try {
    const original = buffer.length;
    const optimized = await sharp(buffer)
      .rotate()
      .resize({
        width: 3072,
        height: 3072,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    console.log(
      `[image-optimizer] upload: ${(original / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB`,
    );
    return optimized;
  } catch (err) {
    console.warn("[image-optimizer] optimizeForUpload failed, using original buffer:", err);
    return buffer;
  }
}

/**
 * Optimization for recipe hero images displayed in detail view.
 * Targets moderate resolution for visual quality and bandwidth control.
 */
export async function optimizeForHero(buffer: Buffer): Promise<Buffer> {
  try {
    const original = buffer.length;
    const optimized = await sharp(buffer)
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    console.log(
      `[image-optimizer] hero: ${(original / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB`,
    );
    return optimized;
  } catch (err) {
    console.warn("[image-optimizer] optimizeForHero failed, using original buffer:", err);
    return buffer;
  }
}

/**
 * Optimization for recipe card thumbnails shown in grid lists.
 */
export async function optimizeForThumbnail(buffer: Buffer): Promise<Buffer> {
  try {
    const original = buffer.length;
    const optimized = await sharp(buffer)
      .rotate()
      .resize({
        width: 400,
        height: 400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();

    console.log(
      `[image-optimizer] thumb: ${(original / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB`,
    );
    return optimized;
  } catch (err) {
    console.warn("[image-optimizer] optimizeForThumbnail failed, using original buffer:", err);
    return buffer;
  }
}
