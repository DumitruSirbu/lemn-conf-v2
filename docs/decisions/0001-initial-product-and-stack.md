# ADR 0001 — Initial product and stack decisions

Status: Accepted (decision 3 superseded by ADR 0003; the "temporary persistence adapter" half of
decision 7 superseded by ADR 0002)
Date: 2026-08-20
Type: Decision
Milestone: M0 — Foundations

Original status line: accepted by product owner

## Decisions

1. Use a pnpm workspace with Next.js App Router, React, strict TypeScript, React Three Fiber/Three.js,
   Zod, Zustand, Vitest, and Playwright. Keep the domain package independent of React and Three.js.
2. Presets use controlled module-pack adaptation with discrete supported cabinet widths. Purchased
   components and other source-fixed geometry never stretch. Exact manufacturing width sets remain
   catalog data and must not be invented when absent.
3. ~~Model windows and doors in the first room-planning release; defer sockets and utilities.~~
   **Superseded by ADR 0003**: wall-attached door/window obstacles are not present in the
   design-reference model and are retired from near-term scope.
4. Until commercial data arrives, use versioned sample prices in MDL and label every displayed
   total as an estimate. Sample data must not be represented as a quote or production price list.
5. Launch with Romanian as the default locale and Russian as a supported locale.
6. Contact submission requires name and phone; email is optional.
7. Use a provider-neutral server API and a temporary persistence adapter before CRM integration.
   CRM integration remains out of scope. The adapter must not claim production delivery unless a
   real sink and its privacy/retention policy are configured. ~~Temporary persistence adapter~~
   **Superseded by ADR 0002**: the POC gets its own server-side Postgres database instead of a
   temporary adapter; the provider-neutral API and out-of-scope CRM integration stand unchanged.

## Consequences

- Application scaffolding and policy-neutral M0 schemas may begin.
- Layout and catalog versions own discrete widths and preset adaptation rules.
- Exact room input bounds, the first approved width set, sample price amounts, and the temporary
  deployment persistence provider still require recorded data before their dependent behavior can
  be called production-ready.

## Amendment — 2026-10-28 (decision 4: two roundings; owner ruling, relayed)

Evidence: the owner's words as relayed by the coordinator; the scribe ran nothing.

Owner ruling, verbatim: "we speak about 2 rounding, the price set to things in admin rounded by 10 lei, the sum of
the entire kitchen rounded to 1000 lei".

Decision 4's "rounding up" (see ADR 0095 point 4, ADR 0177) is therefore two roundings, not one:

- **Every line** the customer sees (breakdown, review, lead notice) shows its priced amount to **10 lei**.
- **Only the kitchen total** rounds up to the **1 000 lei**. Printed rows need not sum to the printed total.
- Coordinator rulings with it: a stored legacy line that is not a multiple of 10 lei rounds **up** to the next 10 lei;
  tier-delta badges stay at the thousand, because they compare totals.

This answers the owner question recorded in the 2026-10-28 MP-3 block of
[`M10-price-dashboard.md`](../milestones/M10-price-dashboard.md) (ADR 0175 decision 5 called 10 lei the display unit).
Implemented by wave Q1c (branch `m10/q1c`, in QA, not merged). Decision 4's other half (sample prices are estimates,
never a quote) is unchanged.

## Dated note — 2026-10-17 (wave 8J2)

Decision 7's *provider-neutral server API* is **kept**: the mail provider changed from Resend to Gmail SMTP behind the
unchanged mail port ([ADR 0164](0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md)
decision 1), so no route, store or page changed with it.
