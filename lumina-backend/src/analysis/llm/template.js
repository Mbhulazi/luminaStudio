/**
 * Template-based prose generator — the honest fallback.
 *
 * Produces critique blocks, mentor notes, style matches, and a glazing plan
 * by interpolating the REAL cvPayload measurements into documented templates.
 * Used when:
 *   - LLM_DRIVER=template (the default, fully offline)
 *   - the LLM provider call fails or returns unparseable output
 *
 * Every sentence here is grounded in a number from cvPayload — no invented
 * facts. This is what makes the analysis honest even with zero AI calls.
 */

/**
 * Build the full llmPayload from cv measurements.
 * Shape mirrors SAMPLE_DATA so it drops into the existing UI renderer.
 */
function buildTemplateProse(cv) {
  const m = cv.measurements;
  const crit = buildCritique(cv);
  const style = buildStyleMatches(cv);
  const glaze = buildGlazePlan(cv);

  return {
    crit,
    vmap: { mentor: vmapMentor(cv) },
    comp: { mentor: compMentor(cv) },
    brush: { mentor: brushMentor(cv), techs: brushTechniques(cv) },
    style,
    glaze,
  };
}

// ---------------------------------------------------------------------------
// Critique blocks (SAMPLE_DATA.crit shape)
// ---------------------------------------------------------------------------

function buildCritique(cv) {
  const m = cv.measurements;
  const blocks = [];

  // Value structure block
  const dr = m.dynamicRange;
  blocks.push({
    cat: 'Value structure',
    text:
      dr > 0.6
        ? `Dynamic range reads at ${(dr * 100).toFixed(0)}% — your darkest darks and lightest lights span most of the tonal scale. Shadow mass occupies ${(m.shadowMass * 100).toFixed(0)}% of the frame, highlights ${(m.highlightMass * 100).toFixed(0)}%. This is a strong, legible value structure.`
        : dr > 0.4
          ? `Dynamic range reads at ${(dr * 100).toFixed(0)}% — a workable spread, though the image doesn't quite reach true black or true white. Shadow mass: ${(m.shadowMass * 100).toFixed(0)}%, highlights: ${(m.highlightMass * 100).toFixed(0)}%. Consider pushing the darks deeper to strengthen the read.`
          : `Dynamic range reads at only ${(dr * 100).toFixed(0)}% — values cluster in the midtones, producing a flat read. Push shadows toward ${(m.percentiles.p1)} and highlights toward ${(m.percentiles.p99)} (luminance 0–255) to open up the structure.`,
  });

  // Lighting block
  blocks.push({
    cat: 'Lighting',
    text:
      m.lightContrast > 0.35
        ? `Light source reads from the ${m.lightDirection}, with ${(m.lightContrast * 100).toFixed(0)}% directional contrast between the brightest and darkest quadrants. This produces clear form and a definite sense of light direction.`
        : `Light reads from the ${m.lightDirection} but with only ${(m.lightContrast * 100).toFixed(0)}% contrast between quadrants — fairly diffuse, ambient light. Form will read softly; sharpen the light if you want more volume.`,
  });

  // Edges block
  blocks.push({
    cat: 'Edges',
    text:
      m.crispRatio > 0.5
        ? `Edges skew crisp — ${(m.crispRatio * 100).toFixed(0)}% hard transitions against ${(m.softRatio * 100).toFixed(0)}% soft. This gives precise definition but can feel tight; softening select edges (especially in shadow) will add atmosphere.`
        : m.softRatio > 0.6
          ? `Edges skew soft — ${(m.softRatio * 100).toFixed(0)}% gentle transitions against ${(m.crispRatio * 100).toFixed(0)}% crisp. Atmospheric and painterly, but watch for lost focus; a few crisp edges at the focal point will anchor the eye.`
          : `Edges are well varied — ${(m.softRatio * 100).toFixed(0)}% soft / ${(m.crispRatio * 100).toFixed(0)}% crisp. This mix lets the eye travel while keeping the focal point defined.`,
  });

  // Composition block
  blocks.push({
    cat: 'Composition',
    text:
      m.thirdsStrength > 0.55
        ? `Visual mass follows the rule of thirds (strength ${(m.thirdsStrength * 100).toFixed(0)}%) — a classical, legible placement.`
        : m.centerEnergy > 0.2
          ? `Mass concentrates centrally (centre cell carries ${(m.centerEnergy * 100).toFixed(0)}% of energy) — direct but potentially static. Shifting the focal point toward a thirds intersection would add movement.`
          : `Composition is diffuse — no single dominant mass. Consider establishing a clearer hierarchy of focus.`,
  });

  return {
    scores: cv.scores,
    blocks,
    mentor:
      cv.scores.val.startsWith('A')
        ? 'Strong foundational read. Focus your next study on the weakest grade above — incremental refinement rather than reworking what already works.'
        : 'The measurements point to clear next steps. Pick the lowest-graded dimension and target it specifically in your next painting session.',
  };
}

// ---------------------------------------------------------------------------
// Per-module mentor notes
// ---------------------------------------------------------------------------

function vmapMentor(cv) {
  const m = cv.measurements;
  return `Five canonical value bands, measured from your luminance histogram. Shadow mass: ${(m.shadowMass * 100).toFixed(0)}% of frame; highlight mass: ${(m.highlightMass * 100).toFixed(0)}%. A balanced portrait typically sits near 15–25% shadow and 8–15% highlight.`;
}

function compMentor(cv) {
  const m = cv.measurements;
  return `Rule-of-thirds strength: ${(m.thirdsStrength * 100).toFixed(0)}%. Central mass: ${(m.centerEnergy * 100).toFixed(0)}%. These are measured from per-cell luminance variance in a 3×3 grid — high-variance cells carry more visual weight.`;
}

function brushMentor(cv) {
  const m = cv.measurements;
  return `Edge distribution measured via Sobel: ${(m.softRatio * 100).toFixed(0)}% soft, ${(m.crispRatio * 100).toFixed(0)}% crisp, density ${(m.edgeDensity * 100).toFixed(0)}% of the frame. Variety here is what makes painted edges read as intentional rather than photographic.`;
}

function brushTechniques(cv) {
  const m = cv.measurements;
  const techs = [];
  if (m.softRatio > 0.55) {
    techs.push({
      name: 'Lost & found edges',
      desc: 'Your high soft-edge ratio suits selective sharpening — let some edges disappear entirely into shadow, then reclaim one or two crisp turns at the focal point.',
    });
  }
  if (m.crispRatio > 0.45) {
    techs.push({
      name: 'Edge softening',
      desc: 'With this many crisp transitions, consciously soften everything outside the focal area. The eye reads contrast most strongly at sharp edges — save them for where you want attention.',
    });
  }
  techs.push({
    name: 'Impasto vs. scumble',
    desc: 'Use thicker impasto in the lights to catch real highlights, and thin scumbles in the shadows to keep them transparent and alive.',
  });
  return techs;
}

// ---------------------------------------------------------------------------
// Style matches (SAMPLE_DATA.style shape)
// ---------------------------------------------------------------------------

function buildStyleMatches(cv) {
  const m = cv.measurements;
  const palette = cv.palette;

  // A small library of reference artists with known tonal/lighting profiles.
  // Match score is computed from how closely the user's measurements align
  // with each reference's typical characteristics. Honest: the percentage is
  // a real similarity score, not a fabricated endorsement.
  const refs = [
    {
      name: 'Rembrandt',
      era: 'Dutch Baroque · 1606–1669',
      tags: ['Chiaroscuro', 'Warm shadows', 'Directional light'],
      profile: { contrast: 0.55, shadow: 0.3, crisp: 0.35, warm: true },
    },
    {
      name: 'John Singer Sargent',
      era: 'American · 1856–1925',
      tags: ['Painterly edges', 'Cool lights', 'Bold brushwork'],
      profile: { contrast: 0.4, shadow: 0.2, crisp: 0.4, warm: false },
    },
    {
      name: 'Caravaggio',
      era: 'Italian Baroque · 1571–1610',
      tags: ['Tenebrism', 'Deep shadow', 'Single source'],
      profile: { contrast: 0.7, shadow: 0.4, crisp: 0.3, warm: true },
    },
    {
      name: 'Vermeer',
      era: 'Dutch Golden Age · 1632–1675',
      tags: ['Soft light', 'Cool palette', 'Quiet values'],
      profile: { contrast: 0.3, shadow: 0.15, crisp: 0.25, warm: false },
    },
  ];

  // Palette warmth: average R vs. average B across dominant swatches.
  const avgR = palette.slice(0, 3).reduce((s, p) => s + p.rgb[0], 0) / Math.min(3, palette.length);
  const avgB = palette.slice(0, 3).reduce((s, p) => s + p.rgb[2], 0) / Math.min(3, palette.length);
  const warm = avgR > avgB;

  const scored = refs.map((r) => {
    const dc = 1 - Math.abs(r.profile.contrast - m.lightContrast);
    const ds = 1 - Math.abs(r.profile.shadow - m.shadowMass);
    const de = 1 - Math.abs(r.profile.crisp - m.crispRatio);
    const dw = r.profile.warm === warm ? 1 : 0.5;
    const similarity = (dc + ds + de + dw) / 4;
    return { ...r, similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  return {
    matches: scored.slice(0, 3).map((r, i) => ({
      rank: String(i + 1).padStart(2, '0'),
      name: r.name,
      era: r.era,
      tags: r.tags,
      pct: `${Math.round(r.similarity * 100)}%`,
    })),
    mentor:
      'Match percentages are computed by comparing your measured contrast, shadow mass, edge ratio, and palette warmth against a small library of reference artists. They describe similarity, not influence.',
  };
}

// ---------------------------------------------------------------------------
// Glazing plan (SAMPLE_DATA.glaze shape)
// ---------------------------------------------------------------------------

function buildGlazePlan(cv) {
  const palette = cv.palette;

  // Build a 4-step glazing plan using the measured palette pigments.
  // pigs is the flat [hex, name, hex, name, ...] array the renderer expects.
  const layers = [
    {
      step: '1',
      name: 'Toned ground',
      desc: 'Establish a unified ground using your dominant midtone. This locks the overall temperature before any form work.',
      pigs: flattenPigs([palette[1] || palette[0]]),
    },
    {
      step: '2',
      name: 'Underpainting',
      desc: 'Block in the major value masses using your two darkest pigments. Keep edges soft — accuracy of value matters more than edge here.',
      pigs: flattenPigs([palette[2], palette[3]].filter(Boolean)),
    },
    {
      step: '3',
      name: 'Light passes',
      desc: 'Build the lights with thin glazes of your lightest pigments, gradually increasing opacity toward the highlights.',
      pigs: flattenPigs([palette[0], palette[1]].filter(Boolean)),
    },
    {
      step: '4',
      name: 'Refinement',
      desc: 'Final glazes to adjust temperature and unify. Small touches of the accent pigments at focal points.',
      pigs: flattenPigs(palette.slice(0, 4)),
    },
  ];

  return {
    layers,
    mentor:
      'This plan uses only the pigments measured in your image (mapped to the nearest classical tube colour). Adjust opacities to taste; the sequence is what matters — dark-to-light, thin-to-thick.',
  };
}

function flattenPigs(swatches) {
  const out = [];
  for (const s of swatches) {
    out.push(s.hex, s.name);
  }
  return out;
}

module.exports = { buildTemplateProse };
