# Scripts and Utilities

## scripts/win/ — Windows (primary platform)

| Script | Purpose |
|---|---|
| `prod-clean-rebuild-keep-data.bat` | Full rebuild of the local production stack (Docker Swarm) while keeping persistent volumes (`mongodb_data`, `redis_data`, etc.). **Main everyday script.** |
| `prod-logs.bat` | Stream logs from all Swarm services |
| `prod-logs.ps1` | Same as above with colored PowerShell output |
| `prod-status.bat` | `docker service ls` + health summary |
| `prod-stop.bat` | `docker stack rm lgdx` |
| `prod-setup-docker-secrets.bat` | Creates Docker Secrets from prompts / env file |

> The `mac/` and `testing/` sub-folders were removed during a housekeeping pass — they contained macOS shell and ad-hoc test scripts no longer maintained.

---

## scripts/ root utilities

| Script | Purpose |
|---|---|
| `generate-secrets.js` | Generates random values for JWT, DB passwords, etc. Outputs a ready-to-use `.env` snippet |
| `install-all-deps.js` | Runs `npm ci` in each service directory in one shot |
| `clear-cache.js` / `clear-cache.sh` | Clears Redis keys for market/analytics cache. Flags: `--type=all\|market\|analytics\|redis`, `--env=dev\|prod` |
| `check-system.js` | Checks connectivity to MongoDB, Redis, RabbitMQ and prints a status table |
| `check-schema-org.js` | Validates Schema.org markup in pages |
| `optimize-mongodb-indexes.js` | Applies/verifies the recommended compound indexes listed in `13_Database_Schema.md` |
| `set-user-admin.js` | CLI helper to grant admin role to a user by email |

---

## mongo-init scripts

| Path | Purpose |
|---|---|
| `scripts/mongo-init.js/` | MongoDB init script for production (used by `docker-compose.prod.*`) |
| `scripts/mongo-init-dev.js/` | MongoDB init script for development |

---

## scripts/dev-seed/

Contains seed data fixtures used during local development only.

---

## Typical Windows workflow

```batch
REM Full production-local cycle:
scripts\win\prod-clean-rebuild-keep-data.bat

REM Check what is running:
scripts\win\prod-status.bat

REM Tail logs:
scripts\win\prod-logs.bat

REM Stop everything:
scripts\win\prod-stop.bat
```

For remote (SSH) production deployment see `info/03_Production_Deployment.md`.
