/**
 * Composition analysis via 3×3 grid energy + rule-of-thirds.
 *
 * Divides the image into a 3×3 grid and measures where visual mass
 * concentrates (by luminance variance per cell — high-variance cells contain
 * more detail/edges/mass). Then checks how strongly the mass peaks at the
 * four rule-of-thirds power points.
 *
 * Output is shaped to feed the SAMPLE_DATA.comp.rules renderer: each rule
 * reports whether it's satisfied and a qualitative score.
 */

const REC601 = { r: 0.299, g: 0.587, b: 0.114 };

function analyzeComposition(img) {
  const { data, width, height } = img;

  // --- Luminance plane ----------------------------------------------------
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = REC601.r * data[i] + REC601.g * data[i + 1] + REC601.b * data[i + 2];
  }

  // --- 3×3 grid energy (variance per cell) --------------------------------
  const cellW = Math.floor(width / 3);
  const cellH = Math.floor(height / 3);
  const grid = []; // 9 cells, row-major
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = gx === 2 ? width : (gx + 1) * cellW;
      const y1 = gy === 2 ? height : (gy + 1) * cellH;
      const energy = variance(gray, width, x0, y0, x1, y1);
      grid.push({ gx, gy, energy });
    }
  }

  const totalEnergy = grid.reduce((s, c) => s + c.energy, 0) || 1;
  for (const c of grid) c.share = c.energy / totalEnergy;

  // --- Rule-of-thirds power-point strength --------------------------------
  // The 4 inner-cell corners are the classic power points. We measure the
  // share of energy in the 4 inner cells (1,1 is centre, the 4 cardinal
  // inner corners are the thirds points).
  const innerCells = [1, 3, 5, 7]; // indices of edge-centre cells (the thirds lines pass through)
  const innerEnergy = innerCells.reduce((s, i) => s + grid[i].share, 0);
  const centerEnergy = grid[4].share;

  // Strong composition: mass sits near thirds points, not dead-centre.
  const thirdsStrength = innerEnergy / (innerEnergy + centerEnergy + 0.001);

  // --- Balance: left vs. right, top vs. bottom ----------------------------
  const leftMass = grid[0].share + grid[3].share + grid[6].share;
  const rightMass = grid[2].share + grid[5].share + grid[8].share;
  const topMass = grid[0].share + grid[1].share + grid[2].share;
  const bottomMass = grid[6].share + grid[7].share + grid[8].share;
  const lrBalance = 1 - Math.abs(leftMass - rightMass);
  const tbBalance = 1 - Math.abs(topMass - bottomMass);

  // --- Build the rules array (SAMPLE_DATA.comp.rules shape) ---------------
  const rules = [
    {
      icon: '⅓',
      name: 'Rule of thirds',
      desc: thirdsStrength > 0.55
        ? 'Key mass sits along the thirds lines rather than dead-centre — a classic, legible placement.'
        : thirdsStrength > 0.45
          ? 'Some mass along the thirds lines, but the centre carries significant weight too.'
          : 'Mass concentrates near the centre; consider shifting the focal point toward a thirds intersection.',
      score: thirdsStrength > 0.55 ? 'Strong ✓' : thirdsStrength > 0.45 ? 'Present' : 'Weak',
    },
    {
      icon: '↔',
      name: 'Left / right balance',
      desc: lrBalance > 0.8
        ? 'Evenly weighted horizontally — the eye reads both halves as co-equal.'
        : lrBalance > 0.6
          ? 'Slight horizontal imbalance; one side carries more visual weight.'
          : 'Strongly asymmetric horizontally, which can read as tension or instability.',
      score: lrBalance > 0.8 ? 'Balanced' : lrBalance > 0.6 ? 'Slight lean' : 'Asymmetric',
    },
    {
      icon: '↕',
      name: 'Top / bottom balance',
      desc: tbBalance > 0.8
        ? 'Vertical weight is well distributed.'
        : tbBalance > 0.6
          ? 'Mild vertical imbalance.'
          : 'Strongly top- or bottom-heavy.',
      score: tbBalance > 0.8 ? 'Balanced' : tbBalance > 0.6 ? 'Slight lean' : 'Asymmetric',
    },
    {
      icon: '◇',
      name: 'Focal clarity',
      desc: centerEnergy > 0.2
        ? 'A clear central focal mass — direct, but borders on static.'
        : centerEnergy > 0.12
          ? 'Moderate central presence; the eye has somewhere to land.'
          : 'No single dominant focal mass; the eye wanders.',
      score: centerEnergy > 0.2 ? 'Strong ✓' : centerEnergy > 0.12 ? 'Present' : 'Diffuse',
    },
  ];

  return {
    grid,
    thirdsStrength,
    leftMass,
    rightMass,
    topMass,
    bottomMass,
    centerEnergy,
    rules,
  };
}

function variance(arr, stride, x0, y0, x1, y1) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = arr[y * stride + x];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

module.exports = { analyzeComposition };
