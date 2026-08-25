# ADR 0014 — The deployed write surface is unauthenticated; the capability-URL model needs a decision

Status: **Superseded by ADR 0019** (2026-08-25) — S1, S3 and S4 are decided there; S2 was fixed in place. Retained as the record of what was found and confirmed against production.
Date: 2026-08-25
Type: Finding
Milestone: M2 Wave 2B (found during a catch-up security review)

M2 Wave 2B shipped the entire server surface — public API routes, database credentials, a
shared-secret cron, a least-privilege role, Blob storage. Every one of those is a documented trigger
for a security review in `docs/WORKFLOW.md`. **No security review was ever run on it**, and it is now
deployed and publicly reachable. This record is the catch-up.

Findings are numbered so a fix dispatch can cite them.

## S1 — `PUT`/`PATCH /api/designs/[id]` has no authentication. Confirmed live.

`apps/web/src/app/api/designs/[id]/route.ts` performs no auth or ownership check. Verified against
production without writing any data: a `PUT` to a random identifier with a junk body returned **400**
(payload validation), not 401. Nothing gates the request before the body is parsed.

The opaque nanoid is therefore the **only** access control, and it confers **write**, not read. Anyone
holding a shared link can silently overwrite that design. There is no read-only variant, no ownership
model, and no way for the original creator to detect or undo it — deletion is final and there is no
undo (`DEVELOPMENT-SPEC.md` §5.1), so an overwrite is unrecoverable except from the nightly backup.

ADR 0002 raised "whether a shared link is read-only for a second viewer" as an open **product**
question and deferred it. It was never assessed as a security posture. That is the gap: a capability
URL granting write may be an entirely reasonable POC trade-off, but right now it is an unexamined
default rather than a decision.

## S2 — Validation failures return the full Zod error tree

`invalidBodyResponse` in `apps/web/src/lib/server/design-errors.ts` interpolates the raw validation
reason into the response body. Production returns the expected type, the failing path, and the
message for each violation.

Alone this is minor schema disclosure. Chained with S1 it is the enabling step: probe with junk,
learn the exact `Design` shape from the errors, craft a valid document, overwrite any design whose
link you hold. **This one is a defect regardless of how S1 is decided** — a client needs to know its
payload was rejected, not the schema's internal structure.

## S3 — `POST /api/designs` is unauthenticated and unthrottled

`apps/web/src/app/api/designs/route.ts`'s `POST` takes no request argument: no auth, no limit, no
input at all. An anonymous caller can mint unlimited rows on a Neon free tier.

Not probed against production deliberately — it would write junk rows, and the `app_designs` role
holds no `DELETE` grant (ADR 0008), so they could not be cleaned up without the owner connection.
The code is unambiguous enough not to need the demonstration.

## S4 — No rate limiting anywhere

No throttle exists in `apps/web` or `packages`. S3 is the sharpest expression of it, but every route
is affected.

## Not a finding — identifier entropy

`generateDesignId` uses `nanoid()` at its default 21 characters over a 64-symbol alphabet: about
**126 bits**. Unguessable at any volume this project will see. Raised during review and retracted
here rather than left on the list to pad it.

## Severity, honestly

The application holds **zero designs**, has no users, and is a POC on a free tier. Today the
realistic impact of all four findings is low.

They do not stay low:

- **At M7**, presets and bespoke generation produce designs customers actually care about. S1 becomes
  "anyone with a link can destroy a customer's configuration".
- **At M8**, the contact table stores personal data. S3 and S4 become a path to unbounded PII
  writes, and ADR 0002 already flags that a database-wide export would sweep contact submissions into
  Blob under the 14-day rotation.

## What must happen, and when

- **S2 and S4: fix regardless.** Returning a generic rejection instead of the schema, and adding a
  basic rate limit, are cheap and depend on no decision.
- **S1: needs a human decision before M7.** Three coherent options, and the point of this record is
  that one of them gets chosen rather than defaulted into:
  1. **Accept the capability URL as-is**, and record it as a deliberate limit of the POC with its
     consequences stated: a link is a write credential, and losing control of a link means losing the
     design.
  2. **Split read from write** — the shared link resolves to a read-only view, and editing requires a
     separate write token held only by the creator. This is what most "share a link" products do.
  3. **Add ownership**, which implies accounts, which is out of scope for the POC.
- **S3: revisit before M7**, when there is a real creation trigger and unlimited anonymous minting
  stops being theoretical.

## Consequence for process

This review should have run during Wave 2B and did not, because the coordinator was treating green
CI gates as sufficient evidence. Gates prove the code does what its tests assert; they say nothing
about what an unauthenticated caller can do. `AGENTS.md` rule 4 and `docs/WORKFLOW.md`'s review
tiering now make the security trigger explicit — this record is the evidence for why that was worth
writing down.
