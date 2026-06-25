/**
 * Palette extraction via k-means clustering.
 *
 * Downsamples the image to a 100×100 thumbnail, runs k-means (k=5) on the
 * RGB pixels, then maps each centroid to its nearest classical pigment name.
 * Deterministic given a fixed seed for the initial centroids.
 *
 * Output is shaped to feed both the UI palette display and the glazing-plan
 * generator.
 */

const { nearestPigment, rgbToHex } = require('./pigments');

const DOWNSAMPLE_SIZE = 100;
const K = 5;
const MAX_ITERATIONS = 12;
const SEED_CENTROIDS = [
  [255, 255, 255], // white-ish
  [200, 170, 130], // light warm
  [150, 110, 80],  // mid warm
  [90, 70, 55],    // dark warm
  [30, 25, 25],    // deepest dark
];

/**
 * @returns {{
 *   swatches: Array<{ hex:string, name:string, share:number, rgb:[number,number,number] }>,
 * }}
 */
function extractPalette(img) {
  const samples = downsample(img, DOWNSAMPLE_SIZE);

  // --- k-means -------------------------------------------------------------
  let centroids = SEED_CENTROIDS.map((c) => [...c]);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Array(K).fill(0);

    for (let i = 0; i < samples.length; i += 3) {
      const r = samples[i];
      const g = samples[i + 1];
      const b = samples[i + 2];
      let nearest = 0;
      let nearestDist = Infinity;
      for (let c = 0; c < K; c++) {
        const dr = centroids[c][0] - r;
        const dg = centroids[c][1] - g;
        const db = centroids[c][2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < nearestDist) {
          nearestDist = d;
          nearest = c;
        }
      }
      sums[nearest][0] += r;
      sums[nearest][1] += g;
      sums[nearest][2] += b;
      counts[nearest]++;
    }

    let moved = false;
    for (let c = 0; c < K; c++) {
      if (counts[c] === 0) continue;
      const nr = sums[c][0] / counts[c];
      const ng = sums[c][1] / counts[c];
      const nb = sums[c][2] / counts[c];
      if (Math.abs(nr - centroids[c][0]) > 1) moved = true;
      centroids[c] = [nr, ng, nb];
    }
    if (!moved) break;
  }

  // --- Final assignment + share computation -------------------------------
  const counts = new Array(K).fill(0);
  for (let i = 0; i < samples.length; i += 3) {
    const r = samples[i];
    const g = samples[i + 1];
    const b = samples[i + 2];
    let nearest = 0;
    let nearestDist = Infinity;
    for (let c = 0; c < K; c++) {
      const dr = centroids[c][0] - r;
      const dg = centroids[c][1] - g;
      const db = centroids[c][2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = c;
      }
    }
    counts[nearest]++;
  }
  const total = samples.length / 3;

  // Sort swatches by share descending — the dominant colour first.
  const order = centroids
    .map((c, i) => ({ c, share: counts[i] / total }))
    .sort((a, b) => b.share - a.share);

  const swatches = order.map(({ c, share }) => {
    const r = Math.round(c[0]);
    const g = Math.round(c[1]);
    const b = Math.round(c[2]);
    const pig = nearestPigment(r, g, b);
    return {
      hex: rgbToHex(r, g, b),
      name: pig.name,
      share: Math.round(share * 1000) / 10, // one decimal %
      rgb: [r, g, b],
    };
  });

  return { swatches };
}

/**
 * Box-average downsample to target size, returning a flat RGB array.
 * Skipping alpha and averaging only opaque-ish pixels.
 */
function downsample(img, target) {
  const { data, width, height } = img;
  // Choose a step that lands near `target` samples per row.
  const stepX = Math.max(1, Math.floor(width / target));
  const stepY = Math.max(1, Math.floor(height / target));
  const out = [];
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      out.push(data[idx], data[idx + 1], data[idx + 2]);
    }
  }
  return out;
}

module.exports = { extractPalette, K, DOWNSAMPLE_SIZE };
