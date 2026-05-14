# File processing (unified directory)

Single parent directory for all file-import and report outputs.

| Subdirectory | Used by | Purpose |
|--------------|---------|---------|
| `reports/` | file-import-service, api-product-sync-service, backup-service | Sync reports (xlsx, csv); backup-service deletes files older than `REPORTS_RETENTION_HOURS` (prod: 24h), on `REPORTS_CLEANUP_SCHEDULE` (default every 6h UTC) and after successful DB backup |
| `processed/` | file-import-service | Successfully processed uploads (moved here after import) |
| `failed/` | file-import-service | Failed imports |

Created automatically by Docker when mounting. Contents are gitignored.
