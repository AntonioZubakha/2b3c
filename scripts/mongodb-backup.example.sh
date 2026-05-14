#!/usr/bin/env sh
# Example: nightly mongodump to timestamped archive (adjust MONGO_URI / paths for prod).
# Wire to cron or CI after secrets review; test restore quarterly on staging.

set -eu
OUT_DIR="${OUT_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

# Default local compose URI; override for production host.
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27018}"

mongodump --uri="$MONGO_URI" --gzip --archive="$OUT_DIR/stonee-all-$STAMP.gz"

echo "Wrote $OUT_DIR/stonee-all-$STAMP.gz — upload to encrypted object storage off-server."
