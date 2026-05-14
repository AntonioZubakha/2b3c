# SSL Renewal Service - Changelog

## Version 1.2.0 - 2026-04-07

### Critical: HTTP-01 via webroot (Swarm-safe)

- **Changed** renewal from `certbot renew` + **standalone** (stop Nginx) to **`certbot certonly --webroot`**
- **Reason**: standalone listened on port 80 inside the renewal container while Swarm published `:80` to Nginx; with Nginx scaled to 0, LE saw **connection refused** on the public IP.
- **Requires**: shared Docker volume mounted at `ACME_WEBROOT` on both **nginx** (read-only) and **ssl-renewal-service** (read-write), and Nginx `location ^~ /.well-known/acme-challenge/` for that path.
- **Telegram**: success field renamed to **Duration** (total wall time); metrics `ssl_last_downtime_seconds` now reflects **N Swarm restart** duration, not a deliberate full stop.

## Version 1.1.0 - 2025-11-21

### 🔧 Critical Fixes

#### Schedule Conflict Resolution
- **Changed schedule** from `0 3 * * 1` (Monday 03:00) to `30 1 * * 1` (Monday 01:30 UTC)
- **Reason**: Avoided conflict with other scheduled tasks:
  - 02:00 UTC - api-sync-service (daily, ~1 hour duration)
  - 03:00 UTC - backup-service, market-price-calculator
  - 03:45 UTC - analytics-service
- **Impact**: SSL renewal now runs BEFORE all other tasks, preventing interference

### ✨ New Features

#### 1. Prometheus Metrics (`/metrics`)
Added comprehensive metrics for monitoring:
- `ssl_certificate_expiry_days` - Days until certificate expires
- `ssl_last_renewal_timestamp_seconds` - Last renewal timestamp
- `ssl_last_renewal_duration_seconds` - Renewal duration
- `ssl_last_downtime_seconds` - Service downtime during renewal
- `ssl_last_renewal_success` - Success/failure status (1/0)
- `ssl_total_renewals_total` - Total successful renewals (counter)
- `ssl_failed_renewals_total` - Total failed renewals (counter)

**Usage:**
```bash
curl http://localhost:3000/metrics
```

#### 2. Manual Trigger Endpoint (`POST /trigger-renewal`)
Added ability to manually trigger SSL renewal via API:
- Returns `202 Accepted` immediately
- Runs renewal process asynchronously
- Useful for testing and emergency renewals

**Usage:**
```bash
curl -X POST http://localhost:3000/trigger-renewal
```

#### 3. Status Endpoint (`/status`)
Added JSON endpoint for programmatic status checks:
- Returns current metrics in JSON format
- Includes service status and timestamp

**Usage:**
```bash
curl http://localhost:3000/status
```

#### 4. Rollback Notifications
Added Telegram notification for rollback events:
- Notifies when certificate rollback occurs
- Includes backup path and timestamp

### 🔨 Improvements

#### Code Quality
1. **Constants extraction**: Moved hardcoded paths to constants
   - `SECRETS_DIR` configurable via env
   - `TELEGRAM_API_TIMEOUT` centralized
   
2. **Improved `restartNginx()`**:
   - Removed unsafe `docker stack deploy` fallback
   - Added proper health checking (checks task status, not just replicas)
   - More reliable service restart with better error handling

3. **Better error handling**:
   - Non-critical errors (like Telegram failures) don't stop execution
   - More descriptive error messages
   - Improved logging throughout

#### Infrastructure
1. **Volume improvements**:
   - Changed from bind mount to named volume for logs (`ssl_logs`)
   - Added `ssl_backups` named volume to docker-compose
   - More portable and Docker-native approach

2. **Metrics integration**:
   - Certificate expiry tracked on every check
   - Renewal duration and downtime recorded
   - Success/failure counters maintained

### 📊 Monitoring Integration

The service now integrates seamlessly with Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ssl-renewal-service'
    static_configs:
      - targets: ['ssl-renewal-service:3000']
```

### 🔒 Security
- No changes to security model
- Still runs as root (required for certbot and docker operations)
- All secrets still loaded from Docker secrets

### 📝 Documentation
- Updated README.md with new endpoints
- Added examples for manual trigger
- Documented Prometheus metrics

---

## Version 1.0.0 - Initial Release

- Basic SSL renewal functionality
- Scheduled renewal (cron-based)
- Backup and rollback support
- Telegram notifications
- Health check endpoint
- Docker Swarm integration

