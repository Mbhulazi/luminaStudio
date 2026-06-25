const { z } = require('zod');

// ---------------------------------------------------------------------------
// Validation middleware — drops invalid requests before they hit route logic
// ---------------------------------------------------------------------------

/**
 * Express middleware factory. Pass a Zod schema (object shape for body).
 * Returns 400 with a readable message on failure; calls next() on success.
 *
 * Usage:
 *   const { body } = require('../middleware/validate');
 *   router.post('/signup', body(signupSchema), handler);
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Flatten zod errors into a single readable string for the client.
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return res.status(400).json({ error: message });
    }
    // Replace req.body with the parsed (coerced) output so downstream
    // handlers get clean, typed data.
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody, z };
