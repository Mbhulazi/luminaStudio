const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { z } = require('zod');
const storage = require('../services/storage.service');
const { runCV, ImageLoadError } = require('../analysis/cv');
const { runLLM } = require('../analysis/llm');
const logger = require('../utils/logger');

const router = express.Router();

// Mirror the portfolio tier limits — analyses are the metered resource.
const MONTHLY_LIMIT = { free: 3, atelier: 50, master: 1000 };

// --- Public sample endpoint (registered BEFORE /:id so the path wins) -----
// Honest demo: runs the same CV pipeline as authenticated analyses, on a
// fixed bundled image. No auth, no quota. Cached in-process for 1 hour.
let sampleCache = null;
let sampleCacheAt = 0;
const SAMPLE_TTL_MS = 60 * 60 * 1000;

router.get('/sample', async (req, res, next) => {
  try {
    const now = Date.now();
    if (sampleCache && now - sampleCacheAt < SAMPLE_TTL_MS) {
      return res.json(sampleCache);
    }

    const samplePath = path.resolve(__dirname, '..', '..', 'public', 'samples', 'portrait.jpg');
    const buffer = fs.readFileSync(samplePath);

    const cvResult = await runCV(buffer);
    const { llm } = await runLLM(cvResult.cv, buffer);

    sampleCache = {
      id: 'sample',
      imageUrl: '/samples/portrait.jpg',
      imageHash: cvResult.sha256,
      analysis: {
        crit: { scores: cvResult.cv.scores, blocks: llm.crit.blocks, mentor: llm.crit.mentor },
        vmap: { zones: cvResult.cv.vmap.zones, mentor: llm.vmap.mentor },
        comp: { rules: cvResult.cv.comp.rules, mentor: llm.comp.mentor },
        brush: { stats: cvResult.cv.brush.stats, techs: llm.brush.techs, mentor: llm.brush.mentor },
        style: llm.style,
        glaze: llm.glaze,
      },
      palette: cvResult.cv.palette,
      provenance: cvResult.provenance,
      proseSource: 'template',
      isSample: true,
    };
    sampleCacheAt = now;
    res.json(sampleCache);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  uploadId: z.string().min(1, 'uploadId (from /api/portfolio/upload) is required.'),
  skillTier: z.enum(['beginner', 'intermediate', 'master']).default('beginner'),
  portfolioItemId: z.number().int().positive().optional(),
});

/**
 * POST /api/analysis
 *
 * Runs the honest analysis pipeline against a previously-uploaded image:
 *   1. Fetch image bytes from storage.
 *   2. runCV — every numeric value, deterministic per image.
 *   3. runLLM — interpreted prose grounded in those numbers (template fallback).
 *   4. Persist an Analysis row (cvPayload, llmPayload, provenance).
 *   5. Return the combined object + provenance.
 *
 * Tier-metered: each call consumes one of the user's monthly analyses.
 */
router.post('/', requireAuth, validateBody(createSchema), async (req, res, next) => {
  try {
    const user = req.user;
    const { uploadId, skillTier, portfolioItemId } = req.body;

    // --- Tier quota check (mirrors portfolio.routes logic) ----------------
    const limit = MONTHLY_LIMIT[user.tier] ?? MONTHLY_LIMIT.free;
    if (user.role !== 'admin' && user.analysesUsedThisPeriod >= limit) {
      return res.status(403).json({
        error: `You've used all ${limit} analyses included in your ${user.tier} plan this month.`,
        requiredTier: user.tier === 'free' ? 'atelier' : 'master',
      });
    }

    // --- Fetch the image --------------------------------------------------
    let imageBuffer;
    try {
      imageBuffer = await storage.getImageBytes(uploadId);
    } catch (err) {
      logger.error({ err: err.message, uploadId }, 'Analysis: getImageBytes failed');
      return res.status(404).json({ error: `Source image not found. It may have expired. (${err.message})` });
    }

    // --- Run CV (deterministic, always succeeds for valid images) ---------
    let cvResult;
    try {
      cvResult = await runCV(imageBuffer);
    } catch (err) {
      if (err instanceof ImageLoadError) {
        return res.status(400).json({ error: err.publicMessage });
      }
      logger.error({ err: err.message, stack: err.stack }, 'Analysis: runCV failed');
      return res.status(500).json({ error: `Image analysis failed: ${err.message}` });
    }

    // --- Create the pending Analysis row ----------------------------------
    const analysis = await prisma.analysis.create({
      data: {
        userId: user.id,
        portfolioItemId: portfolioItemId || null,
        sourceImageKey: uploadId,
        imageHash: cvResult.sha256,
        status: 'pending',
        cvPayload: cvResult.cv,
        provenance: cvResult.provenance,
      },
    });

    // --- Run LLM interpreter (with template fallback) ---------------------
    const { llm, source, error: llmError } = await runLLM(cvResult.cv, imageBuffer);

    // --- Finalize the row -------------------------------------------------
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'complete',
        llmPayload: llm,
        completedAt: new Date(),
      },
    });

    // --- Increment the user's analysis count ------------------------------
    if (user.role !== 'admin') {
      await prisma.user.update({
        where: { id: user.id },
        data: { analysesUsedThisPeriod: { increment: 1 } },
      });
    }

    if (llmError) {
      logger.info({ analysisId: analysis.id, error: llmError }, 'Analysis completed via template fallback');
    }

    // --- Return the combined contract -------------------------------------
    // Merged object: measured numbers from cvPayload + interpreted prose
    // from llmPayload. The frontend's existing renderers consume this shape.
    res.status(201).json({
      id: analysis.id,
      skillTier,
      imageHash: cvResult.sha256,
      analysis: mergeContract(cvResult.cv, llm),
      palette: cvResult.cv.palette,
      provenance: cvResult.provenance,
      proseSource: source, // 'llm' | 'template' — surfaced for transparency
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analysis/:id
 * Returns a previously-run analysis by id (must belong to the caller).
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const analysis = await prisma.analysis.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!analysis) return res.status(404).json({ error: 'Analysis not found.' });

    res.json({
      id: analysis.id,
      status: analysis.status,
      imageHash: analysis.imageHash,
      analysis: analysis.status === 'complete'
        ? mergeContract(analysis.cvPayload, analysis.llmPayload || {})
        : null,
      palette: analysis.cvPayload?.palette || [],
      provenance: analysis.provenance,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analysis
 * Lists the caller's analyses (most recent first).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.analysis.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        imageHash: true,
        createdAt: true,
        completedAt: true,
        sourceImageKey: true,
      },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Merge cv measurements + llm prose into the frontend contract shape.
// This is where the integrity guard is enforced at the response boundary:
// every numeric field comes from cv; only prose comes from llm.
// ---------------------------------------------------------------------------
function mergeContract(cv, llm) {
  return {
    crit: {
      scores: cv.scores,
      blocks: llm.crit?.blocks || [],
      mentor: llm.crit?.mentor || '',
    },
    vmap: {
      zones: cv.vmap.zones,
      mentor: llm.vmap?.mentor || '',
    },
    comp: {
      rules: cv.comp.rules,
      mentor: llm.comp?.mentor || '',
    },
    brush: {
      stats: cv.brush.stats,
      techs: llm.brush?.techs || [],
      mentor: llm.brush?.mentor || '',
    },
    style: llm.style || { matches: [], mentor: '' },
    glaze: llm.glaze || { layers: [], mentor: '' },
  };
}

/**
 * GET /api/analysis/sample
 *
 * (Registered at the top of this file, before /:id — see comment there.
 * This stub kept only to preserve the original doc location.)
 */

module.exports = router;
