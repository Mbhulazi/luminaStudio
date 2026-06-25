/**
 * Lighting analysis — estimate dominant light direction from the luminance
 * gradient across the image.
 *
 * Splits the image into quadrants and compares mean luminance. The brightest
 * quadrant indicates where the light is coming from; the darkest indicates
 * where shadow falls. This is a coarse but honest measurement — it won't
 * compete with a professional lighting diagram, but it's grounded in actual
 * pixel values and stated as such in the provenance block.
 */

const REC601 = { r: 0.299, g: 0.587, b: 0.114 };

const QUADRANT_LABELS = {
  '0,0': 'upper-left',
  '1,0': 'upper-right',
  '0,1': 'lower-left',
  '1,1': 'lower-right',
};

function analyzeLighting(img) {
  const { data, width, height } = img;

  // --- Mean luminance per quadrant ----------------------------------------
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const quads = {
    '0,0': { sum: 0, n: 0 }, // upper-left
    '1,0': { sum: 0, n: 0 }, // upper-right
    '0,1': { sum: 0, n: 0 }, // lower-left
    '1,1': { sum: 0, n: 0 }, // lower-right
  };

  for (let y = 0; y < height; y++) {
    const qy = y < halfH ? 0 : 1;
    for (let x = 0; x < width; x++) {
      const qx = x < halfW ? 0 : 1;
      const idx = (y * width + x) * 4;
      const lum = REC601.r * data[idx] + REC601.g * data[idx + 1] + REC601.b * data[idx + 2];
      quads[`${qx},${qy}`].sum += lum;
      quads[`${qx},${qy}`].n++;
    }
  }

  for (const key of Object.keys(quads)) {
    quads[key].mean = quads[key].n > 0 ? quads[key].sum / quads[key].n : 0;
  }

  // --- Brightest + darkest quadrant → direction ---------------------------
  let brightest = '0,0';
  let darkest = '0,0';
  for (const key of Object.keys(quads)) {
    if (quads[key].mean > quads[brightest].mean) brightest = key;
    if (quads[key].mean < quads[darkest].mean) darkest = key;
  }

  const direction = QUADRANT_LABELS[brightest];
  const contrast = quads[brightest].mean - quads[darkest].mean;

  // --- Grade: stronger directional contrast = better-lit portrait --------
  // contrast is a 0..255 range; normalize to 0..1.
  const normalizedContrast = contrast / 255;
  let grade = 'C';
  if (normalizedContrast > 0.45) grade = 'A';
  else if (normalizedContrast > 0.35) grade = 'A−';
  else if (normalizedContrast > 0.25) grade = 'B+';
  else if (normalizedContrast > 0.15) grade = 'B';
  else if (normalizedContrast > 0.08) grade = 'B−';

  return {
    quadrantMeans: {
      upperLeft: quads['0,0'].mean,
      upperRight: quads['1,0'].mean,
      lowerLeft: quads['0,1'].mean,
      lowerRight: quads['1,1'].mean,
    },
    brightestQuadrant: brightest,
    darkestQuadrant: darkest,
    direction,
    contrast,
    normalizedContrast,
    grade,
  };
}

module.exports = { analyzeLighting };
