import { Image as Compressor } from "react-native-compressor";

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Compresses a captured photo to ≤2048px max dimension at 85% JPEG quality.
 * Returns the compressed file URI, or the original URI if compression fails.
 */
export async function compressForUpload(uri: string): Promise<string> {
  try {
    const compressed = await Compressor.compress(uri, {
      compressionMethod: "manual",
      maxWidth: MAX_DIMENSION,
      maxHeight: MAX_DIMENSION,
      quality: JPEG_QUALITY,
    });
    return compressed;
  } catch (err) {
    console.warn("[imageCompression] compression failed, using original:", err);
    return uri;
  }
}
