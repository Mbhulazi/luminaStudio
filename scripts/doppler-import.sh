#!/usr/bin/env bash
# ============================================================================
# doppler-import.sh — ONE-SHOT. Import production secrets into Doppler, then
# DELETE THIS FILE and the plaintext .env.production it reads from.
# ----------------------------------------------------------------------------
# Run ONCE after:
#   1. You've run `doppler login`
#   2. You've created the `lummina-studio` project in Doppler (prod config)
#
# Usage:
#   cd lumina-backend
#   DOPPLER_TOKEN="<a service token from Doppler>" ../scripts/doppler-import.sh
#
# Or, if you've run `doppler login` interactively:
#   ../scripts/doppler-import.sh
#
# After it succeeds:
#   - Verify the secrets are visible in the Doppler dashboard
#   - Run scrub-secrets.sh to strip the real values out of local files
#   - DELETE this script
# ============================================================================
set -euo pipefail

ENV_FILE="${1:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run from lumina-backend/ or pass the path."
  echo "  Usage: $0 <path-to-env-production>"
  exit 1
fi

if ! command -v doppler >/dev/null 2>&1 && [ -x "$HOME/bin/doppler.exe" ]; then
  PATH="$HOME/bin:$PATH"
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "ERROR: doppler CLI not on PATH. Install it first:"
  echo "  https://docs.doppler.com/docs/install-cli"
  exit 1
fi

echo "=== Doppler CLI found ==="
doppler --version
echo ""
echo "=== Reading secrets from $ENV_FILE ==="
echo "    (values NOT printed here — they're piped straight to Doppler)"
echo ""

# Parse .env.production: skip comments and blanks, strip inline comments,
# and feed each KEY=VALUE to `doppler secrets set`. We read the file once
# into an associative set of KEY=VALUE lines to handle values containing
# spaces (the PayFast passphrase has spaces).
SECRETS_FILE="$(mktemp)"
trap 'rm -f "$SECRETS_FILE"' EXIT

while IFS='=' read -r key rest || [ -n "$key" ]; do
  # Skip blank lines and comments (# ...)
  case "$key" in
    ''|\#*) continue ;;
  esac
  # Strip a leading "export " if present
  key="${key#export }"
  # `rest` is everything after the first '=' — the raw value, which may
  # contain spaces (e.g. the PayFast passphrase) and inline " # comment".
  # We strip trailing inline comments only if they're preceded by whitespace.
  # Be conservative: keep the value verbatim up to a " #" marker.
  value="${rest%% #*}"
  # Trim leading/trailing whitespace from the value
  value="$(echo -n "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  # Skip placeholder values we never want to import
  case "$value" in
    \<*\>) echo "  skip  $key  (still a placeholder: $value)"; continue ;;
    '')    echo "  skip  $key  (empty)";                       continue ;;
  esac
  printf '%s=%s\n' "$key" "$value" >> "$SECRETS_FILE"
done < "$ENV_FILE"

echo ""
echo "=== Pushing to Doppler (config: prod) ==="
# Use --no-file to read from stdin in bulk. Doppler accepts KEY=VALUE lines.
doppler secrets set --config prod --no-file < "$SECRETS_FILE"

echo ""
echo "=== Done. Verify in the dashboard: ==="
echo "    https://dashboard.doppler.com/workplace"
echo ""
echo "=== Next steps ==="
echo "  1. Confirm the secrets above are present in Doppler (prod config)"
echo "  2. Run scrub-secrets.sh to strip real values from local files"
echo "  3. DELETE this script (scripts/doppler-import.sh)"
echo "  4. Wire up Render/Vercel via the Doppler integrations (see SECRETS.md)"
