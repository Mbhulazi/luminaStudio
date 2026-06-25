/**
 * Value (tonal) analysis — the most defensible part of the integrity promise.
 *
 * Every value-related number in the analysis is computed here from the actual
 * luminance histogram of the user's image. Grades are derived by thresholding
 * the measured distribution against fixed, documented cut-points — so "your
 * Value grade is B+" means a specific, reproducible thing.
 *
 * Luminance uses Rec. 601 weights (0.299/0.587/0.114), matching the
 * client-side Grisaille grayscale conversion so the two views agree.
 */

const REC601 = { r: 0.299, g: 0.587, b: 0.114 };

// --- Thresholds (documented in the provenance block) ----------------------
// Dynamic range = (p99 luminance - p1 luminance) / 255. A portrait with
// good lights AND darks scores high; a flat photo scores low.
const DYNAMIC_RANGE_GRADE = [
  { min: 0.72, grade: 'A+' },
  { min: 0.62, grade: 'A' },
  { min: 0.52, grade: 'A−' },
  { min: 0.42, grade: 'B+' },
  { min: 0.32, grade: 'B' },
  { min: 0.22, grade: 'B−' },
  { min: 0.12, grade: 'C+' },
  { min: 0.0, grade: 'C' },
];

/**
 * Compute the full value analysis for an image.
 *
 * @param {object} img  - { data: Uint8Array RGBA, width, height }
 * @returns {{
 *   histogram: number[],          // 10 bins, each 0..1 share of pixels
 *   percentiles: { p1:number, p10:number, p50:number, p90:number, p99:number },
 *   dynamicRange: number,         // 0..1
 *   grade: string,                // 'A+'..'C'
 *   zones: Array<{ name:string, val:string, bar:number, c:string }>,
 *   shadowMass: number,           // 0..1 share of pixels below 64
 *   highlightMass: number,        // 0..1 share above 191
 * }}
 */
function analyzeValue(img) {
  const { data, width, height } = img;
  const total = width * height;

  // --- Pass 1: build luminance histogram (256 bins) -----------------------
  const lum = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(
      REC601.r * data[i] + REC601.g * data[i + 1] + REC601.b * data[i + 2]
    );
    lum[y]++;
  }

  // --- Percentiles (luminance values 0..255) ------------------------------
  const percentiles = computePercentiles(lum, total, [1, 10, 50, 90, 99]);

  // --- 10-bin summary histogram (0..1 share per bin) ----------------------
  const histogram = new Array(10).fill(0);
  for (let v = 0; v < 256; v++) {
    const bin = Math.min(9, Math.floor(v / 25.6));
    histogram[bin] += lum[v];
  }
  for (let i = 0; i < 10; i++) histogram[i] /= total;

  // --- Dynamic range + grade ---------------------------------------------
  const dynamicRange = (percentiles.p99 - percentiles.p1) / 255;
  const grade = gradeFromDynamicRange(dynamicRange);

  // --- Mass measurements (for shadow/highlight commentary) ----------------
  let shadowMass = 0;
  let highlightMass = 0;
  for (let v = 0; v < 256; v++) {
    if (v < 64) shadowMass += lum[v];
    if (v > 191) highlightMass += lum[v];
  }
  shadowMass /= total;
  highlightMass /= total;

  // --- Value zones — shaped to match the SAMPLE_DATA.vmap.zones contract --
  const zones = buildValueZones(lum, total);

  return { histogram, percentiles, dynamicRange, grade, zones, shadowMass, highlightMass };
}

function computePercentiles(hist, total, ps) {
  const out = {};
  for (const p of ps) {
    const target = (p / 100) * total;
    let cumulative = 0;
    let value = 0;
    for (let v = 0; v < 256; v++) {
      cumulative += hist[v];
      if (cumulative >= target) {
        value = v;
        break;
      }
    }
    out[`p${p}`] = value;
  }
  return out;
}

function gradeFromDynamicRange(dr) {
  for (const tier of DYNAMIC_RANGE_GRADE) {
    if (dr >= tier.min) return tier.grade;
  }
  return 'D';
}

/**
 * Build the 5 canonical value zones. Each zone reports its share of the
 * frame (val: '22%', bar: 22) and a representative swatch colour (the mean
 * RGB of pixels in that band). Output shape matches SAMPLE_DATA.vmap.zones
 * so it drops into the existing UI renderer unchanged.
 */
function buildValueZones(hist, total) {
  // Luminance bands (Rec. 601 → 0..255). Bands are the classic atelier
  // value structure: highlight, light, midtone, shadow, core shadow.
  const bands = [
    { name: 'Highlights', lo: 192, hi: 255 },
    { name: 'Light', lo: 128, hi: 191 },
    { name: 'Midtone', lo: 64, hi: 127 },
    { name: 'Shadow', lo: 32, hi: 63 },
    { name: 'Core shadow', lo: 0, hi: 31 },
  ];

  return bands.map((b) => {
    let count = 0;
    for (let v = b.lo; v <= b.hi; v++) count += hist[v];
    const share = count / total;
    // Representative swatch: a neutral grey at the band's midpoint luminance.
    const midLum = Math.round((b.lo + b.hi) / 2);
    const hex = grayToHex(midLum);
    return {
      name: b.name,
      val: `${Math.round(share * 100)}%`,
      bar: Math.round(share * 100),
      c: hex,
    };
  });
}

function grayToHex(lum) {
  const c = lum.toString(16).padStart(2, '0');
  return `#${c}${c}${c}`;
}

module.exports = { analyzeValue, DYNAMIC_RANGE_GRADE };
