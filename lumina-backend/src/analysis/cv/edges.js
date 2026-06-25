/**
 * Edge analysis via Sobel operator.
 *
 * Convolves a Sobel kernel over the luminance image to produce an edge-
 * magnitude map, then summarizes it into:
 *   - a soft/crisp ratio (what % of edges are gentle vs. hard)
 *   - an overall edge-density figure
 *   - a grade
 *
 * This feeds the brushwork module — painters care deeply about edge
 * variety, and "62% soft / 38% crisp" is a real measurement of the image,
 * not an opinion.
 */

const REC601 = { r: 0.299, g: 0.587, b: 0.114 };
const SOBEL_THRESHOLD = 60; // below this, magnitude counts as "no edge"
const SOFT_THRESHOLD = 120; // 60..120 = soft edge, >120 = crisp

function analyzeEdges(img) {
  const { data, width, height } = img;

  // --- Build grayscale plane (Uint8, 0..255) ------------------------------
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y * width + x] = Math.round(
        REC601.r * data[idx] + REC601.g * data[idx + 1] + REC601.b * data[idx + 2]
      );
    }
  }

  // --- Sobel convolution (skip 1px border) --------------------------------
  let edgeCount = 0;
  let softCount = 0;
  let crispCount = 0;
  let totalMagnitude = 0;
  const interior = (width - 2) * (height - 2);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = gray[i - width - 1];
      const tc = gray[i - width];
      const tr = gray[i - width + 1];
      const ml = gray[i - 1];
      const mr = gray[i + 1];
      const bl = gray[i + width - 1];
      const bc = gray[i + width];
      const br = gray[i + width + 1];

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.abs(gx) + Math.abs(gy); // L1 norm — cheaper than sqrt

      if (mag >= SOBEL_THRESHOLD) {
        edgeCount++;
        totalMagnitude += mag;
        if (mag < SOFT_THRESHOLD) softCount++;
        else crispCount++;
      }
    }
  }

  const edgeDensity = edgeCount / interior;
  const softRatio = edgeCount > 0 ? softCount / edgeCount : 0;
  const crispRatio = edgeCount > 0 ? crispCount / edgeCount : 0;
  const avgMagnitude = edgeCount > 0 ? totalMagnitude / edgeCount : 0;

  return {
    edgeDensity,
    softRatio,
    crispRatio,
    avgMagnitude,
    grade: gradeFromEdges(edgeDensity, softRatio),
    // Distribution stats shaped for the brush.stats renderer.
    stats: [
      { lbl: 'Edge density', val: `${Math.round(edgeDensity * 100)}%`, sub: 'of frame' },
      { lbl: 'Soft edges', val: `${Math.round(softRatio * 100)}%`, sub: 'gentle transitions' },
      { lbl: 'Crisp edges', val: `${Math.round(crispRatio * 100)}%`, sub: 'hard transitions' },
      { lbl: 'Avg. magnitude', val: String(Math.round(avgMagnitude)), sub: 'Sobel L1' },
    ],
  };
}

function gradeFromEdges(density, softRatio) {
  // A good portrait has moderate density and a varied soft/crisp mix.
  // Too few edges = muddy; too many = busy/noisy.
  let score = 0;
  if (density > 0.04 && density < 0.18) score += 0.5;
  else if (density > 0.02) score += 0.25;
  // Variety bonus: 30–70% soft is ideal.
  const variety = 1 - Math.abs(softRatio - 0.5) * 2;
  score += variety * 0.5;

  if (score > 0.75) return 'A';
  if (score > 0.6) return 'A−';
  if (score > 0.45) return 'B+';
  if (score > 0.3) return 'B';
  if (score > 0.15) return 'B−';
  return 'C+';
}

module.exports = { analyzeEdges };
