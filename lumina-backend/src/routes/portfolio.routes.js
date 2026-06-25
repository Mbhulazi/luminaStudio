const express = require('express');
const multer = require('multer');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { portfolioCreateSchema } = require('../config/schemas');
const storage = require('../services/storage.service');
const { normalizeImage, UploadError } = require('../services/image.service');

const router = express.Router();

// Multipart parser: hold the whole file in memory (max 8 MB). We normalize
// with sharp before persisting, so we don't want disk landing of raw uploads.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(new UploadError('Only JPEG, PNG, or WebP images are accepted.'));
  },
});

// Matches the pricing page: free=3/month, atelier=30/month, master=unlimited.
const MONTHLY_ANALYSIS_LIMIT = { free: 3, atelier: 30, master: Infinity };

function periodHasExpired(user) {
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(user.periodResetAt).getTime() > oneMonthMs;
}

// All routes below require a valid token. There is no "list everyone's
// portfolio" route here on purpose — see admin.routes.js for the one
// endpoint that allows cross-user reads, and only for role=admin.
router.use(requireAuth);

// GET /api/portfolio — only ever returns the CALLER's own items. The
// userId filter comes from req.user (set by requireAuth from the verified
// token), never from a query param or request body, so there is no way
// for user A to pass user B's id and read their portfolio.
router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.portfolioItem.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(portfolioCreateSchema), async (req, res, next) => {
  try {
    const user = req.user;
    if (periodHasExpired(user)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { analysesUsedThisPeriod: 0, periodResetAt: new Date() },
      });
      user.analysesUsedThisPeriod = 0;
    }
    const limit = MONTHLY_ANALYSIS_LIMIT[user.tier];
    if (user.role !== 'admin' && user.analysesUsedThisPeriod >= limit) {
      return res.status(403).json({
        error: `You've used all ${limit} analyses included in your ${user.tier} plan this month. Upgrade for more.`,
        requiredTier: 'atelier',
      });
    }

    const { title, skillTier, scores, thumbnail } = req.body;

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.portfolioItem.create({
        data: { userId: user.id, title, skillTier, scores, thumbnail },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { analysesUsedThisPeriod: { increment: 1 } },
      });
      return created;
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/portfolio/:id — the where clause includes userId, so this
// query simply returns "not found" for an item that exists but belongs to
// someone else, rather than ever exposing or deleting another user's data.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await prisma.portfolioItem.deleteMany({
      where: { id, userId: req.user.id },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Portfolio item not found.' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portfolio/upload
 *
 * Accepts a single image upload (multipart/form-data, field "image"),
 * normalizes it via sharp (strips EXIF, caps dimensions at 2000px, re-encodes
 * as JPEG), stores it in object storage, and returns a signed URL the
 * frontend can render.
 *
 * The returned `uploadId` is a storage key — pass it to POST /api/analysis
 * to run the real analysis against this image.
 *
 * Auth required (free tier can upload references; analysis is rate-limited).
 */
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided. Attach a file under the "image" field.' });
    }

    const { buffer, mime, width, height } = await normalizeImage(req.file.buffer);
    const { key, url, sha256 } = await storage.uploadImage(buffer, mime);

    res.status(201).json({
      uploadId: key,
      url,
      sha256,
      width,
      height,
      mime,
    });
  } catch (err) {
    // Multer / sharp / UploadError all bubble up as 400s with publicMessage.
    if (err instanceof UploadError || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.publicMessage || err.message });
    }
    next(err);
  }
});

module.exports = router;
