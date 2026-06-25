/**
 * Classical oil palette — the canonical reference list for the nearest-pigment
 * mapping. Mirrors the frontend GR_PIGMENTS array so palette results are
 * consistent between the client-side Grisaille tool and the server-side
 * analysis.
 *
 * Names follow standard oil-pigment nomenclature; hex values are typical
 * tube colours. When two pigments are very close in RGB (e.g. Burnt Sienna
 * vs Raw Sienna), the nearest-match logic picks whichever is closer — which
 * is exactly what we want.
 */
const PIGMENTS = [
  { name: 'Titanium White', hex: '#f4f1ea' },
  { name: 'Naples Yellow', hex: '#e6d9a8' },
  { name: 'Yellow Ochre', hex: '#c69a4b' },
  { name: 'Raw Sienna', hex: '#a86a2c' },
  { name: 'Burnt Sienna', hex: '#8a4a2e' },
  { name: 'Cadmium Red Light', hex: '#c63327' },
  { name: 'Alizarin Crimson', hex: '#7d2030' },
  { name: 'Burnt Umber', hex: '#5a3a1e' },
  { name: 'Raw Umber', hex: '#6e5230' },
  { name: 'Ultramarine Blue', hex: '#2b3a6b' },
  { name: 'Cerulean Blue', hex: '#2f6e8c' },
  { name: 'Viridian', hex: '#2c6e4f' },
  { name: 'Terre Verte', hex: '#5a7a5a' },
  { name: "Payne's Grey", hex: '#3d4252' },
  { name: 'Ivory Black', hex: '#1a1a1e' },
];

// Pre-parse hex → rgb once.
const PIGMENT_RGB = PIGMENTS.map((p) => ({ ...p, rgb: hexToRgb(p.hex) }));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Find the closest palette pigment to an arbitrary RGB triple, by squared
 * Euclidean distance in RGB space. Cheap and good enough for colour naming.
 */
function nearestPigment(r, g, b) {
  let best = PIGMENT_RGB[0];
  let bestDist = Infinity;
  for (const p of PIGMENT_RGB) {
    const dr = p.rgb.r - r;
    const dg = p.rgb.g - g;
    const db = p.rgb.b - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

module.exports = { PIGMENTS, nearestPigment, hexToRgb, rgbToHex };
