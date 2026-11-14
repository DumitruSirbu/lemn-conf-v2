# Screen inventory — mockup codes against what is built

Date: 2026-11-14. Every screen code drawn in `docs/design/mockups/`, grouped by page, and whether the app has it.

**Evidence tier.** Codes and names are read from the mockup files. "Built" means a route or component exists in
`apps/web/src` and a commit or STATUS entry records the wave (source-verified by file presence and `git log`).
Nothing here was run in a browser; a screen marked built may still differ from its frame in detail.

Code prefixes: no prefix = mobile frame, `D` = desktop frame of the same screen (`DS1E` = desktop of `S1E`).
Letters after the number are states of one screen (`S2A` loading, `S2B` results, …).

---

## 1. Implemented

### Configurator — Step 1, Room and preset (`/configurator/room`)
Mockups: `Lemnaria Configurator Mobil.dc.html`, `…Desktop.dc.html`, `Presete.dc.html` (v2, M8D).

| Code | Screen |
| --- | --- |
| 1A / D1A | Room shape · nothing selected |
| 1B / D1B | Dimensions · L selected, valid |
| 1C / D1C | Dimensions · validation error |
| 1D / D1D | Presets · waiting (only after 250 ms) |
| 1E / D1E | Presets · list (1, 3, 8, scrolled, image failed, long name, RU, RU 320) |
| 1F / D1F | No preset fits → generate to measure |
| 1G / D1G | Preset preview carousel (first/middle/last slide, single, image loading/failed, focus order, RU) |
| 1H a–c | Choosing a preset · creating, error, daily limit |

### Configurator — Step 2, Configure in 3D (`/configurator/configure` → `/d/[id]`)
| Code | Screen |
| --- | --- |
| 2A / D2A | Nothing selected · live scene |
| 2B / D2B | Cabinet selected · panel |
| 2C / D2C | Edit rejected · back to last valid value |
| 2D / D2D | Price breakdown |
| 2E / D2E | Global settings · material and hardware |
| 2F / D2F | WebGL unavailable |
| 3S / D3S | "Salvează ca preset" chip in the editor |
| 3T a–h / D3T | Save-as-preset dialog (typed, waiting, saving, saved, refusals, RU) |

### Configurator — Step 3, Review (`/d/[id]/review`)
| Code | Screen |
| --- | --- |
| 3A | Summary · top |
| 3B | Summary · bottom, what is not included |

### Configurator — Step 4, Contact (`/d/[id]/contact`)
| Code | Screen |
| --- | --- |
| 4A | Empty form |
| 4B | Validation errors |
| 4C | Sending |

### Configurator — Step 5, Success (`/d/[id]/done`)
| Code | Screen |
| --- | --- |
| 5A | Request sent |
| 5B | Sending failed |

### Account — Lot 1, sign-in (`/account/…`) — `Lemnaria Cont Lot 1.dc.html`
| Code | Screen | Route |
| --- | --- | --- |
| A1 | Înregistrare (register) | `/account/register` |
| A2 | Verifică-ți e-mailul (check inbox) | after register |
| A3 | Confirmă adresa (confirm e-mail) | `/account/verify-email`, `/account/confirm-email` |
| A4 | Intră în cont (log in) | `/account/login` |
| A5 | Parolă uitată (forgot password) | `/account/forgot-password` |
| A6 | Parolă nouă (new password) | `/account/reset-password` |
| A7 | Turnstile slot (component) | in the account forms |
| A8 | Erori comune (shared errors) | all account pages |

### Account — Lot 2, client area — `Lemnaria Cont Lot 2.dc.html`
| Code | Screen | Route / note |
| --- | --- | --- |
| A9 | Bucătăriile mele (my kitchens) | `/account/kitchens` |
| A10 | Profil | `/account/profile` — **the e-mail change part is built but switched off** (`EMAIL_CHANGE_ENABLED = false`) |
| A11 | Schimbă parola | `/account/password` |
| A12 | Exportă datele mele | `/account/export` |
| A14 | Ieși din cont (log out) | `POST /api/account/logout` |
| A16B | Account card without an account (visitor) | Step 1 |
| A17 | Ascunzi o bucătărie trimisă? (hide dialog) | A9 dialog |
| A18 | Atașezi bucătăriile din acest browser? (claim dialog) | after A3/A4 |
| A19 | Account control in the header | configurator + account pages |
| A20 | Sesiune expirată · fără acces | all |

### Staff area — Lot 3 (`/staff/…`) — `Lemnaria Cont Lot 3.dc.html`
| Code | Screen | Route |
| --- | --- | --- |
| S1 (A–E) | Staff shell: operator menu, admin menu, session expired, 403, account menu (`DS1E`) | all `/staff` pages |
| S2 (A–F) | Bucătării clienți (client kitchens list) | `/staff/kitchens` |
| S3 | Bucătăria clientului · doar citire (+ "Deschide în 3D", M11 W3b) | `/staff/kitchens/[id]`, `/staff/kitchens/[id]/3d` |
| S8 (A–E) | Jurnal de audit (audit log) | `/staff/audit` |

### Price dashboard — M10 (`/staff/catalog/…`) — `Lemnaria Dashboard.dc.html`
| Code | Screen | Route |
| --- | --- | --- |
| D1 | One panel: entry and menu | staff shell |
| D2 | Dulapuri · lista (cabinets list) | `/staff/catalog/cabinets` |
| D3 | Dulapuri · cabinet and its price | `/staff/catalog/cabinets/[ruleId]` |
| D4 | Feronerie (hardware) | `/staff/catalog/hardware`, `/new`, `/[tierId]` |
| D5 | Materiale (materials) | `/staff/catalog/materials`, `/[tierId]` |
| D6 | Accesorii (accessories) | `/staff/catalog/accessories`, `/new`, `/[accessoryId]` |
| D7 | Publicare prețuri (publish) | `/staff/catalog/publish`, `/[versionId]` |
| D8 | Publicare · istoric (history) | `/staff/catalog/publish/history` |
| D9 | Setări implicite (defaults) | `/staff/catalog/defaults` |
| D10 | Bucătării clienți · changed after sending | extends S2 |

---

## 2. Not implemented

| Code | Screen | Why |
| --- | --- | --- |
| **S4** (A–K) | Personal — staff list and invitation (`/staff/team`, `/staff/accept`) | Blocked: O-L3-4 needs its decision record and a security review first (ADR 0174; STATUS "Still blocked: the S4 and S5 waves"). |
| **S5** (A–G) | Presete — admin grid: hide/show, reorder, preview | Blocked the same way: O-L3-5 needs an ADR 0112 amendment and a security review (ADR 0174). The "Presete" menu item in the mockup has no page. |
| **S7** (A–F) | Traduceri — translations editor | Deferred by the owner (ADR 0174 O-L3-3): needs its own record answering ADR 0095 decision 2. Unscheduled. |
| **A13** | Șterge contul (delete account) | No route, no copy. Account deletion is item 8P9 of `M8B-customer-profiles.md` (Planned). |
| **A16C** | Variant of the "keep current kitchen" pop-up | Deferred by the owner (O9, STATUS 2026-10-20). |
| **`Alegere corp - layouturi`** 1b, 1c, 2a–2c, 3a | Cabinet chooser layouts: filtered list "recomandat", whole catalog, band-only list, progress to a column, "Corpuri noi" (new cabinets) | Not built as drawn — none of its copy is in `ro.json` (inference from copy search). The file is listed only as "cabinet-selection and layout mockups" (`docs/design/README.md`); no milestone schedules it. |

## 3. Obsolete (dropped or replaced)

| Code | Screen | Replaced by |
| --- | --- | --- |
| **S6** (A–H) | Prețuri — single price table | Superseded by the M10 dashboard D1–D10 (ADR 0176, dated note in ADR 0174). |
| **A15** | Păstrezi bucătăria curentă? (keep current kitchen) | Dropped: owner ruling O1, autosave only, no Save / Discard (STATUS 2026-10-20). |
| **A16A** | Same pop-up without an account | Dropped with A15 (O1). Only A16B survives. |

## Not screens

`ContBlocks.dc.html` and `ContBlocks2.dc.html` are component libraries (fields, notices, cards, the preset grid
block) imported by the Lot mockups; `support.js` is the mockups' runtime. They have no screen codes.
