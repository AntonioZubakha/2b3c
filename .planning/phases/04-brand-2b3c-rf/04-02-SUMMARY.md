---
phase: 04-brand-2b3c-rf
plan: 02
subsystem: ui
tags: [i18n, seo, branding, react, vitest]

requires:
  - phase: 04-brand-2b3c-rf
    provides: "04-01 GAP register and multi-source audit"
provides:
  - "Public brand 2B3C in Navbar, Footer, Seo, index.html, i18n locales"
  - "publicBrand.ts helper + tests for Helmet title suffix"
  - "RF checklist in info/PRODUCT.md; FRONTEND note on display name"
affects:
  - "Phase 5 quality gates (ongoing test/lint)"

tech-stack:
  added: []
  patterns:
    - "buildSeoFullTitle / titleContainsBrandOrLegacy for duplicate-free title suffix"
    - "common.productName for shared wordmark in chrome"

key-files:
  created:
    - "apps/frontend/src/lib/publicBrand.ts"
    - "apps/frontend/src/lib/publicBrand.test.ts"
    - ".planning/phases/04-brand-2b3c-rf/04-02-SUMMARY.md"
  modified:
    - "apps/frontend/index.html"
    - "apps/frontend/src/components/Seo.tsx"
    - "apps/frontend/src/components/Navbar.tsx"
    - "apps/frontend/src/components/Footer.tsx"
    - "apps/frontend/src/components/BrandMark.tsx"
    - "apps/frontend/src/pages/HomePage.tsx"
    - "apps/frontend/src/pages/AboutPage.tsx"
    - "apps/frontend/src/pages/DiamondDetailPage.tsx"
    - "apps/frontend/src/i18n/locales/en/common.ts"
    - "apps/frontend/src/i18n/locales/ru/common.ts"
    - "apps/frontend/src/i18n/locales/en/home.ts"
    - "apps/frontend/src/i18n/locales/ru/home.ts"
    - "apps/frontend/src/i18n/locales/en/diamond.ts"
    - "apps/frontend/src/i18n/locales/ru/diamond.ts"
    - "apps/frontend/src/i18n/locales/en/footer.ts"
    - "apps/frontend/src/i18n/locales/ru/footer.ts"
    - "apps/frontend/src/i18n/locales/en/about.ts"
    - "apps/frontend/src/i18n/locales/ru/about.ts"
    - "apps/frontend/src/i18n/locales/en/auth.ts"
    - "apps/frontend/src/i18n/locales/ru/auth.ts"
    - "apps/frontend/src/i18n/locales/en/concierge.ts"
    - "apps/frontend/src/i18n/locales/ru/concierge.ts"
    - "apps/frontend/src/i18n/locales/en/education.ts"
    - "apps/frontend/src/i18n/locales/ru/education.ts"
    - "apps/frontend/src/i18n/locales/en/cart.ts"
    - "apps/frontend/src/i18n/locales/ru/cart.ts"
    - "apps/frontend/src/i18n/locales/en/checkout.ts"
    - "apps/frontend/src/i18n/locales/ru/checkout.ts"
    - "apps/frontend/src/i18n/locales/en/orders.ts"
    - "apps/frontend/src/i18n/locales/ru/orders.ts"
    - "apps/frontend/src/i18n/locales/en/wishlist.ts"
    - "apps/frontend/src/i18n/locales/ru/wishlist.ts"
    - "apps/frontend/src/i18n/locales/en/supplier.ts"
    - "apps/frontend/src/i18n/locales/ru/supplier.ts"
    - "apps/frontend/src/i18n/locales/en/merchant.ts"
    - "apps/frontend/src/i18n/locales/ru/merchant.ts"
    - "apps/frontend/src/i18n/locales/en/security.ts"
    - "info/PRODUCT.md"
    - "info/FRONTEND.md"

key-decisions:
  - "Checkout trust copy softened (no Lloyd's / 100% claims); legal accuracy deferred to lawyer review per PRODUCT checklist"
  - "Cart warranty strings point to order confirmation instead of lifetime promise"
  - "Seo og:locale + alternate emitted from current i18n language"

patterns-established:
  - "Import i18n in Seo for og:locale tags aligned with active locale"

requirements-completed: [BRD-01, BRD-02]

duration: 40min
completed: 2026-05-14
---

# Phase 04 Plan 02: 2B3C branding & RF checklist Summary

**Storefront wordmark and copy use 2B3C across chrome, static HTML, Helmet SEO, and ru/en locales; RF checklist in PRODUCT with Done/Deferred; title suffix logic covered by unit tests.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 2 (chrome/SEO/pages + i18n/docs/verify)
- **Files touched:** 40+ (see frontmatter `key-files`)

## Accomplishments

- Introduced `publicBrand.ts` with `buildSeoFullTitle` (detects `2b3c` and legacy `stonee`) and Vitest coverage.
- Navbar/Footer wordmark via `common.productName`; `Seo` uses public brand for `og:site_name`, dynamic `og:locale`, and titles; `index.html` aligned (`lang=ru`, 2B3C meta, `ru_RU` + alternate).
- Replaced user-facing «Stonee» in listed locale modules; neutralized high-risk checkout/cart warranty wording.
- `info/PRODUCT.md` чеклист РФ; `info/FRONTEND.md` — строка про публичное имя **2B3C**.

## Task Commits

1. **Task 1–2 (wave 2)** — single commit `feat(frontend): 2B3C branding and RF checklist` per user instruction.

## Decisions Made

- Deferred legal deep-dive: documented in PRODUCT; marketing copy only toned down, no invented legal facts.

## Deviations from Plan

None - plan executed; optional `brand.ts` module folded into `publicBrand.ts` for the same purpose (single small module).

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- BRD-01/02 implementation complete in frontend layer; lawyer review still needed for checkout/offerta items marked Deferred.

## Self-Check: PASSED

- `apps/frontend/src/lib/publicBrand.ts` and `publicBrand.test.ts` exist.
- `pnpm run test` — 35 tests passed (includes new `publicBrand` tests).
- `pnpm run lint` — exit 0 (existing warnings only).
- `rg` on `apps/frontend/src/i18n/locales` for user string values containing `Stonee`: only key names `whyStonee1` / `whyStonee2` (values are 2B3C).
- Navbar/Footer `.tsx` contain no literal wordmark `Stonee` (only `isStoneeStaffRole` import per exceptions).
- Git: `main` is two commits ahead with `docs(04): brand audit` then `feat(frontend): 2B3C branding and RF checklist` (`git log --oneline -2`).

---
*Phase: 04-brand-2b3c-rf*
*Completed: 2026-05-14*
