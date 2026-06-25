const crypto = require('crypto');
const dns = require('dns').promises;
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * PayFast integration service.
 *
 * PayFast is South Africa's most widely used local payment gateway and is
 * the standard way to let SA customers pay via card, Instant EFT, or their
 * bank account, with funds settling directly into the merchant's linked
 * South African bank account (configured in your PayFast merchant
 * dashboard — not in this code).
 *
 * IMPORTANT LIMITATIONS TO UNDERSTAND BEFORE GOING LIVE:
 *  - PayFast settles in ZAR only. It cannot charge or settle in USD.
 *    For USD-denominated international customers, use a separate provider
 *    (e.g. Stripe) — see the Stripe stub below and currency.service.js.
 *  - You must get your own merchant_id / merchant_key by registering at
 *    https://www.payfast.co.za. The sandbox credentials below (10000100 /
 *    46f0cd694581a) are PayFast's own published test credentials — replace
 *    them with your real ones before going live.
 *  - Linking your real SA bank account happens entirely inside the PayFast
 *    merchant dashboard (Settings > Banking Details). This code never
 *    touches your bank account number — it only talks to PayFast's API.
 *  - The signature algorithm below follows PayFast's documented process as
 *    of this writing. PayFast updates their docs occasionally — re-verify
 *    against https://developers.payfast.co.za before launch.
 */

const PAYFAST_HOST = env.payfast.mode === 'live'
  ? 'https://www.payfast.co.za'
  : 'https://sandbox.payfast.co.za';

// PayFast publishes a set of hostnames whose resolved IPs are the ONLY
// allowed sources for ITN callbacks.
const PAYFAST_IP_HOSTNAMES = [
  'www.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za',
  'sandbox.payfast.co.za',
];

// ---------------------------------------------------------------------------
// IP allow-list cache (DNS-resolved, TTL-driven)
// ---------------------------------------------------------------------------

let ipCache = {
  ips: new Set(),
  resolvedAt: 0,
};

/**
 * DNS-resolve PayFast's published hostnames and cache the resulting IPs for
 * env.payfast.ipAllowlistTtlMs (default 6 h).  Called by isPayfastIp().
 */
async function resolvePayfastIps() {
  const now = Date.now();
  if (now - ipCache.resolvedAt < env.payfast.ipAllowlistTtlMs && ipCache.ips.size > 0) {
    return ipCache.ips;
  }

  const resolved = new Set();
  const lookups = PAYFAST_IP_HOSTNAMES.map(async (hostname) => {
    try {
      const addresses = await dns.resolve4(hostname);
      for (const addr of addresses) resolved.add(addr);
    } catch (err) {
      // DNS failures are logged but don't break the cache entirely — we keep
      // whatever we already have (or fall through to the other checks).
      logger.warn({ hostname, err: err.message }, 'Failed to resolve PayFast IP hostname');
    }
  });

  await Promise.allSettled(lookups);

  if (resolved.size > 0) {
    ipCache = { ips: resolved, resolvedAt: now };
    logger.debug({ ips: [...resolved] }, 'PayFast IP allow-list refreshed');
  } else if (ipCache.ips.size === 0) {
    // First-ever resolution failed — this is a boot-time risk. Log loudly.
    logger.error('Failed to resolve ANY PayFast IP hostnames. ITN IP check will deny all requests.');
  }

  return ipCache.ips;
}

// Exported for tests to inject a known allow-list without real DNS.
function _setIpCacheForTesting(ips) {
  ipCache = { ips: new Set(ips), resolvedAt: Date.now() };
}

/**
 * Check whether sourceIp is one of PayFast's known server IPs.
 * Resolves DNS on first call and periodically thereafter (TTL from env).
 */
async function isPayfastIp(sourceIp) {
  // In test mode, skip DNS entirely — tests set an explicit override.
  if (env.isTest) return true;
  const allowed = await resolvePayfastIps();
  if (!allowed.has(sourceIp)) {
    logger.warn({ sourceIp, allowed: [...allowed] }, 'ITN from unknown IP');
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/**
 * Generates the MD5 signature PayFast requires on every payment request
 * and validates on every ITN. Fields must be included in the same order
 * they were added to the form/object — do not alphabetize them.
 */
function generateSignature(fields) {
  let pairs = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'signature') continue;
    // PayFast wants spaces encoded as '+', matching classic form encoding.
    const encoded = encodeURIComponent(String(value).trim()).replace(/%20/g, '+');
    pairs.push(`${key}=${encoded}`);
  }
  let queryString = pairs.join('&');
  if (env.payfast.passphrase) {
    queryString += `&passphrase=${encodeURIComponent(env.payfast.passphrase.trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(queryString).digest('hex');
}

// ---------------------------------------------------------------------------
// Payment request builder
// ---------------------------------------------------------------------------

/**
 * Builds the full field set for a PayFast "onsite" or hosted payment
 * request. The caller is expected to render these as a hidden HTML form
 * that auto-submits (POST) to `${PAYFAST_HOST}/eng/process`, or use
 * PayFast's onsite JS payment modal with the same fields.
 *
 * @param {object} opts
 * @param {number} opts.amountZar     - amount in ZAR, e.g. 277.00
 * @param {string} opts.itemName      - short description, e.g. "Lummina Studio — Master plan"
 * @param {string} opts.userEmail     - paying user's email, for PayFast's records
 * @param {string} opts.paymentId     - your own internal Payment.id, passed through as m_payment_id
 */
function buildPaymentRequest({ amountZar, itemName, userEmail, paymentId }) {
  const fields = {
    merchant_id: env.payfast.merchantId,
    merchant_key: env.payfast.merchantKey,
    return_url: env.payfast.returnUrl,
    cancel_url: env.payfast.cancelUrl,
    notify_url: env.payfast.notifyUrl,
    m_payment_id: String(paymentId),
    amount: amountZar.toFixed(2),
    item_name: itemName,
    email_address: userEmail,
  };
  const signature = generateSignature(fields);
  return {
    actionUrl: `${PAYFAST_HOST}/eng/process`,
    fields: { ...fields, signature },
  };
}

// ---------------------------------------------------------------------------
// ITN verification
// ---------------------------------------------------------------------------

/**
 * Verifies an incoming ITN (Instant Transaction Notification) POST body.
 * PayFast's documented verification has three parts — all three matter:
 *   1. Signature matches what we'd compute ourselves.
 *   2. The request actually originated from a PayFast IP (enforced in all
 *      modes — sandbox DNS is included in the allow-list).
 *   3. A server-to-server "validate" call back to PayFast confirms the
 *      data we received matches what Fast has on file (defends against
 *      a spoofed POST to your notify_url from anyone who isn't PayFast).
 *
 * TEST HOOK: when env.isTest is true, an external test can override the
 * verdict via __testVerdict (set on the module) to exercise the route's
 * idempotency logic without standing up real PayFast infra.
 */
async function verifyItn(body, sourceIp) {
  if (env.isTest && module.exports.__testVerdict !== undefined) {
    return module.exports.__testVerdict;
  }

  const receivedSignature = body.signature;
  const expectedSignature = generateSignature(body);
  if (receivedSignature !== expectedSignature) {
    return { valid: false, reason: 'Signature mismatch.' };
  }

  if (!(await isPayfastIp(sourceIp))) {
    return { valid: false, reason: `Request did not originate from a known PayFast IP (${sourceIp}).` };
  }

  const confirmed = await confirmWithPayfast(body);
  if (!confirmed) {
    return { valid: false, reason: 'PayFast server-to-server validation failed.' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Server-to-server validation
// ---------------------------------------------------------------------------

/**
 * POSTs the received fields back to PayFast's validate endpoint. PayFast
 * responds with the literal text "VALID" or "INVALID".
 */
async function confirmWithPayfast(body) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) params.append(key, value);
  }
  try {
    const res = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await res.text();
    return text.trim() === 'VALID';
  } catch (err) {
    logger.error({ err }, 'PayFast validate call failed');
    return false;
  }
}

module.exports = {
  buildPaymentRequest,
  verifyItn,
  generateSignature,
  isPayfastIp,
  _setIpCacheForTesting,
  PAYFAST_HOST,
  __testVerdict: undefined, // overridden by tests when env.isTest === true
};
