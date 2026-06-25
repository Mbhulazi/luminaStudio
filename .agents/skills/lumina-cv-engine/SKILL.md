---
name: lumina-cv-engine
description: How the Lummina Studio deterministic computer-vision analysis pipeline works, and the integrity contract it enforces. Use whenever touching lumina-backend/src/analysis/cv/, adding or modifying a measurement (value, palette, edges, composition, lighting), changing the SAMPLE_DATA-compatible output contract, working on provenance, or investigating why a grade is "wrong". Also use when extending the pipeline with a new measured module.
---

# Lummina CV analysis engine

This is the heart of the product's integrity promise: **every grade and percentage the user sees is computed from their image's pixels, deterministically, and is reproducible.** The LLM interpreter (see `lumina-llm-interpreter`) may describe these numbers but can never override them.

Lives at `lumina-backend/src/analysis/cv/`.

## The integrity contract — do not break

1. **Determinism.** The same image bytes always produce the same grades. No randomness, no time-dependence, no model nondeterminism in this layer. The determinism test (`tests/unit/analysis.test.js`) asserts this; keep it green.
2. **Output shape matches the frontend renderer.** The `cv` object must contain: `scores {val,comp,edge,light}` (literal keys — the UI renders them as captions), `vmap.zones [{name,val,bar,c}]`, `comp.rules [{icon,name,desc,score}]`, `brush.stats [{lbl,val,sub}]`, `palette [{hex,name,share,rgb}]`. Do not rename keys without updating `app/lib/api.ts` and `app/components/AnalysisModules.tsx`.
3. **Provenance is mandatory.** Every measured module contributes a `provenance` entry describing the source method and thresholds. If you add a measurement, add its provenance. This is what powers the "How we measured this" UI — it's the honesty made visible.
4. **`crit.scores.val` is the headline grade.** It's derived from dynamic range (p99 − p1)/255 against fixed thresholds in `DYNAMIC_RANGE_GRADE`. Changing thresholds changes every user's grade — do it deliberately and document the before/after in the provenance block.

## The pipeline

`src/analysis/cv/index.js` `runCV(imageBuffer)` orchestrates:

1. **`loader.js`** — sharp decodes any format → raw RGBA at 600px long edge (`WORKING_SIZE`). Returns `{data, width, height, sha256}`. The sha256 is the dedupe/cache key.
2. **`value.js`** — Rec.601 luminance histogram (0.299/0.587/0.114, matching the client-side Grisaille grayscale). Produces percentiles, dynamic range, grade, and the 5 value zones.
3. **`palette.js`** — k-means (k=5) on a 100×100 downsample, centroids seeded from `SEED_CENTROIDS` (fixed, for determinism). Each centroid mapped to nearest classical pigment via `pigments.js`.
4. **`edges.js`** — Sobel L1 magnitude. Thresholds 60 (edge) and 120 (soft/crisp boundary). Produces density, soft/crisp ratio, grade, and the `brush.stats` array.
5. **`composition.js`** — 3×3 grid energy (per-cell luminance variance). Rule-of-thirds strength, left/right + top/bottom balance, central focal mass.
6. **`lighting.js`** — mean luminance per quadrant → dominant light direction + contrast → grade.

All analyzers take the same `{data, width, height}` shape from the loader. Each returns plain data — no side effects, no I/O.

## The pigment library

`pigments.js` holds the canonical 15-pigment classical oil palette (`PIGMENTS`) — this is the *same list* the frontend's Grisaille tool uses. `nearestPigment(r,g,b)` does squared-Euclidean RGB distance. When two pigments are close (Burnt vs Raw Sienna), nearest-wins is the desired behaviour. Do not split this list between client and server — they must agree or palette names diverge.

## Rec. 601 everywhere

Luminance weights `0.299 R / 0.587 G / 0.114 B` appear in `value.js`, `edges.js`, `composition.js`, and `lighting.js`. This matches the client-side Grisaille grayscale conversion so the server's value analysis and the client's value-study tool agree. If you ever "upgrade" to Rec. 709, change it everywhere or the two views will silently disagree.

## Adding a new measured module

1. Create `src/analysis/cv/<module>.js` exporting a function `(img) => result`. Pure, deterministic, no `Math.random()`.
2. Add it to `runCV` in `index.js` and merge its output into the `cv` object under a new key.
3. Add a `provenance.<module>` entry in `index.js` describing method + thresholds.
4. If the output should render in the UI, extend the `AnalysisResult` type in `app/lib/api.ts` and add a panel to `AnalysisModules.tsx`.
5. Add a determinism assertion to `tests/unit/analysis.test.js` (same image → same value for your new field).
6. If the LLM should interpret it, expose the measurement in `cv.measurements` so `template.js` and `prompt.js` can reference it.

## Tuning thresholds

Grades are threshold-based and the thresholds are documented in `provenance`. When tuning:
- Run the change against the sample portrait (`GET /api/analysis/sample`) and a few real uploads before/after.
- Update the `DYNAMIC_RANGE_GRADE` (or equivalent) array AND the provenance block in the same commit.
- The determinism test will still pass (deterministic ≠ correct); add a regression test pinning the new expected grade for a known fixture if you want to catch future drift.

## Common questions

- **"The value grade seems harsh/lenient."** It's `(p99−p1)/255` against fixed cut-points in `value.js`. Read `provenance.valueGrade.measured` in any analysis response to see the actual p1/p99/dynamic-range for that image. Adjust `DYNAMIC_RANGE_GRADE` thresholds if the scale is genuinely miscalibrated — but document why.
- **"Two uploads of the same image give different palettes."** They shouldn't — k-means uses fixed seeds. Check that `SEED_CENTROIDS` wasn't disturbed and that the loader is producing identical `data` (same working size, same rotation handling).
- **"Performance is slow on big images."** The loader caps at 600px; if it's still slow, the Sobel pass is the cost. Consider sampling the edge computation on a stride, not reducing working size (that changes grades).
