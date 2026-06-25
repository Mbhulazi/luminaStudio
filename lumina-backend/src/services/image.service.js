const sharp = require('sharp');

/**
 * Image normalization for uploads.
 *
 * Defends the system on three axes:
 *   1. Reject non-images early (sharp throws if the buffer isn't a decodable image).
 *   2. Strip all metadata (EXIF GPS, camera serial, etc.) — privacy critical for
 *      user-uploaded portraits.
 *   3. Cap dimensions at MAX_LONG_EDGE so we don't store multi-megapixel originals
 *      that the CV pipeline downsamples anyway.
 *
 * Output: a JPEG/WebP buffer at a controlled size. JPEG keeps it widely
 * compatible; switch to WebP for ~30% smaller files once the frontend is ready.
 */

const MAX_LONG_EDGE = 2000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB hard limit on incoming uploads

class UploadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.publicMessage = message;
    this.statusCode = statusCode;
  }
}

/**
 * Validate + normalize an uploaded image buffer.
 *
 * @param {Buffer} buffer  - raw bytes from multer
 * @returns {Promise<{ buffer: Buffer, mime: string, width: number, height: number, sha256: string }>}
 */
async function normalizeImage(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new UploadError('No image data received.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new UploadError(`Image is too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
  }

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err) {
    throw new UploadError('The uploaded file is not a valid image.');
  }

  // Resize down if the long edge exceeds the cap, preserving aspect ratio.
  // sharp's `withoutEnlargement` ensures we never upscale a small image.
  const normalized = await sharp(buffer)
    .rotate() // honor EXIF orientation before stripping it
    .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  const outMeta = await sharp(normalized).metadata();

  return {
    buffer: normalized,
    mime: 'image/jpeg',
    width: outMeta.width,
    height: outMeta.height,
  };
}

module.exports = { normalizeImage, UploadError, MAX_LONG_EDGE, MAX_BYTES };
