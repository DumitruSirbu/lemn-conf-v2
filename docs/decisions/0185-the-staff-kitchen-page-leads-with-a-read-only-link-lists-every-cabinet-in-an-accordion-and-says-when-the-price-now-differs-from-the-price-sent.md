# ADR 0185 — The staff kitchen page leads with a read-only link, lists every cabinet in an accordion, and says when the price now differs from the price sent

Status: **Accepted** (2026-11-14), after the owner's answers and the security read the same day; see *Owner rulings,
2026-11-14* and *Security read, 2026-11-14* below. Proposed earlier the same day. Owner feedback of 2026-11-14, item 7.
Nothing is built. The owner answered Q7-1 to Q7-4 (relayed by the coordinator): Q7-1, Q7-2 and Q7-4 as proposed;
**Q7-3 differently** (decision 7). The security read (relayed by the coordinator) found no blocker and asked for the
changes S1-S6 and N1, N2, N4, folded in below and marked with their finding number.
Date: 2026-11-14
Type: Decision record (staff UI; two new reads on the staff kitchen endpoint; supersedes part of an owner ruling and a
code-level convention)
Milestone: M12 — [`M12-owner-feedback-2026-11-14.md`](../milestones/M12-owner-feedback-2026-11-14.md), waves W6a-W6f

**Evidence tiers.** **[owner]**: `docs/OWNER_FEEDBACK.md`, *Round 2026-11-14*, item 7. **[mock]**:
`docs/design/mockups/Bucatarii clienti.dc.html` (copied 2026-11-14 from the owner's v3 export, sha256-checked by the
coordinator), with line. **[sec, relayed]**: a finding of the 2026-11-14 security read, relayed by the coordinator; its
`file:line` citations are the reviewer's, spot-checked by the architect. **[doc]**, **[src]** (at `c48992e8`), **[inf]**
as in ADR 0182.

## Context

The owner, on a sent kitchen's staff page: (1) most important, a link to view the kitchen read-only is needed; the
request id ("Cererea trimisă: LM-…") is useless as it stands, the owner does not see how to use it to view the kitchen;
(2) the full list of cabinets, shown as when the client reviews the kitchen ("Verifică designul"), in an accordion that
can be hidden and shown; (3) when the client sent, then edited, is the difference in price shown? Both lines read "De la
57 000 MDL" [owner].

**What is built.** M11 W3b put a "Deschide în 3D" link under the picture (`staff-kitchen-page.tsx:269-277`,
`staff-kitchen-3d-link.tsx:15-35` [src]; ADR 0180). The request card prints the reference and date and says the contact
is in the shop's e-mail (`staff-kitchen-request.tsx:112-131` [src]). The estimates card prints "Trimis" (the total
stored with the request, never priced again, ADR 0154) and "Acum" (the kitchen as it stands, priced with today's book)
(`kitchen-estimates.tsx:26-49`; `lib/server/staff/staff-kitchen-estimates.ts:20-58` [src]). Each is drawn by
`describeStartingPrice`, which rounds a total **up to the thousand** (`price/starting-price.ts:26` [src]). So two
different totals inside one thousand print the same figure — the likely reason the owner saw two equal lines **[inf:
the screenshot's exact totals were not read; falsified if they were equal]**. The D10B list under the picture shows
only the cabinets the two copies do not share (`kitchen-version-switch.tsx:85-120` [src]).

**What the owner's new design says.** The S3 revision [mock: `:22`, `:287`]: left column = preview with angles, a
**"Link către bucătărie" card badged "Doar citire"** (the URL, a copy action, "Deschide în 3D", the note "Se deschide
într-o filă nouă, în 3D, fără comenzi de editare și fără „Cere oferta”") [mock `:203`], then the **full cabinet list as
an accordion grouped by wall and band, as on the client's review page** [mock `:210`, `:287`]: header "Configurația
trimisă/actuală", "N corpuri", a room line, a settings line ("PAL melaminat · Feronerie Hettich · Alb mat") and
"Extinde tot / Restrânge tot"; each group a 52 px header button with `aria-expanded`; rows: name, width · handle, an
amount, and "Nou după trimitere" on a body added after sending [mock `:204-210`, `:289`]. Middle column = contact,
then **price and status**. **"ID-ul cererii nu mai apare: nu duce nicăieri"** [mock `:287`]. The price card
[mock `:212`]: when the prices match, one line "Trimis și actual: de la …" and "Prețul nu s-a schimbat de la trimitere";
when they differ, a warning card "Diferă" with "La trimitere" and "Acum" and the **signed difference** ("+4 400 MDL"),
*"prețul arată ambele valori cu diferența cu semn (nu doar culoare)"* [mock `:288`]. "SUMM înlocuit de CABS
(configurație + corpuri) și PRC (preț)" [mock `:214`].

## Decision

1. **A read-only link card stands under the preview** (left column; on a phone right after the preview). Title "Link
   către bucătărie", badge "Doar citire", the absolute address of the staff 3D route as selectable text, a "Copiază
   linkul" button, the existing "Deschide în 3D" link (new tab, `noopener noreferrer`), and the note. The address is
   ADR 0180's route, `/{locale}/staff/kitchens/{id}/3d` with `?version=` for the copy on screen (ADR 0180 d1, d5), not the
   mockup's `/staff/k/…`. It mints no share link (ADR 0180 d7) and is useless to anyone outside the staff gate.
   **The origin is `window.location.origin`, read after mount, or the configured `LEMNARIA_PUBLIC_ORIGIN`; never a
   request's `Host` or `X-Forwarded-Host`** [sec N1].
2. **The request reference leaves the page (owner, Q7-1, 2026-11-14).** The request card keeps its title and the sentence that
   the request's contact is in the shop's e-mail; the sent date stays in the header line ("Trimisă de … · {date}",
   `staff-kitchen-facts.ts:73-91` [src]). This **partly supersedes ADR 0174 O-L3-1 (c)** ("the request's reference and
   date"), by the owner's answer to Q7-1. **The now-unread `reference` also leaves the staff kitchen detail wire and its
   statement** [sec N2]: nothing reads it, so nothing carries it.
3. **Every cabinet is listed, in an accordion, as the client's review lists it.** Groups and order are
   `projectDesignForDisplay`'s (wall, then band); each row's name and facts are the review's row detail (width, the
   body's own finish when it has one, the handle it wears; `review/review-model.ts:278-300` [src]), reused, not
   re-derived. The list shows the copy on screen (sent or current, the version switch); with both copies readable, a body
   added after sending is tagged "Nou după trimitere" and one that differs keeps D10B's mark; removed bodies are listed
   under their group with D10B's mark. Each group header is a button with `aria-expanded`; "Extinde tot / Restrânge tot"
   sets all; the state lives in memory while the page is open. Default open: the first two groups on a desktop, the first
   on a phone [mock `:210`, `:221`].
4. **Row amounts are never invented (default of Q7-2).** The *current* copy's rows show its lines priced with the active
   book, the same pricing as the "Acum" figure. The *sent* copy's rows show the amounts stored with the request, read
   from the request's stored priced snapshot and never priced again (ADR 0154; the column is `contact_submissions.priced`,
   already read for the total, `persistence/src/staff-kitchen-statements.ts:206-215` [src]; classed non-personal by
   `0008`'s header and granted alone by `0026:48-55` under ADR 0178 F2 [doc] — not by ADR 0153). A row with no stored
   amount shows none. Until that read is built, the sent copy's rows show no amounts.
   **How the lines are read** [sec S5]: projected **in SQL** to `{placementId, amountMinor}` for lines whose `kind` is
   `'cabinet'` only, at most `MAX_PLACEMENTS` of them (`configurator-domain/src/design-bounds.ts:100` [src]); the reader
   accepts an id only as a string of at most `MAX_IDENTIFIER_LENGTH` (`:65` [src]) and an amount only as a safe integer,
   and drops anything else; the client keys amounts by a `Map` or `Object.hasOwn`, never a plain object lookup, so an id
   such as `__proto__` cannot reach a prototype.
5. **The price card says whether the price now differs from the price sent, and by how much.**
   - **Same** iff both figures exist, in the same currency, and their exact totals in minor units are equal. One line,
     "Trimis și actual", and "Prețul nu s-a schimbat de la trimitere."
   - **Different** otherwise when both exist: two lines ("La trimitere", "Acum") as rounded figures, a "Diferă" marker,
     and the signed difference of the exact totals as a line amount (ten lei, `describeLineAmount`), so a difference
     inside one thousand is still visible. Sign in text, never colour alone.
   - **The note says what is known.** If the two copies differ (`versionsOf`, `staff-kitchen-facts.ts:22-28` [src]):
     "Clientul a modificat bucătăria după trimitere." If they do not: the kitchen is unchanged and the price now is worked
     out with today's prices and rules (a publish, or a rule change such as ADR 0182, can move it). Never the mockup's
     "Clientul a modificat…" for an unchanged kitchen.
   - **No difference is computed** when the sent total is missing, the current one is refused or empty, or the
     currencies differ; each case keeps today's sentence.
6. **The right column's summary card folds into the accordion's header (default of Q7-4)**: shape, walls, material,
   hardware, finish and the cabinet count move into the header's room and settings lines; the whole-kitchen facts that
   differ between the copies keep their mark and "în varianta trimisă: …" there.

7. **The contact block is the account's profile, with "Sună" and "Scrie" (owner, Q7-3, 2026-11-14).** The owner
   pointed out that the page already shows the client's e-mail, name and phone under "Contul clientului · Din profil",
   and asked what the difference was. Ruling, as relayed: build the mockup's contact block [mock `:215-216`] **from the
   account profile the page already reads** (ADR 0174 O-L3-1 (c)), never from the request's personal columns (ADR 0153
   d1 kept), and add "Sună" (`tel:`) on the profile phone and "Scrie" (`mailto:`) on the profile e-mail; show the
   locality only if the profile carries it.
   - **Source.** The block is the existing profile card (`staff/staff-kitchen-client.tsx` [src]), first in the middle
     column, titled "Contul clientului" with the "Din profil" tag. E-mail, name, phone ("neverificat" kept beside it, the
     profile phone is unverified) and **the profile's `accounts.address`**, labelled "Adresă / localitate" — the
     profile's own wording [sec N4] (the profile form's leaf `accountProfile.addressLabel` reads "Adresă / localitate
     (opțional)", `apps/web/src/messages/ro.json:982` [src]; the staff page shows it without the form-only "(opțional)") —
     shown only when non-null. The staff read does not select `address` today (`persistence/src/staff-kitchen-statements.ts:89`,
     `:194` [src]); `SELECT` on `accounts` is table-wide (`migrations/0017_add_account_profile_columns.sql:28` [doc]), so
     no grant changes.
   - **`address` travels on the detail wire only** [sec S1]. Today one type serves list and detail
     (`StaffKitchenClient`, `persistence/src/staff-kitchen-reader.ts:92`, `:177`; `StaffClientWire`,
     `staff-kitchens-wire-contract.ts:57`, `:105`; `clientWireOf`, `lib/server/staff/staff-responses.ts:282`, `:329`,
     `:469-473` [sec, relayed]). The detail gets its own client type and wire mapper carrying `address`; the list's stay
     as they are. The list statements neither select nor search `a.address`.
   - **`tel:` is built from the domain's normal form, never from the typed text.** The value is
     `normalisePhoneNumber(profile.phone)` (`configurator-domain/src/contact/phone-number.ts:43-52` [src]), the same
     normaliser the profile's stored `phone_normal_form` came from (ADR 0179). A link is drawn only when the normaliser
     accepts and its normal form matches `^\+[1-9][0-9]{6,14}$`; the `href` is `tel:` + that normal form and nothing
     else. Otherwise the phone is plain text and no "Sună" is drawn.
   - **`mailto:` is built from the stored address with nothing after it** [sec S3]. A link is drawn only when both hold:
     the stored address matches the allowlist `^[A-Za-z0-9._'+-]+@[A-Za-z0-9.-]+$`, and
     `judgeAccountEmail(stored)` (`configurator-domain/src/account/account-fields.ts:119` [src]) is `ok` **and** its
     judged e-mail equals the stored string exactly. The `href` is `mailto:` + the stored address, with no query (no
     subject, body, cc or bcc). Otherwise the e-mail is plain text and no "Scrie" is drawn.
   - The actions are anchors with visible text, 44 px targets, no `target`, and carry the value they act on in their
     accessible name: "Scrie la {email}" with the typed address wrapped in `isolated()`
     (`apps/web/src/staff/bidi-isolate.ts` [src]); "Sună la {phone}" with **the dialled normal form** (the `tel:` value),
     also isolated [sec S4].
   - The request's own contact still lives only in the shop's e-mail; the request card's sentence saying so stays.

## Must not

- **No contact from the request.** The request's personal columns of `contact_submissions` (name, phone, locality,
  channel) are not read (ADR 0153 d1, ADR 0174 O-L3-1); the mockup's "Din cererea trimisă" source label is not drawn.
- **No link from unvalidated text.** No `tel:` or `mailto:` is built from a value decision 7's rules refuse, and none
  carries a query or a second scheme.
- **No `address` on the list** [sec S1]: the list wire has no `address` key; the list statements neither select nor
  search `a.address`.
- **No origin from the request** [sec N1]: the copyable address never uses `Host` or `X-Forwarded-Host`.
- **No share link minted, and `/s/{token}` untouched** (ADR 0180 d7).
- **No figure priced with today's book beside the sent copy** other than the "Acum" estimate (`staff-kitchen-view.tsx:
  294-296`'s reason).

## Alternatives considered

- **Keep the reference, relabelled as the shop e-mail's reference.** Rejected by the owner (Q7-1).
- **Compare the rounded figures.** Rejected: equal figures would print "Prețul nu s-a schimbat" over a real difference
  of up to 990 MDL, which is the owner's exact observation.
- **Price the sent copy's rows with today's book.** Rejected: rows would contradict the stored total they belong to.
- **Price the as-sent copy with today's book to split the difference into "client edit" and "price change".** Correct
  but a second server pricing per read; deferred, recorded as the next step if staff need the split.

## Sweep

| Record | What it says | Settled how |
| --- | --- | --- |
| ADR 0174 O-L3-1 (c), owner 2026-10-20 | The staff view shows profile contact, the request's reference and date, the as-sent kitchen | **Reference superseded by owner Q7-1**; date (header), profile contact (extended, d7) and as-sent kitchen kept |
| ADR 0153 d1 | No personal column of a request is read | Kept; the request contact block is a must-not |
| ADR 0178 F2; migration `0026:48-55` | `GRANT SELECT (priced)` alone on `contact_submissions`; `priced` is non-personal (`0008`'s header); *"any wider SELECT on that table is forbidden"* | The grant the sent lines ride on; unchanged, no new grant. Dated note owed on ADR 0178 (F2's column now also yields per-cabinet lines) [sec S2] |
| ADR 0173 (`:64`) | *"The staff profile block does **not** show the client's postal address; only e-mail, name and phone"* | **Superseded by owner Q7-3** (decision 7: the profile's address is shown, detail page only). Dated note owed on ADR 0173 [sec S2] |
| ADR 0154 | The shop's notice is the stored review, never priced again | Kept; the sent figure and the sent rows come from what was stored |
| ADR 0180 d1, d5, d7 | Staff 3D route; the page links to the version on screen in a new tab; no share link | Kept; the link card wraps the existing link. Dated note owed (placement and the copyable address) |
| M11 W5 / `claude-design-brief-staff-cabinet-list.md` | The cabinet list waited for a Claude Design round trip; open questions on amounts, depth, print | **Discharged by this mockup [inf]**: amounts drawn per row (d4); depth not per row; no print action |
| ADR 0104 Amendment H | Departures from a frame are recorded | Departures: the contact block's source (profile, not request), the route's address. README note owed |
| `staff-kitchen-page.tsx:70-72` and `staff-kitchen-client.tsx:9-10` (code comments, M8B Lot 3) | *"no address or phone is made a link"*; *"a staff screen does not do either on a click"* | **Swept: no ADR records this rule** (searched `docs/decisions/` for `tel:`, `mailto:`, "made a link", "not a link", and ADR 0173, ADR 0174 and the Lot 3 plan for the same). It was a code-level convention, **reversed by the owner's Q7-3 ruling**; the two comments are rewritten in the wave that builds decision 7 |
| ADR 0163 d9, ADR 0165 | The customer-facing shop number is a `tel:` link from one constant; the shop's notice carries `tel:` and an encoded `mailto:` | Precedent for deriving a link from a validated value; unchanged |
| ADR 0179 | The profile holds `name`, `address`, and the `phone` / `phone_normal_form` pair from one normaliser | Decision 7 reads `address` and re-derives the normal form with the same normaliser |
| Code comments that state the old rule [sec S2] | `persistence/src/staff-kitchen-reader.ts:74-75` (*"The postal address … never read"*), `apps/web/src/staff/staff-kitchens-wire-contract.ts:35` (*"No postal address"*), `persistence/src/staff-kitchen-statements.ts:30-31` (the kitchen's statement takes *"the total and the currency alone"* of `priced`) | Rewritten in W6d, where the code they describe changes |
| `starting-price.ts` rounding (owner M10 Q1c) | A total is shown rounded up to the thousand; a line to ten lei | Kept; the difference is a line-precision amount |

## Consequences

- The staff kitchen **detail** read gains the stored sent lines and the profile's `address`, and loses the request
  `reference` (W6a, W6d): a persistence statement, the reader, a detail-only client type, the wire contract and its
  reading.
- **Privacy notice, owed** [sec S6]: the notice is still a placeholder (`apps/web/src/account/privacy-notice-stub.tsx`
  [src]). When it is written it must say that Lemnaria's staff see a client's profile name, phone and address with the
  kitchens the client sends. Recorded as an owed launch item, not built here.
- The D10B list (`KitchenVersionCabinets`) and the summary card are replaced by the accordion; their tests move with
  them.

## Owner rulings, 2026-11-14 [owner, relayed by the coordinator]

- **Q7-1:** remove the `LM-` reference (decision 2).
- **Q7-2:** sent rows show stored amounts, current rows today's (decision 4) — default stands.
- **Q7-3:** not the default. The owner asked what differs from the profile contact the page already shows; ruling:
  build the contact block from the account profile, add "Sună" / "Scrie", locality only if the profile carries it, no
  request personal columns (decision 7).
- **Q7-4:** fold the summary card into the list header (decision 6) — default stands.

## Security read, 2026-11-14 [sec, relayed by the coordinator]

No blocker; accept after these changes, all folded in above:

- **S1** — `address` on the detail wire only; a detail-only client type and mapper; tests that the list wire has no
  `address` key and the list statements neither select nor search `a.address` (decision 7, *Must not*).
- **S2** — the sweep gains ADR 0173 `:64` (superseded by Q7-3), the three stale comments W6d rewrites, and the
  `priced` grant cited as `0026:48-55` / ADR 0178 F2 rather than ADR 0153; dated notes owed on ADR 0173 and ADR 0178.
- **S3** — the `mailto:` allowlist plus `judgeAccountEmail` equality (decision 7).
- **S4** — accessible names wrap the typed value in `isolated()`; the phone's name uses the dialled normal form.
- **S5** — sent lines projected in SQL to `{placementId, amountMinor}`, cabinet lines only, bounded; ids and amounts
  checked by the reader; keyed by `Map` / `Object.hasOwn` (decision 4).
- **S6** — the privacy notice line is owed, not done (*Consequences*).
- **N1** — the link's origin is `window.location.origin` after mount or `LEMNARIA_PUBLIC_ORIGIN`, never request headers.
- **N2** — the unread `reference` leaves the detail wire and statement (decision 2).
- **N4** — the address is labelled "Adresă / localitate", the profile's wording.
