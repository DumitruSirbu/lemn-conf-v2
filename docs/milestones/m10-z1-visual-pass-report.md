# M10 Z1 visual pass report (section 13.3)

Run 2026-11-11, branch `m10-price-dashboard`, HEAD `d3cb086b`, tree not edited. Verifier: Claude (visual subagent).

## How it was run (what was executed)

- Production build (`pnpm run build`, exit 0) and `next start` on port 4322, no watcher. Each Playwright invocation started a
  fresh server, so the in-memory fake price book reset to version 1 ("Sample book") on every run. Evidence is in the
  gitignored `testing-reports/2026-11-11-m10/` (`app/` app shots, `mock/` mockup frame shots, `pairs/` mock|app side by
  side, `run-log.jsonl` metrics and notes).
- Server environment: the repo's own `playwright.config.ts` webServer env (imported by a scratch config outside the
  repo), i.e. the staging database from `.env.test.local` as `DATABASE_URL` (guarded), `LEMNARIA_E2E_FAKE_PRICE_BOOK=1`,
  fake mail, a run-scoped `DIGEST_SECRET`. No production access; no secret printed; no env var changed.
- Viewports set before load: desktop 1440x900; phone 390x844 with `hasTouch` and `isMobile`. Console and page errors were
  collected for every page.
- Staging cleanup: every planted staff world reported `left` all zero; minted designs were deleted by the repo helper.
  The only exception is noise: one run's `removeStaffWorld` threw its own "counters > 0" assertion after removing rows
  (it only visited catalogue pages); its `left` figures were zero.
- The server on 4322 is stopped (no listener). A leftover server of an earlier backgrounded attempt (pid 55206, started by
  this run) was killed. The stale `next-server` pid 71592 (started Nov 8, not mine) was not touched.

## Important limits of what the run can show

- **Fake price book.** Everything that needs a real store is not verified: usage counts above 0 (the fake book reports 0
  saved kitchens using anything, confirmed: a planted account-owned kitchen on veneer and Hettich still showed "Folosit
  ... 0"), audit rows' detail text, cross-page persistence on real stores, U6 failed and refused-save states of D9.
- D7E (busy) and D7G (failed) were produced by delaying or aborting the publish request with `page.route`: injected, not natural.
- **Pair inspection depth.** I compared mock and app side by side and read the image for: D2B, D3A, D7A, D7B, D7E, D7F, D7G,
  D8B, D8C, D1M, D7M, C1, C2, C3, C4D, and the 1440 settings confirm. All other frames were captured, measured
  (overflow, 44 px targets, console) and their text read from the DOM, but **not** inspected line by line against the mock; the
  table says "captured" for those. The owner accepted frame deviations as built, so none is a blocker.
- No pixel comparison tool was used; "pixel comparison of D7A-G, D7M, D8A-C" is a human reading of the pairs above only.

## Defects and observations (evidence-backed)

1. **React error #418 (hydration mismatch) on every customer editor load**, production build. `pageerror` "Minified React error
   #418 (args HTML)" fired 17 times in the run, on `/ro/d/<id>`, `/ru/d/<id>` (phone, 1440 desktop, and a signed-in client
   page); a dedicated probe showed exactly one per load (1 after the first open, 2 after a reload) and none on the room
   page or on any staff page. Not diagnosed (minified; no dev-mode run) and not shown to be an M10 regression. Worth a
   dev-mode look. Evidence: `run-log.jsonl` (`pageerror` lines), note frame `418`.
2. **Stale failure banner during a retry (D7E after D7G).** After a failed publish, retrying through the confirm dialog shows
   "Se publică..." in the dialog while the red "Versiunea nu a fost publicată" banner stays on the page behind it
   (`app/d7e.png`). Probably acceptable; the mock does not draw this combination.
3. **Phone editor top bar targets under 44 px** (customer editor, not a dashboard surface): settings pill 136x30 (139x30
   unresolved, 150x30 ru), language button 47x25 at 390. Measured by `measureTargets` on every C frame. Pre-existing
   surface; recorded because §13.3 asks for 44 px. All staff pages at 390 (D1M, D2M, D3M, D5CM, D7M, D8, D9, D10 lists)
   measured **0** controls under 44 px and **0** px sideways overflow.
4. At 1440 the price-breakdown link "De ce acest preț?" is 90x11.5 px (pointer surface, text link).
5. Console: every page logs the warning "Error with Permissions-Policy header: Unrecognized feature: 'ambient-light-sensor'"
   (107 times). No `Fast Refresh` or `Context Lost` line anywhere (production build). Two console errors are the
   deliberately aborted publish and one deliberate 400 of my own malformed PUT.
6. The settings sheet footer at 390 wraps "de la" onto its own line beside "86 000 MDL" (`app/c2.png`); the mock stacks them.
7. Phone pill `aria-label` for an MDF kitchen includes a raw hex ("MDF vopsit mat, #eceeeb").

No functional defect in the dashboard surfaces was found.

## Behaviour checks observed

- D2C: Enter on the price button opens the field and focuses it; Esc closes it and the price is unchanged. Invalid 3965
  shows the "multiple of 10" error.
- D2D, D4E, D5C, D6C, delete dialog, D7B: initial focus inside (Anuleaza, or the input for D2D), `aria-modal=true`, 12 Tabs
  stay inside, Esc closes, focus returns to the trigger (D2D), to the switch (D4E, D5C, D6C), to the delete button.
- D3A: typing 4200 into "Pret la 600 mm" changes the sentence ("600 mm costa 4 200 lei...") and the NOU cells without saving;
  an invalid value shows the error and keeps Save disabled.
- D7: publish confirmed -> version 2 active, history shows it; a customer already priced at the old version then saw the C1
  notice "Preturile s-au actualizat..." ("Am inteles"). D8: version 2 diff vs 1, archived-with-diff detail and restore dialog work;
  restore adds to "De publicat" and publishes nothing.
- C4 forced flow end to end at 390: sheet, choose, apply, confirmation (C4A-C4C).
- D1M: menu opens as a sheet, Esc closes it.

## Owed items from the task

| Item | Result |
| --- | --- |
| Settings sheet at 1440 | Reproduced: `app/c2-desktop-settings.png`, `c3s-desktop-settings.png`; the "Culorile alese se vor pierde" confirm at 1440 inspected (`settings-confirm-desktop.png`). Sheet closes, dialog is centred, no overflow. |
| Cleared colour row | **Not reproduced.** Tried: a kitchen on a vanished material with a PAL colour, replaced by MDF (`cleared-0..2`): the sheet shows only the material row, and after choosing the confirmation has no colour row. A cleared colour row needs a colour switched off in the book, which no dashboard screen does (colours are "se gestionează separat"). |
| Audit detail text, "Toate preturile sunt publicate" zero state on three pages, cross-page persistence on real stores, D9 failed/refused states | **Not verified** (fake store). The zero-state banner was seen on the staff header ("Toate preturile sunt publicate" on D1M) only. |

## Frame table

Legend: reproduced yes/no; "captured" = shot taken and DOM text read, pair not read line by line. Paths are under
`testing-reports/2026-11-11-m10/` (`app/<name>.png`; side by side in `pairs/<name>.png`).

| Frame | Surface | Reproduced | Deviation | Screenshot |
| --- | --- | --- | --- | --- |
| D1A | desktop | yes | Entry is the generic account login ("Intra in cont"), with a "Verificarea nu se poate incarca" line in this environment | app/d1a |
| D1B | desktop | no | Submit is `aria-disabled` (verification widget cannot load here), so wrong-data state not reachable | none |
| D1C | desktop | yes (captured) | Language control reads "RU Русский" (other language), not "RO v"; no Administrare group (Personal, Presete, Traduceri) | app/d1c |
| D1D | desktop | yes | Operator sees only "Bucatarii clienti" | app/d1d |
| D1M | 390 | yes | Sheet lists Profil, Iesi din cont, Iesi de pe toate dispozitivele; no Administrare group; no count badge | app/d1m |
| D2A | desktop | yes (captured) | Depth card stacked, not a row; no "+" prefix; no Administrare group; sample numbers differ | app/d2a |
| D2B | desktop | yes | Sidebar badge and "N de publicat" chip are in the app; the top-bar "N preturi de publicat" pill is present on D7 and not seen on this frame (page scrolled) | app/d2b |
| D2C | desktop | yes | Hint "Enter salveaza ... Esc anuleaza" present | app/d2c, d2c-after-esc |
| D2D | desktop | yes (captured) | Dialog fields as in plan | app/d2d |
| D2E1 | desktop | yes (captured) | | app/d2e1 |
| D2E2 | desktop | yes (captured) | | app/d2e2 |
| D2E3 | desktop | yes (captured) | | app/d2e3 |
| D2ER | desktop ru | yes (captured) | no overflow | app/d2er |
| D2M | 390 | yes (captured) | 0 targets under 44, no overflow | app/d2m, d2m-full |
| D2R | desktop ru | yes (captured) | no overflow | app/d2r |
| D3A | desktop | yes | Switch rows drawn as rows, "Activ/Nou" preview columns show a dash until a new value; model dimensions differ from the mock; live recalculation verified | app/d3a-initial, d3a-typing, d3a-typed-valid |
| D3B | desktop | yes (captured) | | app/d3b |
| D3C | desktop | yes (captured) | invalid "minus" step | app/d3c |
| D3D | desktop | yes (captured) | | app/d3d |
| D3E | desktop | yes (captured) | customer-supplied hood | app/d3e |
| D3F | desktop | yes (captured) | | app/d3f |
| D3G | desktop | yes (captured) | | app/d3g |
| D3M1 | 390 | yes (captured) | 0 small targets | app/d3m1 |
| D3M2 | 390 | yes (captured) | | app/d3m2 |
| D3R | desktop ru | yes (captured) | | app/d3r |
| D4A | desktop | yes (captured) | | app/d4a |
| D4B | desktop | yes (captured) | | app/d4b |
| D4C | desktop | yes (captured) | new-class form | app/d4c |
| D4D | desktop | partly | Default class: delete is `aria-disabled` with reason. Blocked-because-used not reachable (fake book counts 0); enabled delete dialog also shot | app/d4d, d4d-delete-dialog |
| D4E | desktop | partly | Unused wording ("Ramân disponibile ..."); the used / new-rule variant is not reachable | app/d4e |
| D4F | desktop | yes | Menu shows disabled "Dezactiveaza" and "Sterge" with reasons for the default class | app/d4f |
| D5A | desktop | yes (captured) | | app/d5a |
| D5B | desktop | yes (captured) | | app/d5b, d5b-typed |
| D5C | desktop | partly | Unused wording only | app/d5c |
| D5CM | 390 | yes (captured) | dialog at phone, no overflow | app/d5cm |
| D5D | desktop | yes (captured) | Melamine delete `aria-disabled`, "Este optiunea implicita" | app/d5d, d5d-melamine |
| D5E | desktop | partly | Inactive material in list; "used" not reachable | app/d5e |
| D5F | desktop | partly | Inactive material edit page; "used" not reachable | app/d5f |
| D5G | desktop | yes | Dialog "Nu poti dezactiva ... cel putin o optiune activa" after the other two were off | app/d5g, d5g-click |
| D6A | desktop | yes (captured) | | app/d6a |
| D6B | desktop | yes (captured) | | app/d6b |
| D6C | desktop | partly | Unused wording only | app/d6c |
| D7A | desktop | yes | Bulk row shown expanded, mock collapsed; new value is plain text with a pencil, not the cream input; version name empty (mock prefilled); no Administrare group | app/d7a |
| D7B | desktop | yes | Same copy; initial focus Anuleaza | app/d7b |
| D7C | desktop | yes (captured) | Switch off, then publish opens the "Opresti Sume provizorii" dialog with a checkbox | app/d7c, d7c-dialog |
| D7D | desktop | yes (captured) | empty state | app/d7d |
| D7E | desktop | yes (injected) | Spinner in dialog button; stale failure banner behind (defect note 2) | app/d7e |
| D7F | desktop | yes | Version id "2" not "2026-12"; no row chevrons | app/d7f |
| D7G | desktop | yes (injected) | Matches mock | app/d7g |
| D7M | 390 | yes | Full-page capture shows the sticky publish bar over the rows (expected for a sticky bar); mock cards drawn as one-line rows, app as label/value stacks | app/d7m, d7m-top |
| D8A | desktop | yes (captured) | | app/d8a, d8a-three |
| D8B | desktop | yes | Archived version with a diff table and "Restaureaza" reproduced after two extra publishes; ids "2" | app/d8b-archived, d8b-v2 |
| D8C | desktop | yes | Same structure and copy | app/d8c-archived, d8c-v1 |
| D9A | desktop | yes (captured) | | app/d9a |
| D9B | desktop | yes (captured) | colour reset note | app/d9b |
| D9C | desktop | yes (captured) | saved | app/d9c |
| D10A | desktop | yes (captured) | | app/d10a |
| D10B | desktop | yes (captured) | | app/d10b |
| D10C | desktop | yes (captured) | changed again after seen | app/d10c |
| D10D | e-mail | no | Not a browser surface | none |
| C1 | 390 | yes | Notice as a card over the scene; bar reads "Verifica designul" and "Inapoi" not "Continua"; mock amounts differ | app/c1 |
| C2 | 390 | yes | Material is a radio list, not a chosen-row with "Schimba"; "Manere" row is further down the sheet | app/c2, c2-desktop-settings |
| C3 | 390 | partly | Sheet opens with a per-cabinet list; the Feronerie, Material, "Adancime 700 mm · adaos 12 %" and Accesorii lines are at the end; mock shows only the summary lines | app/c3, c3-top-phone, c3-bottom-phone |
| C3D | desktop | yes (captured) | | app/c3d, c3-top-desktop, c3-bottom-desktop |
| C3R | 390 ru | yes (captured) | no overflow | app/c3r, c3r-top |
| C3S | 390 | yes (captured) | | app/c3s, c3s-mdf-700 |
| C4A | 390 | yes (captured) | | app/c4a |
| C4AD | desktop | yes (captured) | | app/c4ad |
| C4AR | 390 ru | yes (captured) | pill reads "Материал", not clipped | app/c4ar |
| C4B | 390 | yes (captured) | | app/c4b |
| C4BD | desktop | yes (captured) | | app/c4bd |
| C4C | 390 | yes (captured) | confirmation shown | app/c4c |
| C4D | 390 | partly | Material and Feronerie rows owed; no struck "Manere" row, no "scos din bucatarie" accessory note (needs those kitchens) | app/c4d |
| C5A | 390 | yes (captured) | Note "Ai trimis deja aceasta bucatarie..." | app/c5a |
| C5AD | desktop | yes (captured) | | app/c5ad, c5ad-desktop |
