const sharp = require('sharp');
const crypto = require('crypto');

/**
 * Image loader for the CV pipeline.
 *
 * Decodes any upload into a raw RGBA pixel buffer at a normalized working
 * size (long edge = WORKING_SIZE px). The pipeline is deterministic for a
 * given input, so the same portrait always produces the same grades — this
 * is the foundation of the integrity promise.
 *
 * Working size of 600px balances fidelity (enough detail for edge/value
 * analysis) with throughput (a 600px image is ~1.4M pixels — fast to scan).
 */

const WORKING_SIZE = 600;

class ImageLoadError extends Error {
  constructor(message) {
    super(message);
    this.publicMessage = message;
    this.statusCode = 400;
  }
}

/**
 * @param {Buffer} buffer  - raw image bytes (JPEG/PNG/WebP from storage)
 * @returns {Promise<{ data: Uint8Array, width: number, height: number, sha256: string }>}
 */
async function loadImage(buffer) {
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate();

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageLoadError('Could not decode image.');
  }

  // Normalize to a known working size. `inside` preserves aspect ratio; we
  // never enlarge a small image.
  pipeline = pipeline.resize({
    width: WORKING_SIZE,
    height: WORKING_SIZE,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    sha256,
  };
}

module.exports = { loadImage, WORKING_SIZE, ImageLoadError };
