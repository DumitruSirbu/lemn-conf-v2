# ADR 0113 — Step 1's copy is approved as drafted, and each leaf enters the copy lock in the wave that adds it

Status: Accepted (owner ruling, 2026-09-11)
Date: 2026-09-11
Type: Decision (owner ruling)
Milestone: M7 — every wave that adds a message leaf (architect's re-plan,
`docs/milestones/M7-room-and-presets.md`)

## Context

The M7 plan's Q8 asked whether the owner wanted to review Step 1's new wording once, at the end of
the screen work, as at Gate O1 — mockup wording used as written, only the missing sentences drafted,
the Russian drafted after the Romanian and checked last, as at Gate O2. The owner's answer, verbatim
(2026-09-11):

> *"8. Mark as approved at the moment, as I said I will adjust when I will decide later"*

[ADR 0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
decision 2 pins approved Romanian in one whole-file literal lock
(`apps/web/tests/support/approved-romanian-messages.ts`, read by
`apps/web/tests/i18n/romanian-copy-lock.test.ts`), so a key added to `ro.json` without a line in the
lock fails it. Its fourth step says **no agent marks a translation approved**.

## Decision

**1. Gate M7-C is withdrawn.** There is no end-of-milestone copy review.

**2. A new Romanian leaf enters the copy lock in the same commit that adds it**, as approved by this
ruling. The commit message names the added keys and cites this record. The golden-output manifest
gains fixtures for them in the same commit; no existing hash moves.

**3. The Russian draft of the same leaves is approved by the same ruling.** Q8 asked about both
languages in one question and the owner answered it as one. ADR 0095's *"no agent marks a
translation approved"* is not crossed: the owner marked it. Russian is never pinned by literal
(ADR 0095 decision 2, layer 4), so this is a status recorded here and in the milestone, with no code
consequence. **If the owner meant the Romanian only, nothing in the code changes** — the Russian
simply reverts to "draft" in the record.

**4. *"I will adjust when I will decide later"* is the ordinary process, not a gate.** A later owner
edit to a Romanian leaf is an O1-class change as `docs/STATUS.md` already states it: the lock updated
in the same commit, the golden hashes re-baselined for exactly those keys, the Russian re-drafted.
A later edit to a Russian leaf is a value edit and touches nothing else.

**5. What this does not relax.** Mockup wording is still used as written where a frame has it (ADR
0104 makes the frames the chrome specification); a drafted leaf still says nothing the domain has not
published (no bound, no code — ADR 0108 decision 3); and every leaf is still reached by key, in
tests too.

## Alternatives considered

- **Keep the gate and ask again at the end.** Rejected: the owner has answered, and a gate the owner
  declined is a stall, not a control.
- **Leave new leaves out of the lock until the owner adjusts them.** Rejected: the lock is
  whole-file by design (ADR 0095 decision 2), and a leaf outside it is exactly the silent decay that
  design prevents.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) decisions 2, 4 | One whole-file Romanian lock; no agent marks a translation approved; Gate O1/O2. | **Followed**: the owner marks, the lock pins, the gates' role is taken by this ruling for Step 1. |
| [0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) | The frames are the chrome specification. | **Unchanged**: frame wording is used as written. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) *Context* | Owner-edited leaves are recorded as approved in the lock. | **The precedent** for recording owner approval in the lock. |
