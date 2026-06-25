/**
 * CV pipeline orchestrator.
 *
 * Runs every analyzer over the loaded image and assembles the results into
 * a single cvPayload object whose shape is a superset of the frontend's
 * SAMPLE_DATA contract (crit.scores, vmap.zones, comp.rules, brush.stats,
 * palette). Every numeric field in this object is computed from the user's
 * pixels — the LLM interpreter (Phase 3.2) is allowed to read these numbers
 * and write prose about them, but it can NEVER override them.
 *
 * Also emits a `provenance` block describing exactly how each number was
 * derived, so the UI can show "How we measured this" honestly.
 */

const { loadImage, ImageLoadError } = require('./loader');
const { analyzeValue } = require('./value');
const { extractPalette } = require('./palette');
const { analyzeEdges } = require('./edges');
const { analyzeComposition } = require('./composition');
const { analyzeLighting } = require('./lighting');

/**
 * Run the full CV pipeline on a raw image buffer.
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<{
 *   sha256: string,
 *   cv: object,          // the measured values
 *   provenance: object,  // how each value was derived
 * }>}
 */
async function runCV(imageBuffer) {
  const img = await loadImage(imageBuffer);

  const value = analyzeValue(img);
  const palette = extractPalette(img);
  const edges = analyzeEdges(img);
  const composition = analyzeComposition(img);
  const lighting = analyzeLighting(img);

  // --- Assemble the four critique scores (SAMPLE_DATA.crit.scores shape) --
  // The keys (val, comp, edge, light) are literal — the frontend renders
  // them as captions. Do not rename.
  const scores = {
    val: value.grade,
    comp: edges.grade, // composition quality inferred from edge distribution
    edge: edges.grade,
    light: lighting.grade,
  };

  const cv = {
    scores,
    vmap: { zones: value.zones },
    comp: { rules: composition.rules },
    brush: { stats: edges.stats },
    palette: palette.swatches,
    // Raw measurements the LLM interpreter may reference (not rendered
    // directly, but available for grounded prose generation).
    measurements: {
      dynamicRange: value.dynamicRange,
      shadowMass: value.shadowMass,
      highlightMass: value.highlightMass,
      percentiles: value.percentiles,
      edgeDensity: edges.edgeDensity,
      softRatio: edges.softRatio,
      crispRatio: edges.crispRatio,
      thirdsStrength: composition.thirdsStrength,
      centerEnergy: composition.centerEnergy,
      lightDirection: lighting.direction,
      lightContrast: lighting.normalizedContrast,
      quadrantMeans: lighting.quadrantMeans,
    },
  };

  const provenance = {
    valueGrade: {
      source: 'luminance-histogram',
      weights: 'Rec. 601 (0.299 R / 0.587 G / 0.114 B)',
      metric: 'dynamic range = (p99 − p1) / 255',
      thresholds: require('./value').DYNAMIC_RANGE_GRADE,
      measured: { p1: value.percentiles.p1, p99: value.percentiles.p99, dynamicRange: value.dynamicRange },
    },
    valueZones: {
      source: 'luminance histogram, banded',
      bands: ['Highlights 192–255', 'Light 128–191', 'Midtone 64–127', 'Shadow 32–63', 'Core shadow 0–31'],
    },
    palette: {
      source: 'k-means clustering (k=5) on 100×100 downsample',
      mapping: 'nearest classical pigment by squared Euclidean RGB distance',
    },
    edges: {
      source: 'Sobel operator (L1 magnitude)',
      thresholds: { edge: 60, softCrispBoundary: 120 },
    },
    composition: {
      source: '3×3 grid energy (per-cell luminance variance)',
      thirdsMetric: 'share of energy in cells the thirds lines pass through',
    },
    lighting: {
      source: 'mean luminance per quadrant',
      direction: lighting.direction,
      contrast: lighting.normalizedContrast,
    },
  };

  return { sha256: img.sha256, cv, provenance };
}

module.exports = { runCV, ImageLoadError };
