# Owner fixes — requested 2026-10-17

Two items the owner asked for, in this order: **fixes first, then the preset milestone, then login / register /
dashboard.** This file records the request and what the tree already says about it. Nothing here is built. Nothing
here overturns a decision: each place a recorded decision stands in the way is named so the owner can rule on it.

Evidence tiers: **[owner]** the owner's words, **[source-verified]** read in the tree at `cafab6dd`,
**[doc-quoted]** quoted from a document, **[inference]** not yet checked.

---

## Fix 1 — Generation fills every level with cabinets wherever one fits

### What the owner reported [owner]

- A generated kitchen often leaves empty spaces, most visibly on the **top level**, and often at a run's **edge**.
- Wanted: the generator adds a cabinet on **all levels** (base, wall row, top row) wherever one fits. The top level
  at least is to be full.
- Applies to the **line** and the **L**. A **U** keeps its one exception: the middle (back) wall.
- Example: 400 mm remaining → a cabinet fits on every level, so add it. *"Let it be added, and if user will want,
  will remove."*
- Asked first for an **analysis of why** the spaces are left, then the fix.

### Why spaces are left today [source-verified, `packages/configurator-domain/src/generation/`]

1. **A bare run end under 600 mm is allowed by design.** `leftover-rule.ts`: the free end is filled with whole 600 mm
   storage modules; `MAX_GENERATED_LEFTOVER_MM = 599` is the *"strict maximum bare run end"*. A 400 mm remainder
   therefore stays empty on the base level. Only a remainder under `ABSORBED_LEFTOVER_BELOW_MM = 300` is absorbed,
   and only beside a fixed-width end body (the fridge), by growing the neighbour in 50 mm steps.
2. **The upper row is owed only above a placed base.** `upper-policy.ts`, `isAnUpperOwedOver`: no upper over a
   full-height body, and none over wall A of a large U. A bare base end has no base, so it gets no upper.
3. **The top row follows the upper, not the wall.** The header of `upper-policy.ts` states it: *"one 400 mm cabinet
   over each upper placed"*. No upper below means no top cabinet above. A gap in the middle row empties the top row
   over it as well, which is why the top level looks emptiest.
4. **The corner top unit and the 800 + 100 spaces.** Backlog 247 records the 800 + 100 spaces above each U corner
   staying two (ADR 0166 d6); backlog 255 records that the commands still cut empty space at 800.
5. **The product rule behind it.** [ADR 0067](decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)
   and [ADR 0117](decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
   say bare wall is the normal case and *"the baseline is allowed to be plain"*; generation is the cheap correct
   baseline. **The owner's request is a new ruling that supersedes this for the cabinet fill, and it needs an ADR
   with a dated note on 0067 / 0117 / 0110 Amendment O** (the AGENTS.md rule: a dated record is not silently
   overturned).

### What still has to be established before building [inference — do this first]

- **The real smallest width per body, per level.** Backlog 6 says the 200 mm cargo is unreachable by any insert;
  the catalogue's minimum widths decide whether a 100–300 mm remainder can hold *any* cabinet. Where nothing fits,
  the honest outcome is a **filler or end panel**, not a cabinet. The owner should say which they want in that case.
- **Reproduce.** Generate line and L rooms across a sweep of wall lengths and list, per level, the bare segments and
  their widths. This turns "I see a lot of times" into a table of the exact lengths that leave gaps, and shows
  whether the fix is the 600 rule, the upper rule, or both.
- **The edge case the owner suspects** (*"on the edge it's harder to always fit"*): check the tall-end rule
  (`tall-end-rule.ts`) and the fridge end (`fridge-end-leftover.ts`), which place fixed-width bodies at run ends and
  push the remainder outward.

### Proposed change [inference]

1. After the base run is planned, **fill every remaining free segment at each level** with the widest catalogue
   body that fits it (cascading: 600, then the next sizes down), replacing the "under 600 stays bare" rule. Keep
   the existing absorb-by-growing rule where it already avoids a narrow sliver.
2. Make the **upper row owed over any base-level cabinet and any filled wall-row void**, and make the **top row
   owed over every upper**, so the top level is full wherever the room is tall enough (`hasRoomForATopRow`).
3. **Exceptions kept:** the U's back wall (`isBackWallBaseOnly`, base-only with the hood over the hob), full-height
   bodies, rooms too low for a top row, and spaces narrower than the smallest manufacturable cabinet.
4. A generated fill is an ordinary cabinet: the user removes it with the existing remove command.

### Acceptance

- For line and L rooms over the swept wall lengths: **no empty segment at any level wide enough for the smallest
  catalogue body**; the sweep fails with the offending room if one is found.
- U: wall A unchanged; walls B and C filled as above.
- Zero validation findings on every generated design (as today); price and the existing generation tests updated
  only where a bare end was part of the assertion, each with the reason recorded.
- Needs the **full review round** (domain rule), not a mechanical tier.

### Owner's rulings, 2026-10-17 [owner]

- **Q-F1-1 answered:** where no cabinet is narrow enough for a remainder, **keep the space empty**. No filler or end
  panel.
- **Q-F1-2 answered:** the fill applies to **wall runs only**, not next to windows and doors.

---

## Fix 2 — A button to save the current kitchen as a preset (to test the preset flow)

### What the owner reported [owner]

- Today a user can pick an existing preset before generating, but **the owner cannot test it, because there is
  no way to create one.** *"I need the button to save the preset, and after that, when I generate again, I should
  be able to see and select from the preset."*
- The button is **always visible for now** and is hidden or removed later. It need not be in the top bar (no
  space); anywhere visible, for example at the bottom.
- **No admin password for now.** Later, once login exists, the button shows for the administrator role. The
  password idea is dropped for this step.
- Priority: *"a special milestone that should be our priority now, after the fixes"*, ahead of login / register /
  dashboard.

### What exists today [source-verified]

- **No preset code exists.** A find over `apps/` and `packages/` for anything named *preset* returns only camera
  presets (`camera-preset-store.ts`, three-adapter camera tests). There is no table, no route, no Step 1 preset
  list, no evaluator and no save button.
- **It was designed and deliberately deferred.** The decisions already written:
  - [ADR 0112](decisions/0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md): presets are
    owner-authored rows in a `presets` table, saved from the editor by a temporary button; the server snapshots the
    *stored design* (not a client payload); a preset must have zero validation findings and contain a sink and a
    hob; the thumbnail is captured at save. It specified a feature flag **and** an owner secret.
  - [ADR 0109](decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md):
    matching and adaptation, with Amendment A for the owner's *"+- 600 mm"* on wall lengths.
  - [ADR 0131](decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md):
    the preset story moved past M8, and records the owner's **copy-on-use** ruling: presets live in their own table,
    only the administrator updates them, using one copies it into a new private design. **ADR 0112 does not yet
    carry that ruling; its amendment must be written before planning.**
- The mock-ups cover the Step 1 picker (`docs/design/mockups/`, which mention presets) [doc-quoted].

### Owner's rulings, 2026-10-17 [owner]

- **The button is shown in every environment, with no password and no switch.** The owner will not deploy to the
  public without login and register, so production is not open to visitors until then. **Launch-gate condition:
  the ungated button and its save endpoint are removed, or replaced by the administrator capability
  `preset.create` (Fix 3), before the first public deploy.** Until then anyone who can reach an environment can
  publish a preset onto every Step 1 screen in that environment's database. This reverses ADR 0112 decision 2 (flag
  plus secret) for this period only, so it needs a dated amendment, and the security reviewer must record it as an
  accepted, time-boxed risk. The M9 launch gate must list it.
- **Placement:** the bottom of the editor, the right side is acceptable.
- **Name:** the owner can type a **custom name**; if left empty, a **generated name** from **shape, size and
  finish colour** (owner, 2026-10-17), for example "L-shape, 3200 × 2400 mm, white". The name is stored per locale as ADR 0112 allows; the typed name is stored once and the generated name
  is rendered per language.

### Where the presets should be kept long term: production [inference]

Preview and production use separate databases (`lemn-conf-v2-preview` and `lemn-conf-v2`;
`docs/best-practices/environments-and-resources.md`). Every preview deployment and the local dev server share the
preview database, which is a test store and may be reset or rebuilt. **Recommendation: author presets on the
production deployment, so the library is born where it will live and nothing has to be migrated.** The cost: saving
happens against the production database, so migration 0011 (the `presets` table and its grant) must be applied to
production first, by the owner, per `docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`.
Because production is not public yet, the ungated button is acceptable there for now.

How to keep testing safe:
- Develop and test the feature on preview with throwaway presets, as for any feature.
- Author the real library only on the production URL.
- If a preset is ever made on preview and is worth keeping, the plan adds a small **export / import script** that
  copies a preset row between databases through the owner's migration credential, never by an agent touching
  production unasked. This is a fallback, not the plan.
- The presets table is a part of the production backup like any other table.

### Where this request differs from ADR 0112 (owner to confirm)

| ADR 0112 | This request | Consequence |
| --- | --- | --- |
| Feature flag **and** owner secret, server-side, twice | **No password now**; later a role | Ruled above: no gate until public launch, removed or replaced by `preset.create` before it. |
| Button temporary, hidden by flag | Always shown now, hidden later | Hiding later is done by the role capability, not by a flag. |
| Admin = owner secret cookie | Admin = a role on a logged-in account (later milestone) | The gate must be a swappable seam so login replaces it without touching the save path. |

### Proposal [inference]

A **preset milestone, "M9" or the next free number** (`docs/milestones/README.md` decides), in these waves:

1. **ADR amendment first.** 0112 gets the dated note: copy-on-use, no password in this step, the role gate to come.
2. **Storage.** The `presets` table and migration, with `SELECT, INSERT` for the application role (ADR 0112 d1).
   Applying the migration to production is the owner's step, never an agent's (AGENTS.md rule 1).
3. **Save.** The button, the save endpoint (id plus optional name; the server snapshots the stored design), the
   refusals (zero findings, a sink and a hob), and the thumbnail captured at save.
4. **No gate, time-boxed.** Per the owner's ruling above, the button and endpoint are live in every environment,
   guarded only by the existing rate limiter and the save rules of step 3. The wave records the launch-gate
   condition and adds it to M9's checklist. A security review is still mandatory for this wave (ADR 0112 d7) and
   rules on the accepted risk.
5. **List and match.** Step 1 lists presets for the room's shape, matched by ADR 0109's evaluator within
   ±600 mm of each wall length, adapted to the room.
6. **Preview.** A **Preview** button on each preset opens a pop-up with a still **image** of the kitchen (no live
   3D), and a **Select** action. The image is the thumbnail from step 3 or a larger render from the existing
   scene-capture rig (`/internal/scene-shot`) [inference: confirm the rig can render a larger size].
7. **Use.** Select **copies** the preset into a new private design for that visitor and opens the editor on it.
   The preset row is never edited by the copy.
8. **Test.** Save, regenerate, see the preset, preview, select, edit: one end-to-end path on desktop and the
   390 × 844 phone, as the project's visual-QA rules require.

Each wave follows `docs/WORKFLOW.md`: plan, implement, adversarial QA, review, verify, commit.

### Acceptance

- Generate a kitchen, adjust it, press **Save as preset**, and the preset exists with its thumbnail.
- Create a room of the same shape within ±600 mm per wall and the preset is offered on Step 1; a different shape
  or a size out of range offers nothing.
- **Preview** opens an image pop-up; **Select** opens the editor on a copy; the copy can be edited and the preset
  is unchanged.
- A save that fails the rules (a finding, or no sink or hob) is refused with a reason shown to the owner.
- The name field accepts a custom name; left empty, the generated name is stored.

### Open questions for the owner

- **Q-F2-1 / 2 / 3 answered** (see the rulings above). **Q-F2-4 answered:** the generated name uses shape, size and finish colour. Nothing remains open for Fix 2.

---

## Fix 3 — Accounts, roles and the dashboard (requirements for the design brief and for M8B)

The owner will produce the dashboard screens in Claude Design, in the style of the existing screens, and hand them
over as was done for the 3D and the five screens. This section is the requirements list for that brief and for the
plan. It extends [`M8B-customer-profiles.md`](milestones/M8B-customer-profiles.md) (planned, not started) and
[ADR 0115](decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md);
it does not replace either. The new rulings below need ADR 0115 amended and M8B revised before any wave is planned.

### Owner's requirements [owner]

- **Secure** above all. **GDPR compliant**: the product serves EU customers (the owner said "US users" in dictation;
  confirm, see Q-F3-1). Simple but effective **role-based access control**.
- Three roles, named **administrator**, **operator**, **client** (not "user"):
  - **Client**: creates a profile, sees and reopens the kitchens they made, edits them.
  - **Operator**: the manufacturer's sales manager. Sees clients' configurations, opens them, contacts the client,
    may set some details. Narrow permissions.
  - **Administrator**: everything an operator does, plus creates presets, edits prices and translations, and later
    settings. Permissions are per capability, so roles are sets of permissions and not hard-coded names.
- **Registration**: e-mail and a strong password; e-mail confirmed. **Phone is optional** and, if given, verified.
  The owner is undecided between phone-first (SMS) and e-mail-first and chose **e-mail login with optional phone
  confirmation**.
- **No 2FA** (too hard to force on people). Compensate with a good password policy and careful storage.
- **CAPTCHA** on register and login, Cloudflare Turnstile suggested.
- **Data held** is small: name, location / address, phone, e-mail. No payments, no payment integration.
- **Once a client has a profile, the one-browser limit goes away**: the design opens and edits from any device after
  login. The cookie-only rule of ADR 0114 / 0115 decision 2 remains only for visitors with no profile.

### What the tree says [source-verified unless marked]

- **M8B already exists as a stub** in `docs/milestones/README.md`: e-mail and password, a dashboard, claiming
  anonymous designs. Open it before planning; it holds the checklist ADR 0115 decision 4 inherited (password reuse,
  hashing, never logging, a reset path).
- **ADR 0115 rejected nothing here**: it chose accounts with passwords. The owner's present list adds roles, CAPTCHA
  and optional phone.
- **Today there is no user table, no session and no authentication of any kind.** Only the per-design write token,
  the visitor cookie and share tokens exist (ADR 0114, 0115).
- **The "nothing is deleted" rule collides with GDPR.** ADR 0019 (Amendment on retention) says no row is deleted
  automatically and `DELETE` is absent by design. A person's right to erasure needs a deliberate delete path for
  accounts, their designs and their contact submissions. This needs an ADR that carves a named exception.

### Proposed requirements [inference, for the owner to rule on]

**Security**
1. **Passwords** hashed with Argon2id (or scrypt), per-user salt, never logged, never returned. Minimum length 12,
   no composition rules, checked against a breached-password list (k-anonymity range lookup). Maximum length bounded
   to stop hashing abuse.
2. **Sessions**: server-side session id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, stored hashed, with an
   idle and an absolute expiry; rotated at login; revocable (log out everywhere). No tokens in `localStorage`.
3. **Abuse control**: Turnstile on register, login, password reset and phone-verification send; the existing
   keyed limiter (ADR 0155 / 0156) per IP and per account; progressive delay on failed login; the same response for
   an unknown e-mail and a wrong password (no account enumeration).
4. **E-mail**: confirmation link and reset link are single-use, short-lived, hashed at rest. The mail goes through
   the existing provider-neutral port (ADR 0154 / 0164).
5. **CSRF** protection on every state-changing request (SameSite plus an origin check); the CSP (ADR 0161) stays.
6. **Audit log** of administrative and operator actions: who, what, which client, when. Append-only.
7. **Security review is mandatory** on every wave of this milestone, and the owner provisions the secrets, never an
   agent (AGENTS.md rule 1).

**RBAC**
8. Permissions are named capabilities, roles are sets of them, and **every server route and every query checks a
   capability**. The UI hides controls but never authorises.
9. Initial capability set: `design.read.own`, `design.edit.own`, `design.read.any`, `contact.read`,
   `contact.update-status`, `preset.create`, `preset.manage`, `price.edit`, `translation.edit`, `user.manage`,
   `audit.read`.
10. Roles: **client** = the two `.own`; **operator** = `design.read.any`, `contact.read`, `contact.update-status`
    (read-only access to designs; "maybe set some details" is Q-F3-4); **administrator** = all.
11. **An operator reading a client's design is a logged event**, and the client is told in the privacy notice that
    the manufacturer's staff can see designs they submit. Staff see a client's designs only where the client has
    **submitted a request**, not every private draft (proposal; Q-F3-3).
12. Staff accounts are **created by an administrator by invitation**, never self-registered. The first administrator
    is seeded by the owner in the database console. A client can never promote themself.

**GDPR**
13. **Lawful basis and notice**: a privacy notice linked from register; the account is on the basis of contract
    (providing the service), the optional phone verification and any marketing on consent. No marketing consent is
    pre-ticked. A separate, unticked checkbox if marketing is ever added.
14. **Rights the app must serve**: access and portability (an export of the client's profile and designs as JSON),
    rectification (edit profile), **erasure** (a "delete my account" action that removes the profile, designs,
    share links and the personal columns of contact submissions), and objection / restriction (by contact). Each
    answered within one month; the operator process for a request sent by e-mail is documented in a runbook.
15. **Minimisation**: collect only name, e-mail, optional phone and optional address. No date of birth, no free
    profile fields.
16. **Retention**: a named horizon for each table (unverified accounts, inactive accounts, sessions, audit log,
    contact submissions, backups). The existing 14-day backup rotation stays; erasure must be reflected after the
    backup window and the notice says so. **This conflicts with ADR 0019's "nothing is deleted"** and needs the
    owner's ruling and an ADR.
17. **Data location and processors**: record every processor (database host, hosting, mail provider, Cloudflare,
    SMS provider if any) with its data-processing agreement, and the region the data sits in. Transfers outside the
    EU need a recorded mechanism. A cookie notice: the session and visitor cookies are strictly necessary and need
    no consent banner; Turnstile and any analytics must be checked against that.
18. **Breach readiness**: a runbook for the 72-hour notification, and no personal data in logs (the existing
    never-print-a-secret rule extends to e-mail and phone).

**Phone (optional)**
19. Verification by SMS needs a paid provider and is an abuse target (SMS pumping). Proposal: **ship e-mail
    verification first**; add the phone number as an optional field, stored unverified and labelled so, and put SMS
    verification in a later wave behind its own rate limit and spend cap (Q-F3-2).

**Dashboard screens to design** (for the Claude Design brief; mobile is the priority surface, as for the rest)
- Register, log in, forgot / reset password, confirm e-mail, and the modal ADR 0115 describes: offered once, after
  the first edit, dismissible.
- **Client**: "My kitchens" list (thumbnail, name, room shape and size, last changed, price floor), actions open,
  duplicate, rename, share link, delete; profile page (name, address, phone, e-mail, change password); export my
  data; delete my account; log out everywhere; a **Save / Discard pop-up** when generating a new kitchen over an open one
  (no per-kitchen version history; Q-F3-5).
- **Operator**: list of all clients' designs with a **sent / draft filter**, status and client contact; open a design read-only; mark
  status and add a note.
- **Administrator**: all of the operator's screens, plus staff management, presets library (see, hide, reorder),
  prices, translations, and the audit log.
- Empty, loading, error and "session expired" states for each, in Romanian and the other languages the project
  ships.

**Claiming anonymous designs**
20. At register or login, the designs held by the current visitor cookie are attached to the account after the
    client confirms. A design belongs to exactly one account; a design already owned is never re-claimed.

### Owner's rulings, 2026-10-17 [owner]

- **Q-F3-1 — market:** worldwide in the end, **starting with Europe, in particular Moldova**. Design to the GDPR, the
  strictest common standard. Moldova's own personal-data law (aligned with the GDPR) and any national registration
  duty of the data controller must be checked by the owner's legal adviser before launch **[inference: not verified
  here]**. A US launch later needs a separate check of state laws.
- **Q-F3-2 — phone:** **no phone verification and no SMS**, because of the cost. The phone is an optional contact
  field, stored unverified and labelled so. **The e-mail is verified** by a link sent to it.
- **Q-F3-3 — operator visibility:** the operator sees **all of a client's designs, drafts included**. A design
  carries a **"sent" flag** (the client submitted it to the shop), and the operator's list **filters** sent against
  draft-only.
- **Q-F3-4 — operator edits:** the operator **cannot change a client's design**. They may **view it and add a
  note**, and set the request status. Reason: the operator has a separate tool that builds an exact offer with fixed,
  correct sizes and prices; this configurator is a marketing tool, not the offer tool.
- **Q-F3-5 — previous kitchens:** the client keeps **all kitchens they generated**, not a version history inside
  one kitchen. Workflow: choose a shape, enter wall sizes, **generate or pick a preset**. Pressing **generate a new
  one** while a kitchen is open raises a pop-up, **Save or Discard**. Discard saves nothing; Save keeps the current
  kitchen as one entry in the client's list of kitchens.
- **Q-F3-6 — erasure:** on a valid request, **all of the client's personal data is removed, sent kitchens included**:
  profile, contact details, name, designs, share links and their contact submissions. Accepted by the owner.
- **Retention (not a hard requirement, may change):** **drafts are kept one year; sent kitchens are kept
  indefinitely**, until the client asks for erasure.

### Consequences of the rulings for the requirements above [inference]

- **Roles, items 9–12 revised:** `design.read.any` covers drafts and sent designs; **no `design.edit.any` exists**.
  Operator = `design.read.any`, `contact.read`, `contact.update-status`, `note.write`. A new `note.write` capability
  and a notes table (author, design, text, time) are needed; notes are personal data about a client and are
  included in export and erasure.
- **Item 11 revised:** the privacy notice must say that the manufacturer's staff can see a client's drafts. Every
  staff read is still audit-logged.
- **Item 19 replaced:** no SMS provider, so no SMS spend cap and no SMS-abuse surface. Phone is a free-text optional
  field with format validation only.
- **Item 16 now has two real horizons:** a **nightly job deletes unsent designs 365 days after their last change**
  (and unverified accounts after a short period, to be set in the ADR). This **reverses ADR 0019's "nothing is
  deleted automatically"**, which retired the earlier 30-day cron; the ADR must say so and supersede it for
  account-owned drafts. Anonymous, never-claimed designs keep ADR 0019's current rule unless the owner rules
  otherwise.
- **Erasure must reach sent kitchens.** ADR 0153 stores contact requests apart from designs and has the application
  role read none of their personal columns; the erasure path needs a deliberate, narrow `DELETE` grant and an
  audited procedure. The shop's e-mail notice already sent (ADR 0164 / 0165, with a frozen view link) **sits outside
  the database**: erasure must also revoke that frozen link, and the privacy notice must say that e-mails already
  delivered to the shop cannot be recalled by the system. Backups rotate in 14 days, so erasure completes fully
  after that window.
- **"Sent" is a stored state on a design**, set at the contact submission, never cleared; it drives the operator
  filter and the retention rule above.
- **A new "My kitchens" behaviour:** generate-new from an open kitchen asks Save / Discard; a Save creates a new
  list entry. This changes Step 1 / the editor flow, so it needs a mock-up (Claude Design) and a decision record.
  Its trigger is "the open kitchen has changes not in the list", to avoid asking when nothing was edited.
- **Names:** saved kitchens use the same generated name as presets (shape, size, finish colour) unless renamed.

### Owner's rulings on the last three questions, 2026-10-17 [owner]

- **Q-F3-7:** unverified accounts are deleted after **30 days**.
- **Q-F3-8:** visitors **without a profile cannot view the list of kitchens**; there is no list for them. They get
  the **same Save / Discard pop-up**. On **Save**, an unregistered visitor is **always told** that they will not be
  able to see the saved design unless they create a profile, and is advised to create one: this is the main moment
  to motivate registration. A pop-up explaining why a profile is worth creating may also appear from time to time
  (cadence in the plan, dismissible, never blocking). **Open point for the plan:** where an unregistered Save is kept
  (the browser, as today) and what is claimed at registration; item 20 claims the designs held by the visitor cookie.
- **Q-F3-9:** a client may **hide** a sent kitchen from their own list. Before hiding, a **warning** says they
  already sent it to the shop and, once hidden, **cannot edit it later**. The hide is a **mark on the design**, not
  a deletion: the **operator and administrator still see it** (it stays for the marketing team). Only a **GDPR
  erasure request** removes it. A draft (not sent) the client deletes may be removed for real after the same kind of
  confirmation.

### Dated note, 2026-10-20: Q-F3-5 and Q-F3-8 are reversed in part by the owner (O1) [owner, relayed by the coordinator]

The rulings above are kept as written. On 2026-10-20 the owner ruled that the configurator has **no Save / Discard
buttons: autosave only**. Consequences, recorded in ADR 0172 Amendment H:

- **Q-F3-5.** The "Save or Discard" pop-up is **withdrawn**. "The client keeps all kitchens they generated" **stands**,
  and autosave is what delivers it: every kitchen is a list entry from its first save, and generating or copying a
  preset adds an entry.
- **Q-F3-8.** The "same Save / Discard pop-up" for a visitor is **withdrawn**, and so is "on Save, always told". The
  intent, motivating registration, is kept differently: a non-modal card on Step 1, shown once per document to a
  visitor after confirming Back from an edited editor (frame A16B, owner ruling O28a). Visitors still have no list of
  kitchens.
- The "Consequences" bullet below, "A new 'My kitchens' behaviour: generate-new from an open kitchen asks Save /
  Discard", no longer holds.

### Consequences [inference]

- **The wording "this can be undone" in the dictation is read as "cannot be undone by the client"** (the warning
  says they lose the ability to edit). Confirm in **Q-F3-10**: may the client **unhide** a hidden sent kitchen, or
  only an operator / administrator?
- A design gets a **`hiddenByClientAt`** mark beside the **`sentAt`** mark. Client queries exclude hidden designs;
  staff queries show them with a "hidden by client" badge. Retention: drafts 365 days, sent and hidden kept until
  erasure.
- The unregistered Save needs a place to live. The ADR 0114 / 0115 rule (a design opens only in its own browser)
  already holds that copy; the plan decides whether a visitor has a small local-only list or just the one current
  design. The owner's ruling says no list is viewable, so **proposal: no list, one current design, Save is a
  confirmation only**, which also matches the registration nudge.
- Unverified-account cleanup (30 days) joins the nightly retention job; any designs claimed by an account that is
  then deleted for being unverified return to the anonymous rule.

- **Q-F3-10 answered (owner, 2026-10-17):** **only staff can unhide** a hidden sent kitchen; the client cannot.
  Unhiding needs an operator / administrator capability (`design.unhide`, proposal: both roles) and is audit-logged.
  The client's hide warning says so.

**Nothing in Fix 3 remains open for the owner.** The next step is the decision record.

### Order of this fix

1. The ADR (amends 0115 and 0019, adds the RBAC and GDPR decisions).
2. The owner builds the dashboard screens in Claude Design from the screen list above.
3. M8B is replanned with security review on every wave; the preset gate of Fix 2 is replaced by the administrator
   capability `preset.create`.

---

## Order of work

1. Fix 1: reproduce, rule on Q-F1-1 / Q-F1-2, write the ADR, build, review.
2. Fix 2: ADR 0112 amendment, then the preset milestone above.
3. Accounts, roles and the dashboard (Fix 3).
