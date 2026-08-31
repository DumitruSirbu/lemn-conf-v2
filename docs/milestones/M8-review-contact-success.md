# M8 — Screens 3, 4 and 5: review, contact, success and failure

> **STATUS: PLANNED.** Depends on M7. Summary: `docs/STATUS.md`.

Status: planned. Depends on M7.
Reference: mockup frames 3A, 3B, 4A, 4B, 4C, 5A, 5B; `ARCHITECTURE_PROPOSAL.md` §8, §9;
`CONFIGURATION_MODEL.md` "Pricing model boundary", "Persistence and migrations";
`docs/decisions/0001-initial-product-and-stack.md` decisions 4, 6 and 7.

## Goal

Close the flow: let the customer read what they built, set expectations before asking for their
details, collect the minimum needed for a first call, and confirm exactly what happens next —
including when the submission fails.

## Scope

In: `/configurator/review`, `/configurator/contact`, and the success route; the submission boundary;
the failure safety net. **Note (2026-08-25):** `ContactSubmissionSchema` /
`createContactSubmissionSchema` were deleted in M2 Wave 2A — they were typed against the retired
`KitchenConfigurationSchema`/`PricingResultSchema` and had no live consumer (see
`docs/decisions/0004-m2-pricing-engine-deletion.md` addendum). Work item 7 here must define a
new contact-submission schema whose configuration snapshot is shaped against the `Design`
model M2 introduced, not adapt the deleted one.

Out: CRM integration.

## Security this phase owns — decided, not open

**`docs/decisions/0019-security-baseline-writes-throttling-retention.md` is Accepted. Implement it;
do not re-decide it.** M8 is where most of it lands, because it owns the contact form — the
endpoint the owner named as most needing throttling.

- **Application rate limiting**, in the existing Postgres (no Redis — decided). Identity is
  *independent buckets*, most restrictive wins: IP aggregated to **/24** and **/64**, session
  cookie, normalised email, and a global cap. Never IP+session fused into one key — a composite is
  weaker than either component, since rotating either resets the counter. IPv6 /64 aggregation is
  not optional.
- **Contact form limits**: 3/hour and 10/day per IP block, 2/hour per session, 3/day per email;
  non-MD traffic tighter and challenged. **Fails closed** — if the counter store is unavailable the
  submission is refused. A lost lead beats an open relay.
- **Honeypot field, minimum time-to-submit, and Vercel BotID.** Rate limiting is not the only
  control on this form.
- **Retention cron**: designs that never reached the contact step and have not been modified for 30
  days are deleted by the existing nightly cron, which also prunes expired counters. This is the
  answer to the retention question this plan lists as open — it is now closed by ADR 0019.
- **Emailed edit link**, not a password: the design link is emailed with its write token so the
  customer can edit from another device. Storing passwords for people who never made an account was
  considered and rejected — see ADR 0019 Alternatives.

## Launch gate — `POST /api/designs` must not meet real traffic until this is checked off

Added 2026-08-31. This is a **hard pre-launch blocker**, not a work item that can be traded away
inside a wave. An adversarial review on 2026-08-30 reproduced the unthrottled mint path as
**SEC-001 (High)** (`testing-reports/01-security-and-api.md`) and chained it with SEC-002 and
DB-002 into the resource-exhaustion sequence **AV-4**
(`testing-reports/07-critical-attack-vectors.md`). The owner reaffirmed the deferral on 2026-08-31
on the condition that it is gated here; the decisions themselves are settled in
`docs/decisions/0019-security-baseline-writes-throttling-retention.md` (see its 2026-08-31
correction) and must not be re-litigated.

Today the endpoint has **no application limiter and no active retention**. Every item below must be
live — not planned, not staged in a runbook — before the endpoint is exposed:

- [ ] **Independent buckets, most restrictive wins** (ADR 0019 decision 3): IP aggregated to **/24**
      (IPv4) and **/64** (IPv6), the signed session cookie, and **global per-endpoint counters**.
      Never IP+session fused into one composite key. IPv6 /64 aggregation is not optional.
- [ ] **The recorded mint limits** (ADR 0019 decision 5): **10 / hour and 30 / day** per IP block
      for MD networks; **3 / hour plus challenge** for non-MD; **5 / hour** per session.
- [ ] **`429` with `Retry-After`** on refusal, with a reason the UI can render.
- [ ] **Fail closed when the counter store is unavailable.** Writes fail closed; reads fail open.
- [ ] **The 30-day abandoned-design retention cron** (ADR 0019 decision 7): a design that never
      reached the contact step and has not been modified for 30 days is deleted by the existing
      nightly cron, which also prunes expired rate-limit counters.
- [ ] **The staged WAF rule** (ADR 0019 decisions 2, 4, 5, and `docs/runbooks/firewall-setup.md`):
      the single `rate_limit` rule across `/api/` at 120 requests / 60 s per IP. It ships in `log`
      action first; publishing to production is the owner's action, not an agent's.

All six ship **together**. Any one alone leaves AV-4 open, and the WAF rule is per-region and coarse
by construction, so it is never quoted as the cap. Verify the fix using ADR 0019's intended low
rates — **do not use a high-volume loop as the regression test**.

### Unresolved prerequisite, 2026-08-31 — no credential in the system can perform the retention delete

Found reviewing the API boundary. The retention cron above is not merely unbuilt; under the current
role model it **cannot execute at all**, and that is an owner decision rather than an implementation
detail.

[ADR 0008](../decisions/0008-least-privilege-database-role.md) grants `app_designs` exactly
`SELECT, INSERT, UPDATE` on `public.designs` and states that **`DELETE` is deliberately withheld** —
so that a bug, or an attacker holding the application's credentials, "cannot destroy a customer's
design at all". Its test asserts that `DELETE`, `TRUNCATE`, `DROP TABLE` and `CREATE TABLE` are each
refused. `.env.example` repeats the same constraint against `DATABASE_URL`: the role "cannot drop,
truncate or delete". ADR 0008 anticipated exactly this moment — "grant it when a feature actually
needs it, not pre-emptively" — and ADR 0019 decision 7 is that feature.

**Whoever deletes must be decided before retention can ship**, and the choice is the owner's:

- a **separate privileged cron credential**, kept out of the running application the way
  `MIGRATION_DATABASE_URL` already is (ADR 0008, "migrations need their own connection"), or
- a **`DELETE` grant to `app_designs`**, which reverses ADR 0008's stated reason for withholding it
  and widens the blast radius of a leaked `DATABASE_URL` to destruction, not just modification.

Both options change a recorded security decision, so neither may be taken inside a wave. Note also
that ADR 0008 already flags M8's contact table as needing **its own** grant decision; these are two
separate questions and should not be settled as one.

**Nothing was changed to record this** — no role, grant, environment variable or code. Until it is
decided, the retention checkbox above cannot be truthfully ticked, and therefore neither can the
gate.

### Also blocked on this phase — the CSP enforce flip

Added 2026-08-31, under its own heading rather than in the checklist above: this item does **not**
gate `POST /api/designs` and is not part of the ship-together set. It lands in M8 only because the
rate limiter above is the thing that would make a violation-report endpoint safe to expose at all.

- [ ] **Flip the CSP from report-only to enforcing** (wave S4,
      `docs/milestones/adversarial-review-remediation.md`). `apps/web/src/lib/security-headers.ts`
      ships a nonce-based policy as `Content-Security-Policy-Report-Only` with **no report sink** —
      a collector would itself be the unauthenticated unthrottled POST endpoint the gate above
      exists to prevent, which is why it was not built in S4. Two preconditions, both measured in
      S4: a method of collecting violations, and the five prerendered routes carrying no nonce —
      `/`, `/_global-error`, `/_not-found`, `/configurator/configure`, `/configurator/contact` —
      so enforcing today would blank them, `/_global-error` included, which is the error boundary
      itself. Flipping the one constant `CONTENT_SECURITY_POLICY_MODE` without clearing both
      preconditions would take the app down.

## Work items

1. **3A** — the review summary: final render, room summary line, whole-kitchen settings with a
   change action, and the placement groups.
2. **3B** — the summary's lower half and the "what's not included" block.
3. **4A** — the contact form.
4. **4B** — field-level validation.
5. **4C** — the submitting state.
6. **5A** — success; **5B** — submission failure.
7. The server submission boundary and its temporary sink.

## Acceptance criteria

Review (3A / 3B):

- The summary is grouped wall → band → order — the same grouping as the live 3D and the price
  breakdown, derived from the same projection.
- Each group carries its own edit action that returns to the scene **with that cabinet
  preselected**, not merely to the editor.
- Whole-kitchen material and hardware appear as their own row with their own change action.
- **"What's not included" sits before the primary call to action, not in a footer.** Expectations are
  set before contact details are collected. The list itself is a content slot, not final copy.
- The estimate is labelled a starting price, rounded up, subject to on-site measurement, and
  explicitly not a commercial offer.
- The price shown is recomputed from the reviewed configuration, never carried as a stored total.

Contact (4A / 4B / 4C):

- Fields: name, phone, locality, and a preferred contact channel. Name and phone are required and
  email is optional, per the accepted decision record. The mockup's channel chips are phone,
  WhatsApp and email.
- The form states that the design attaches automatically and that a consultant returns with the
  final price.
- The consent checkbox sits next to the call to action. Its text is a slot; no legal copy is
  authored here.
- **Validation fires at field blur, next to the field — not all at once on submit.** The first error
  receives focus and scrolls into view.
- Error messages describe what is expected in human language, as in the mockup's note that a phone
  number appears incomplete because eight digits are expected after the prefix.
- **4C:** the submit control holds a loading state and is protected against double submission. The
  form dims but stays visible, so it is clear what is being sent. The waiting copy tells the
  customer not to close the page while the design is attached.
- The submitted snapshot is the exact reviewed configuration, not whatever is in mutable UI state
  when the request starts.

Submission boundary:

- The server revalidates the payload, resolves the matching catalog and pricing context, and
  recomputes the price. It never trusts a client line or total, and it stores or forwards only the
  freshly verified result.
- The endpoint enforces body-size limits, same-origin protections, rate limiting, idempotency via a
  client request id, structured errors, and PII-redacted logging. It returns a submission identifier
  and status, never the submitted contact details.
- Contact data is absent from the saved and shareable configuration. Saving or sharing a design must
  not carry personal data — the design is reachable by link, so this is enforced, not aspirational.
- The submitted design already exists server-side under its identifier, so the endpoint verifies
  against the stored design rather than trusting the client's copy of it.
- If no real sink is approved, production shows submission as unavailable. A test-only in-memory
  sink must never fake a successful customer submission.

Success (5A):

- Confirms the **exact channel and number** that will be used, never a vague promise of contact.
- Shows the request identifier with a copy action.
- **Promises no timeframe.** The mockup deliberately omits one because it is an unresolved business
  decision. "What happens next" lists the steps without dates.
- States that the design is saved and can be reopened. Because designs are stored server-side under
  a shareable identifier, that promise is now literally true rather than device-bound, and the copy
  should reflect what actually happens.

Failure (5B):

- State is preserved — the design (already stored server-side) and the entered contact details are
  kept, and the screen does not ask for re-entry.
- An alternate contact channel is offered.
- **No technical error code is shown.** The message explains the situation in ordinary language.
- Retry happens automatically in the background when connectivity returns, in addition to the manual
  retry action.

Surfaces:

- **Mobile (gate):** all seven frames complete by touch at 390 × 844, including a submission failure
  path with state preserved across it. This is the phase gate.
- **Desktop (same phase, separate line):** the desktop mockup does not cover screens 3, 4 or 5. Ship
  these responsively from the mobile design rather than inventing desktop chrome, and record the gap
  so it can be designed deliberately later.

## Risks

- **Authoring legal or timeframe copy to fill a gap.** Both are recorded as unresolved. A slot with
  placeholder copy that is visibly a placeholder is correct; a plausible-sounding sentence is not.
- **Review drifting from the editor's grouping.** One projection, three consumers.
- **A submission path that reports success without a real sink.** Explicitly forbidden.

## Open questions gating this phase

- Consent and privacy copy, retention period, and the deploy-time persistence provider.
- Whether any response timeframe may be promised.
- The final "what's not included" list and what the estimate includes.
- Screen 5's route: `/configurator/success` per the architecture proposal, or `/configurator/done`
  per the mobile mockup. Choose one and use it in both places.
- Desktop chrome for these three screens.

## Verification

- Submission-boundary tests: revalidation, recomputation, idempotency, rejection of a tampered
  total, and absence of contact data in the saved configuration.
- Form tests for blur-time validation, first-error focus, and double-submit protection.
- A forced-failure run proving state survives and background retry fires on reconnection.
- Real touch interaction through all seven frames at 390 × 844.
