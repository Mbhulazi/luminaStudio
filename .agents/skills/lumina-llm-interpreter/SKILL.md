---
name: lumina-llm-interpreter
description: How the Lummina Studio LLM interpreter works and the grounding rules that keep it honest. Use whenever touching lumina-backend/src/analysis/llm/, the template fallback, the grounded prompt, the provider adapters (OpenAI/Anthropic), the merge guard, or the LLM_DRIVER env toggle. Also use when adding a provider, changing critique tone, investigating why prose fell back to template, or considering letting the LLM influence a numeric value (it must not).
---

# Lummina LLM interpreter

The LLM layer is **optional and subordinate** to the CV engine. It writes prose that *describes* the measured numbers; it can never invent or override a number. The product ships honest with the LLM disabled entirely (`LLM_DRIVER=template` is the default).

Lives at `lumina-backend/src/analysis/llm/`.

## The hierarchy — never invert it

```
CV measurements (deterministic, pixel-derived)   ← source of truth for all numbers
        │
        ▼
LLM interpreter (interprets numbers → prose)     ← source of truth for prose only
        │
        ▼
mergeWithMeasurements()                          ← numbers win on any conflict
        │
        ▼
Response to user (scores/zones/stats from CV, prose from LLM)
```

If you ever find yourself wanting the LLM to produce a grade or percentage, stop. That breaks the integrity promise. The LLM's job is interpretation, not measurement.

## The three modes

`env.llm.driver` (`LLM_DRIVER` env var):
- **`template`** (default) — `template.js` interpolates the real CV numbers into documented sentence templates. Offline, deterministic, zero cost. This is what ships.
- **`openai`** — `index.js` `callOpenAI` sends the grounded prompt + image to GPT-4o vision, parses JSON.
- **`anthropic`** — `callAnthropic` does the same with Claude 3.5 Sonnet.

In test mode (`env.isTest`), the template path is forced regardless of driver, so tests are deterministic and never make network calls.

## Key files

| File | Purpose |
|---|---|
| `index.js` | `runLLM(cv, imageBuffer)` — the entry point. Dispatches to provider, catches all failures, falls back to template. `mergeWithMeasurements()` is the integrity guard. |
| `template.js` | `buildTemplateProse(cv)` — the always-available honest fallback. Every sentence references a real measurement. |
| `prompt.js` | `buildGroundedPrompt(cv)` — injects CV numbers as "MEASURED FACTS — do NOT contradict" and demands strict JSON. |

## The merge guard (`mergeWithMeasurements`)

This is the single most important function in the file. It takes the LLM's parsed output and the CV payload, and returns an object where:
- `crit.scores`, `vmap.zones`, `comp.rules`, `brush.stats` come **from CV** (measured)
- `crit.blocks`, all `mentor` strings, `style.matches`, `glaze.layers`, `brush.techs` come **from the LLM** (prose)

If the LLM returns a `scores` field, it's discarded. If it returns `zones`, discarded. The guard is structural, not a validation — it simply doesn't read those fields from the LLM output.

**Never relax this.** If a future feature needs the LLM to suggest a "target grade," that's a new prose field ("mentor suggests aiming for…"), not an override of the measured grade.

## Fallback behaviour

`runLLM` catches everything: provider errors, network failures, JSON parse failures, zod schema mismatches. On any failure it logs a warning and returns `{ llm: buildTemplateProse(cv), source: 'template', error }`. The route records `proseSource` on the response so the frontend can show the provenance badge ("Prose: template-grounded" vs "AI-interprested"). The user always gets a complete, honest analysis either way.

## Wiring a new provider

1. Add a `callX(prompt, imageBuffer)` function in `index.js` mirroring `callOpenAI`/`callAnthropic`: build the request, send, parse JSON from the response text.
2. Add a branch in `callProvider`.
3. Add the driver name to the `LLM_DRIVER` env handling.
4. The response MUST be JSON-parseable and zod-validatable against `llmResponseSchema`. If the provider won't return strict JSON, wrap it — don't weaken the schema.
5. Lazy-`require()` the provider SDK inside the call function (like Supabase in storage.service) so dev/test never loads it.

## Tuning the template prose

`template.js` is the voice of the product when the LLM is off (which is the default). Guidelines:
- Every sentence should reference a real number from `cv.measurements` — that's what makes it honest. Use `${(m.shadowMass * 100).toFixed(0)}%` etc.
- Speak to the artist in second person, like an atelier mentor.
- Be specific and practical ("push shadows toward p1=42") not vague ("improve your values").
- The `buildStyleMatches` reference library is small and intentional. Match scores are real similarity computations against `cv.measurements` (contrast, shadow mass, edge ratio, palette warmth) — not endorsements. The mentor note says so explicitly.

## When the LLM is enabled: cost & safety

- `env.llm.maxCostCents` (`LLM_MAX_COST_CENTS`, default 50) is a hard ceiling. The route should check estimated cost before calling; if you implement real cost tracking, abort to template fallback when the ceiling is hit.
- Vision calls send the image bytes. The image is the user's portrait — only send to the configured provider, never log the base64, never cache it outside the request.
- The analysis route rate-limits at 5/min (`analysisLimiter` in server.js) partly to bound LLM cost from a buggy client loop.

## Common questions

- **"Prose is always template even though I set LLM_DRIVER=openai."** Check `OPENAI_API_KEY` is set. Check the provider call isn't throwing (logs show `'LLM interpretation failed — falling back to template'`). In test mode the template path is forced — run outside tests to exercise the provider.
- **"The LLM said the value grade was B but the UI shows A."** Correct — that's the merge guard working. The grade is measured; the LLM's opinion is discarded. If this happens a lot, tighten the prompt to tell the model not to assert grades at all.
- **"I want richer critique."** Increase `max_tokens` in the provider call and/or extend the prompt's requested schema. Keep the merge guard intact.
