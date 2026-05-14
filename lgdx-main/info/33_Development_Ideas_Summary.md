# Development Backlog / Ideas

> Informal list. No timelines, no commitments. Items here are not implemented unless stated otherwise.

---

## Known bugs / tech debt

1. **Blacklist certificate timing** (`server/src/tests/business-logic/scenarios/08-blacklist-certificate-timing.ts`)  
   Duplicate products can be added between `request` and `payment_received` states. Fix: add to blacklist at `payment_delivery`.

2. **Deal status race condition** (`09-deal-status-race-condition.ts`)  
   No optimistic locking on deal status updates. Fix: include current status in the update query.

3. **Perfect Pair MongoDB index**  
   A compound index `{ shape, color, carat, status, sold, onDeal }` is mentioned in `marketplaceController.ts:506` comments but not yet applied. Run `scripts/optimize-mongodb-indexes.js` to verify.

---

## Feature ideas (not planned, not started)

- **Crypto payments via Polygon / USDC** — NFT escrow for deal certificates (reduces 3.5% Stripe fee).
- **Public partner API** with versioning (`/api/v1/`) and Swagger docs. Currently `companyApiController.ts` has no public spec.
- **Supplier-level analytics** — personalized dashboards showing conversion, average sell time, top categories.
- **WhatsApp outbound templates** — for cold contacts where arbitrary text is blocked by Meta policy.
- **WebSocket / SSE** — replace WhatsApp admin panel polling with a push channel.
- **ML scoring for Perfect Pair** — score candidates based on historical successful deal patterns.
- **Multi-language (i18n)** — `client/src/i18n/index.tsx` exists but is not fully wired.

---

## Deliberately out of scope (for now)

- Automated CI/CD (prefer manual `prod-clean-rebuild-keep-data.bat`).
- Mobile app.
- ELK Stack (using lighter Loki + Promtail instead, ~3.5 GB memory saving).
