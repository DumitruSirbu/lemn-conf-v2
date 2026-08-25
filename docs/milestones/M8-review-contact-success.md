# M8 — Screens 3, 4 and 5: review, contact, success and failure

> **STATUS: PLANNED.** Depends on M7. Summary: `docs/STATUS.md`.

Status: planned. Depends on M7.
Reference: mockup frames 3A, 3B, 4A, 4B, 4C, 5A, 5B; `ARCHITECTURE_PROPOSAL.md` §8, §9;
`CONFIGURATION_MODEL.md` "Pricing model boundary", "Persistence and migrations";
`docs/decisions/2026-08-20-initial-product-and-stack.md` decisions 4, 6 and 7.

## Goal

Close the flow: let the customer read what they built, set expectations before asking for their
details, collect the minimum needed for a first call, and confirm exactly what happens next —
including when the submission fails.

## Scope

In: `/configurator/review`, `/configurator/contact`, and the success route; the submission boundary;
the failure safety net. **Note (2026-08-25):** `ContactSubmissionSchema` /
`createContactSubmissionSchema` were deleted in M2 Wave 2A — they were typed against the retired
`KitchenConfigurationSchema`/`PricingResultSchema` and had no live consumer (see
`docs/decisions/2026-08-25-m2-pricing-engine-deletion.md` addendum). Work item 7 here must define a
new contact-submission schema whose configuration snapshot is shaped against the `Design`
model M2 introduced, not adapt the deleted one.

Out: CRM integration.

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
