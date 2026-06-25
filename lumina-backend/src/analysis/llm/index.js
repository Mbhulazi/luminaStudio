/**
 * LLM interpreter — produces prose grounded in the cvPayload.
 *
 * Flow:
 *   1. Build the grounded prompt from cv measurements.
 *   2. Call the configured provider (openai/anthropic) — or skip straight
 *      to the template fallback if LLM_DRIVER=template (the default).
 *   3. Parse the response with zod. On any failure, fall back to template.
 *   4. MERGE: take prose from the LLM but ALWAYS keep the measured numbers
 *      (scores, zones, stats, palette) from cvPayload. The LLM may not
 *      override a single numeric field.
 *
 * This is the integrity guard. Even if a model hallucinates a grade, the
 * grade that reaches the user comes from cvPayload.scores — pixel math.
 */

const { z } = require('zod');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { buildGroundedPrompt } = require('./prompt');
const { buildTemplateProse } = require('./template');

// ---------------------------------------------------------------------------
// Response schema — what we expect the LLM to return
// ---------------------------------------------------------------------------

const llmResponseSchema = z.object({
  crit: z.object({
    blocks: z.array(z.object({ cat: z.string(), text: z.string() })).min(1),
    mentor: z.string(),
  }),
  vmap: z.object({ mentor: z.string() }).optional(),
  comp: z.object({ mentor: z.string() }).optional(),
  brush: z
    .object({
      mentor: z.string(),
      techs: z.array(z.object({ name: z.string(), desc: z.string() })).optional(),
    })
    .optional(),
  style: z
    .object({
      matches: z
        .array(
          z.object({
            rank: z.string(),
            name: z.string(),
            era: z.string(),
            tags: z.array(z.string()),
            pct: z.string(),
          })
        )
        .optional(),
      mentor: z.string(),
    })
    .optional(),
  glaze: z
    .object({
      layers: z
        .array(
          z.object({
            step: z.string(),
            name: z.string(),
            desc: z.string(),
            pigs: z.array(z.string()),
          })
        )
        .optional(),
      mentor: z.string(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * @param {object} cv           - the cvPayload from runCV()
 * @param {Buffer} imageBuffer  - the source image (for vision providers)
 * @returns {Promise<{ llm: object, source: 'llm' | 'template', error?: string }>}
 */
async function runLLM(cv, imageBuffer) {
  // Offline / default mode — no provider call.
  if (env.llm.driver === 'template' || env.isTest) {
    return { llm: buildTemplateProse(cv), source: 'template' };
  }

  try {
    const raw = await callProvider(cv, imageBuffer);
    const parsed = llmResponseSchema.parse(raw);
    // Merge prose onto the measured numbers — measured wins on any conflict.
    const merged = mergeWithMeasurements(parsed, cv);
    return { llm: merged, source: 'llm' };
  } catch (err) {
    logger.warn({ err: err.message, driver: env.llm.driver }, 'LLM interpretation failed — falling back to template');
    return {
      llm: buildTemplateProse(cv),
      source: 'template',
      error: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

async function callProvider(cv, imageBuffer) {
  const prompt = buildGroundedPrompt(cv);
  if (env.llm.driver === 'openai') return callOpenAI(prompt, imageBuffer);
  if (env.llm.driver === 'anthropic') return callAnthropic(prompt, imageBuffer);
  throw new Error(`Unknown LLM_DRIVER: ${env.llm.driver}`);
}

async function callOpenAI(prompt, imageBuffer) {
  const OpenAI = require('openai').default || require('openai');
  const client = new OpenAI({ apiKey: env.llm.openaiApiKey });

  const messages = [
    {
      role: 'system',
      content:
        'You are an atelier painting mentor. You return ONLY valid JSON, no prose outside the JSON object.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` },
        },
      ],
    },
  ];

  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(res.choices[0].message.content);
}

async function callAnthropic(prompt, imageBuffer) {
  const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.llm.anthropicApiKey });

  const res = await client.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return JSON.parse(res.content[0].text);
}

// ---------------------------------------------------------------------------
// Integrity merge — measured numbers always win
// ---------------------------------------------------------------------------

function mergeWithMeasurements(parsed, cv) {
  return {
    crit: {
      scores: cv.scores, // measured — never from LLM
      blocks: parsed.crit.blocks,
      mentor: parsed.crit.mentor,
    },
    vmap: {
      zones: cv.vmap.zones, // measured
      mentor: parsed.vmap?.mentor || '',
    },
    comp: {
      rules: cv.comp.rules, // measured
      mentor: parsed.comp?.mentor || '',
    },
    brush: {
      stats: cv.brush.stats, // measured
      techs: parsed.brush?.techs || [],
      mentor: parsed.brush?.mentor || '',
    },
    style: {
      matches: parsed.style?.matches || [],
      mentor: parsed.style?.mentor || '',
    },
    glaze: {
      layers: parsed.glaze?.layers || [],
      mentor: parsed.glaze?.mentor || '',
    },
  };
}

module.exports = { runLLM, llmResponseSchema };
