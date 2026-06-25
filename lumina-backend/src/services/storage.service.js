const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Image storage service — env-driven adapter.
 *
 * Drivers:
 *   - "local"    (dev): writes files to disk under STORAGE_LOCAL_DIR and
 *                       serves them via the backend's /uploads route.
 *   - "supabase" (prod): uploads to a private Supabase Storage bucket and
 *                       returns a signed URL the frontend can load directly.
 *
 * Both drivers expose the same interface:
 *   uploadImage(buffer, mime, opts?)  -> { key, url, sha256 }
 *   getSignedUrl(key)                 -> string (valid for urlTtlSeconds)
 *   deleteImage(key)                  -> void
 */

const URL_TTL_SECONDS = 24 * 60 * 60; // 24h signed URL

// ---------------------------------------------------------------------------
// Local driver
// ---------------------------------------------------------------------------

const LocalDriver = {
  async uploadImage(buffer, mime, opts = {}) {
    const fs = require('fs').promises;
    const dir = path.resolve(process.cwd(), env.storage.localDir);
    await fs.mkdir(dir, { recursive: true });

    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = (opts.ext || mimeToExt(mime)) || 'bin';
    // Include a short timestamp + random so two uploads of the same image
    // don't collide (the sha alone would dedupe — but we want distinct rows).
    const filename = `${sha.slice(0, 16)}-${Date.now().toString(36)}-${randomId(4)}.${ext}`;
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buffer);

    const key = `local/${filename}`;
    return { key, url: `/uploads/${filename}`, sha256: sha };
  },

  async getSignedUrl(key) {
    // Local files are served directly by Express static middleware.
    if (key.startsWith('local/')) return key.replace('local/', '/uploads/');
    return key;
  },

  async getImageBytes(key) {
    const fs = require('fs').promises;
    const filename = key.replace('local/', '');
    const fullPath = path.resolve(process.cwd(), env.storage.localDir, filename);
    return fs.readFile(fullPath);
  },

  async deleteImage(key) {
    if (!key.startsWith('local/')) return;
    const fs = require('fs').promises;
    const filename = key.replace('local/', '');
    const fullPath = path.resolve(process.cwd(), env.storage.localDir, filename);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn({ err }, 'Failed to delete local image');
    }
  },
};

// ---------------------------------------------------------------------------
// Supabase driver
// ---------------------------------------------------------------------------

let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  // Lazy require so the Supabase SDK is only loaded when actually needed —
  // keeps dev (local driver) and test mode free of its module-load cost.
  const { createClient } = require('@supabase/supabase-js');
  supabaseClient = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
  return supabaseClient;
}

const SupabaseDriver = {
  async uploadImage(buffer, mime, opts = {}) {
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = (opts.ext || mimeToExt(mime)) || 'bin';
    const filename = `${sha.slice(0, 16)}-${Date.now().toString(36)}-${randomId(4)}.${ext}`;
    const key = `portraits/${filename}`;

    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from(env.supabase.bucket)
      .upload(key, buffer, { contentType: mime, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    const { data } = await supabase.storage
      .from(env.supabase.bucket)
      .createSignedUrl(key, URL_TTL_SECONDS);
    return { key, url: data?.signedUrl || '', sha256: sha };
  },

  async getSignedUrl(key) {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(env.supabase.bucket)
      .createSignedUrl(key, URL_TTL_SECONDS);
    if (error) throw new Error(`Supabase signed URL failed: ${error.message}`);
    return data.signedUrl;
  },

  async getImageBytes(key) {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(env.supabase.bucket)
      .download(key);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  async deleteImage(key) {
    const supabase = getSupabase();
    const { error } = await supabase.storage.from(env.supabase.bucket).remove([key]);
    if (error) logger.warn({ err: error.message, key }, 'Failed to delete Supabase image');
  },
};

// ---------------------------------------------------------------------------
// Helpers + public API
// ---------------------------------------------------------------------------

function mimeToExt(mime) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[mime] || null;
}

function randomId(len) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function getDriver() {
  return env.storage.driver === 'supabase' ? SupabaseDriver : LocalDriver;
}

module.exports = {
  uploadImage: (buffer, mime, opts) => getDriver().uploadImage(buffer, mime, opts),
  getSignedUrl: (key) => getDriver().getSignedUrl(key),
  getImageBytes: (key) => getDriver().getImageBytes(key),
  deleteImage: (key) => getDriver().deleteImage(key),
};
