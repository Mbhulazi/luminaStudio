const env = require('../config/env');

/**
 * USD is the standard currency for every price stored in the database
 * (Payment.amountUsd, plan price tables, etc). This service only handles
 * *display/charging* conversion for South African customers paying in ZAR.
 *
 * IMPORTANT: this uses a fixed fallback rate from .env, not a live feed.
 * For production, replace getUsdToZarRate() with a call to a real FX API
 * (e.g. https://exchangerate.host or Open Exchange Rates), cached for a
 * few hours so you're not hitting it on every request. Never let the
 * *charged* amount drift between when it's shown to the user and when
 * PayFast actually processes it — lock the rate at checkout-session
 * creation time and store it on the Payment record (see payments.routes.js).
 */
async function getUsdToZarRate() {
  // TODO production: fetch + cache a real rate here.
  return env.usdToZarFallbackRate;
}

async function usdToZar(usdAmount) {
  const rate = await getUsdToZarRate();
  return Math.round(usdAmount * rate * 100) / 100;
}

module.exports = { getUsdToZarRate, usdToZar };
