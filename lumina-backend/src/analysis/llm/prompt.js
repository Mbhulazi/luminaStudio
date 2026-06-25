/**
 * Builds the structured prompt that grounds the LLM interpreter in the REAL
 * cvPayload measurements.
 *
 * The prompt explicitly tells the model:
 *   1. The numbers below are measured facts — do not invent or contradict them.
 *   2. Your job is to interpret, not measure.
 *   3. Return strict JSON matching the requested schema.
 *
 * The image is also sent (when the provider supports vision) so prose can
 * reference composition/lighting observed visually — but every numeric
 * claim must trace back to the cvPayload.
 */

function buildGroundedPrompt(cv) {
  const m = cv.measurements;
  const p = cv.palette;

  const facts = `MEASURED FACTS (computed from the user's pixels — do NOT contradict these):
- Value grade: ${cv.scores.val} (dynamic range ${(m.dynamicRange * 100).toFixed(0)}%)
- Lighting grade: ${cv.scores.light} (direction: ${m.lightDirection}, contrast ${(m.lightContrast * 100).toFixed(0)}%)
- Edge grade: ${cv.scores.edge} (${(m.softRatio * 100).toFixed(0)}% soft / ${(m.crispRatio * 100).toFixed(0)}% crisp, density ${(m.edgeDensity * 100).toFixed(0)}%)
- Composition: rule-of-thirds strength ${(m.thirdsStrength * 100).toFixed(0)}%, central mass ${(m.centerEnergy * 100).toFixed(0)}%
- Shadow mass: ${(m.shadowMass * 100).toFixed(0)}% of frame; highlight mass: ${(m.highlightMass * 100).toFixed(0)}%
- Luminance percentiles: p1=${m.percentiles.p1}, p50=${m.percentiles.p50}, p99=${m.percentiles.p99}
- Dominant palette pigments: ${p.map((s) => `${s.name} (${s.hex}, ${s.share}% of frame)`).join('; ')}`;

  const instructions = `You are an experienced atelier painting mentor reviewing a portrait reference. Write a critique that interprets the measured facts above. Speak directly to the artist in second person. Be specific and practical — reference the actual numbers where relevant. Never invent a number; if a claim isn't grounded in the facts, leave it out.

Return ONLY a JSON object with this exact shape:
{
  "crit": {
    "blocks": [{ "cat": "Value structure|Lighting|Edges|Composition", "text": "2-3 sentence grounded observation" }],
    "mentor": "one-sentence next-step"
  },
  "vmap": { "mentor": "one-sentence note on the value distribution" },
  "comp": { "mentor": "one-sentence note on the composition" },
  "brush": { "mentor": "one-sentence note on the edges", "techs": [{ "name": "short", "desc": "one-sentence technique suggestion grounded in the edge ratio" }] },
  "style": {
    "matches": [{ "rank": "01", "name": "Artist", "era": "School · years", "tags": ["tag"], "pct": "NN%" }],
    "mentor": "one-sentence note that match % means similarity, not influence"
  },
  "glaze": {
    "layers": [{ "step": "1", "name": "stage name", "desc": "instruction", "pigs": ["#hex","Pigment Name"] }],
    "mentor": "one-sentence note"
  }
}`;

  return `${facts}\n\n${instructions}`;
}

module.exports = { buildGroundedPrompt };
