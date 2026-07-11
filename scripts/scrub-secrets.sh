#!/usr/bin/env bash
# ============================================================================
# scrub-secrets.sh — Replace real secret values in local .env files with
# placeholders, AFTER they've been imported into Doppler.
# ----------------------------------------------------------------------------
# This does NOT delete the files (they're useful templates). It neutralizes
# the real values so the file is no longer a leak vector. The original
# values live only in Doppler (and at the source provider, after rotation).
#
# Usage:
#   ./scripts/scrub-secrets.sh            # scrubs lumina-backend/.env.production
#   ./scripts/scrub-secrets.sh .env       # scrubs lumina-backend/.env
#
# DANGER: this is destructive to the local values. Run doppler-import.sh
# FIRST and confirm the secrets are in Doppler before running this.
# ============================================================================
set -euo pipefail

TARGET="${1:-lumina-backend/.env.production}"

if [ ! -f "$TARGET" ]; then
  echo "ERROR: $TARGET not found."
  exit 1
fi

# Make a timestamped backup first, in case something went wrong upstream.
BACKUP="${TARGET}.pre-scrub.$(date +%Y%m%d%H%M%S).bak"
cp "$TARGET" "$BACKUP"
echo "Backup written to: $BACKUP"
echo "  (review it, confirm Doppler has the values, then delete it)"

# Keys whose values must be scrubbed. Matches the rotate list in doppler.json.
SECRET_KEYS=(
  DATABASE_URL
  JWT_SECRET
  PAYFAST_MERCHANT_ID
  PAYFAST_MERCHANT_KEY
  PAYFAST_PASSPHRASE
  SMTP_HOST
  SMTP_USER
  SMTP_PASS
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
)

echo ""
echo "=== Scrubbing real values from $TARGET ==="

for key in "${SECRET_KEYS[@]}"; do
  # Replace the value after KEY= with a placeholder, preserving any inline comment.
  # Uses a temp file because sed -i behaves differently on GNU vs BSD.
  if grep -q "^${key}=" "$TARGET"; then
    sed -E -i \
      "s|^${key}=.*#${^}|${key}=<managed-in-doppler>          # |" \
      "$TARGET" 2>/dev/null || \
    sed -E -i \
      "s|^${key}=.*|${key}=<managed-in-doppler>|" \
      "$TARGET"
    echo "  scrubbed  $key"
  fi
done

echo ""
echo "=== Done. $TARGET now contains only placeholders for secrets. ==="
echo ""
echo "REMEMBER: the backup ($BACKUP) still has the real values."
echo "Delete it once you've confirmed Doppler has everything:"
echo "  rm $BACKUP"
