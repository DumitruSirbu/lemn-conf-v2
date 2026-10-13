# Wave 8Q, slice S0 — measurements (2026-10-13)

Measurement only, at `9f26a58e`, branch `m8-review-contact-success`. **No repository source was changed and none is left
changed**: the one temporary edit (the mode constant in `apps/web/src/lib/security-headers.ts`, `"report-only"` to `"enforce"`)
was made for M2 (second run), M4, M5, M6 (second run), M7, M8, M9 and M10, and restored from a scratchpad copy:
`cmp` of the copy against the file is byte-identical, `shasum` `ab85abdd…2f164f2` before and after, and
`git status --short` and `git diff --stat` were both empty before this file was written. The `.next` directory was then
rebuilt in report-only and its `prerender-manifest.json` is byte-identical to M1's.

**Evidence tiers.** **[ran]** a command I ran in this session, output read. **[src]** read in the tree or the installed
package. **[inf]** inference, with what would falsify it. Every figure below is [ran] unless marked.

**Environment.** Chromium 151.0.7922.34 (Playwright 1.62.1, headless, 390 x 844, touch), Next 16.3.8 (Turbopack), Node 24.19.0,
`next start` on 4320 under `CI=1` with the e2e server's own environment (`DATABASE_URL` = `TEST_DATABASE_URL`, accepted by
`assertSafeTestDatabaseUrl`; `LEMNARIA_E2E_RATE_LIMIT_POLICY`, `LEMNARIA_E2E_FAKE_MAIL`, `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE`,
`NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG`, and a random 64-hex `DIGEST_SECRET` per server start). Never the application
database. The one other database value used was a fake (`fakehost-8q.invalid`, `FAKEPASSWORD_8Q`). No value was printed.
Scripts and raw outputs: the session scratchpad, `scratchpad/s0/` (`tour.mjs`, `m2.mjs`, `m6.mjs`, `m9.mjs`, `odd-paths.mjs`,
`style-nonce.mjs`, `*.json`, `m10-enforce.log`, `shots-enforce-a/`). Builds were warm (about 9 s each, Turbopack cache); the
manifest is a build's all the same.

**Writes spent** (test database): **1 mint** (`POST /api/designs`), **1 share write** (`POST /api/designs/{id}/share`), **0 saves**,
**0 contact API requests** (5A was driven by a `page.route` stub that answered `{status:"sent"}`, 5B by `route.abort`; nothing
reached the server). Seven page loads of the tour pages made **0 non-GET requests** (`nonget.mjs`). The scripts-off POSTs of M9 go
to the callback *page* (3 of them: 2 in the existing spec, 1 in my probe), with consent unticked. M10 is the whole suite: its own
teardown reports 655 designs minted, 80 share writes, 394 saves, 40 contact requests (24 new) and removed its counter rows. **What I
left behind and did not delete** (no row deletion was in the brief): one `designs` row, id `uv9SWNdcDBwLJHVzsZBno`, its share-link
row, and two counter rows (mint, share write) keyed by the digest secret of my first server, which I did not keep. The counters
are inert and pruned by `/api/cron/prune-rate-limits`; the coordinator may remove the design row.

## The figures

### M1 — the manifest after `next build` under `CI=1`

`( . env; pnpm run build )` in `apps/web`, then read `.next/prerender-manifest.json`.

| | Figure |
| --- | --- |
| `routes` | **`/_global-error`** (`routeType: page`, `htmlSize` 8675) and **`/_not-found`** (`initialStatus: 404`, `htmlSize` 6760). Nothing else |
| `dynamicRoutes` | `{}` |
| `notFoundRoutes` | `[]` |
| Build's route table | every app route `ƒ` (dynamic) but `○ /_not-found`; `ƒ Proxy (Middleware)` |
| Across modes | the manifest built with `"report-only"` and with `"enforce"` is byte-identical (`cmp`), and so is the one rebuilt after the restore |

Tier [ran]. Confirms the plan's "two prerendered routes are left" and that neither contact page nor `/done` is in it.

### M2 — what a browser is served, per address class

`m2.mjs`: `fetch` with `redirect: "manual"`, two loads per address, bodies compared byte for byte with every `.next/server/app/*.html`,
every `<script>` read for a `nonce` and compared with the policy's `'nonce-…'`. Report-only build; the rows marked (E) were
repeated on the enforcing build with the same result.

| Address class | Status | What is served | Scripts | Nonces | Body equals a prerendered file |
| --- | --- | --- | --- | --- | --- |
| `/zz` (E) | 404 | **empty body**, no content type | 0 | n/a | no |
| `/ro/zz`, `/ru/zz` (E) | 404 | Next's built-in 404, English: *404 / This page could not be found.* | **8** (6 `src`, 2 inline) | **0 of 8** | **yes: `_not-found.html`**, `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT` |
| `/ro/d/x/zz` (E), `/ro/configurator/zz` (E) | 404 | the same | 8 | 0 of 8 | yes: `_not-found.html` |
| `/xx/configurator/room` (E) | 404 | the same *text*, rendered **per request** | 7 | **7 of 7 = the policy's nonce**; two loads, two nonces | no |
| `/RO/configurator/room` (E) | 404 | the proxy's empty `404`, no content type | 0 | n/a | no |
| `/api/zz` (E) | 404 | the built-in 404 | 8 | 0 of 8 | yes: `_not-found.html` |
| `/internal/scene-shot`, flag **off** (second server, flag unset) (E) | 404 | the built-in 404, per request | 7 | 7 of 7 | no |
| `/internal/scene-shot`, flag on | 200 | the page | 14 | 14 of 14 | no |
| `/internal/zz` (E) | 404 | the built-in 404 | 8 | 0 of 8 | yes: `_not-found.html` |
| A design page whose server render fails (see the note) | **500** | `<html id="__next_error__">`, 40,252 bytes, no visible text | 7 | **7 of 7 = the policy's nonce** | no (not `_global-error`, 8,675 bytes) |
| Same, for `/review`, `/contact`, `/done` of that design | 500 | the same shape | 7 | 7 of 7 | no |
| Unknown design id, no visitor cookie | 200 | the load-error page | 17 | 17 of 17 | no |
| `/`, `/ro` | 307 | redirect to `/ro`, `/ro/configurator/room` | 0 | n/a | no |
| `/ro/configurator/room`, `/ro/configurator/contact`, `/ro/d/{id}…`, `/ro/s/{token}` | 200 | the pages | 14 to 17 | all nonced, all equal to the policy's | no |

**Extra addresses a browser can be sent** (`odd-paths.mjs`, enforcing build):

| Address | Status | Result |
| --- | --- | --- |
| **`/_global-error`** | **500** | **the prerendered `_global-error.html`, byte for byte; 8 scripts, 0 nonced** |
| **`/_not-found`** | 404 | the prerendered `_not-found.html`; 8 scripts, 0 nonced |
| `/ro/%`, `/ro/%E0%A4%A`, `/ro/configurator/room/extra`, a 9000-character path, `/ro/_not-found`, `/ro/_global-error` | 404 | the prerendered `_not-found.html` |
| `POST /ro/zz` | 404 | the same prerendered document |
| `HEAD /ro/zz` | 404 | empty |
| `/%`, `/%E0%A4%A`, `/ro/d/%E0%A4%A` | 500 | `text/plain`, 21 bytes, no document |
| `/ro//configurator//room`, `/ro/configurator/room/` | 308 | redirect to `/ro/configurator/room` |
| `/ro/d/x%00` | 200 | the design page (load error), 17 nonced scripts |
| `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/_next/static/zz.js` | 404 | empty or plain text, no HTML |

**Note on the failing render.** The plan's recipe (a design page against a well-formed, unreachable fake `DATABASE_URL`) **does not
fail a render when the request carries no visitor cookie**: the page never reaches the database and answers `200` with the load-error
page (checked against three fakes: unreachable host, bad percent-escape, non-URL string). Reaching the read needs the owner's
cookies, which I took from the one minted design's storage state and replayed with `fetch` against those servers: then every one of
the three fakes gives the **500** row above. The server log carries a `NeonDbError` line, as 8A D found. Tier [ran].

Every response that carries a policy carries a **different nonce on the second load** (`secondLoadNonceDiffers` true for all).
The prerendered document is served **with** a policy header whose nonce is on none of its scripts.

### M3 — the tour in report-only (`tour.mjs`, 26 stops, 3 observers)

Observers: (i) an init script (`addInitScript`) recording `securitypolicyviolation` on `document`, capture phase, sent out by
`exposeFunction`; (ii) the page's `console` messages matching *content security policy / refused to / violat*; (iii) requests to
any path matching `csp|report`. Stops: Step 1 (`ro`, `ru`), the editor with the scene drawn, the share view, the review, the design's
contact page, the callback page, `/done` on a load, **5A** after a (stubbed) send, **5B** (lost answer by `route.abort`), the
WebGL-unavailable page (init script forcing `getContext('webgl')` to `null`), the load-error page, ten address classes, the three
redirects, and one **controlled injection** (a route-rewritten Step 1 with a parser-inserted inline script, an `<img onerror>`, a
foreign `<script src>` and a wrong-nonce script).

| Observation | Figure |
| --- | --- |
| Does a report-only violation fire `securitypolicyviolation`? | **Yes**, `disposition: "report"`, for `script-src-elem` (inline and chunk), `script-src-attr` and `script-src` (eval). Every event the page saw was also in `window.__cspEvents` |
| Every document that hydrates | **exactly 1 event**: `script-src`, `blockedURI: "eval"`, `sourceFile` a build chunk (`0nosycld46vky.js`, line 1, **column 6245**). 14 stops, and the injection control's own page makes 16 with the editor and the WebGL page. **The editor and the WebGL-unavailable page: 6** (the same plus 5 from column 36256) |
| The load-error page, `/zz`, `/xx/configurator/room`, `/RO/configurator/room` | 0 |
| The prerendered 404 classes (`/ro/zz`, `/ru/zz`, `/ro/d/x/zz`, `/ro/configurator/zz`, `/api/zz`, `/internal/zz`) | **8 each** (6 `script-src-elem` chunk loads, 2 inline) |
| Console (ii) | on **every** document one `error`: *"The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy."* (the diagnostic `webgl-unavailable-i18n.e2e.spec.ts` filters); plus one `info` line per violation |
| Requests to a would-be report path (iii) | 0 (none exists yet) |
| Injection control, report-only | all three markers **ran** (`inline`, `handler`, `wrongNonce` all 1); 5 events: inline script, wrong-nonce script, `<img onerror>` (`script-src-attr`), the foreign `src`, and the page's own eval |
| 5A (`done-heading` shown after the stubbed send), 5B (`submission-failure` shown) | both reached |
| Non-GET requests made by loading the pages | 0 (`nonget.mjs`) |

**What the one eval is.** The chunk at column 6245 is Zod 4's `allowsEval` probe:
`if(o.jitless||…)return!1;try{return Function(""),!0}catch(e){return!1}`. Column 36256 is Zod's `Doc.compile`, `Function(...args, body)`,
the object-schema fast path, which runs only when the probe succeeded. [src, `zod@4.4.3` `v4/core/util.js:145-160` and
`schemas.js:970-972`: *"Skip the probe under `jitless`: strict CSPs report the caught `new Function` as a `securitypolicyviolation`
even though the throw is swallowed"*; and the built chunk]. Zod is imported only by `packages/configurator-domain` (4 files);
`apps/web/package.json` does not list it. Tier [ran] for the events and the chunk text, [src] for the mechanism.

### M4 — the same tour, enforcing (`tour.mjs --shots`; screenshots read: editor, Step 1, share, review, 5A, `/ro/zz`, `/xx/…`)

| Observation | Figure |
| --- | --- |
| Every page of criterion 2 | **loads, hydrates, draws**: the editor, the share view and the review show the scene (`canvas` 1); 5A shows the confirmation; 5B the failure page; the WebGL exit page its text |
| Violations on a hydrating page | **exactly 1, `disposition: "enforce"`**: Zod's probe, **blocked and caught** (`Function("")` throws, `allowsEval` is false, the page works). 15 stops (16 with the injection page). Zod's 5 JIT calls disappear (editor: 6 to 1) |
| Console (ii) for that violation | **none**: the blocked eval writes no console message. Only observers (i) and (iii) can see it. The `upgrade-insecure-requests` `error` is gone (it is ignored only in report-only) |
| The prerendered 404 classes | **8 enforce events each; 6 chunk requests blocked; not hydrated**; the page still **shows its text** (*404 / This page could not be found.*, 33 characters) and looks the same as the per-request `/xx/configurator/room`. Not blank |
| Injection control | **all three markers stay 0** (inline, handler, wrong nonce); 5 events (4 above plus the eval); the page still hydrates |
| `/zz`, `/RO/…`, `/xx/…`, the load-error page | 0 events |

### M5 — does Chromium upgrade `http://localhost:<port>` under enforcement? (`tour.mjs`, LAN run `--only=…`)

| Origin | Figure |
| --- | --- |
| `http://localhost:4320` | **No.** Across the 26 tour loads: **0** requests to an `https://localhost…` address, **0** failed `/_next/static` requests (but the 6 blocked 404 chunks, which are CSP blocks not upgrades), every page hydrates |
| `http://192.168.1.3:4320` (this machine's LAN address; `next start` listens on all interfaces) | **Yes, and the page breaks.** Step 1, the callback page and the load-error page each issue **13 to 16 subresource requests upgraded to `https://192.168.1.3:4320/_next/static/…`**, every one fails `net::ERR_SSL_PROTOCOL_ERROR` (the CSS chunks too), **not hydrated**, no violation event (an upgrade is not one) |

Recorded once for 8T, as the plan asked. Not measured: the same LAN address under report-only (the directive is ignored there
[doc: the console diagnostic above], so I expect it to load). ADR 0019's LAN handset runs `next dev`, whose policy has no such
directive [src, `buildContentSecurityPolicy`]; its LAN behaviour under enforcement was not measured (M7 used `localhost`).

### M6 — what Chromium sends with `report-uri` alone (`m6.mjs`)

Method: a scratch reverse proxy on 4399 in front of the app **appends `; report-uri /__s0/csp-report` to the CSP header the app
sent** and collects the POSTs; nothing in the repository changed. Run on both builds, 5 page visits each (the natural `/ro/zz`,
Step 1, the share view, the injection, the share view with `?x=1#frag`).

| Observation | Figure |
| --- | --- |
| Request | **`POST`**, `Content-Type: application/csp-report`, body `{"csp-report":{…}}`, **738 to 803 bytes** |
| Keys of `csp-report` | `document-uri`, `referrer`, `violated-directive`, `effective-directive`, `original-policy`, `disposition`, `blocked-uri`, `status-code`, `script-sample`; plus `line-number` and `source-file` (8 of 13 reports: inline, eval, and one chunk load) and `column-number` (eval only) |
| `disposition` | `"report"` on the report-only build, `"enforce"` on the enforcing one |
| **Delay** | **None to speak of**: each report arrived within **-12 to +3 ms** of the page's own event (the spread is the binding's latency). No batching. `report-uri` alone is enough; no `Reporting-Endpoints` or `report-to` is needed for the e2e evidence |
| Count | 14 events, **13 reports** (two identical inline violations on `/ro/zz` were sent once), on both builds |
| `document-uri` on `/ro/s/{token}` | **the full address, token included**, e.g. `http://localhost:4399/ro/s/<token>`; the query is **kept** (`…/s/<token>?x=1`), the **fragment is stripped** |
| `original-policy` | the whole policy, **including the nonce and the `report-uri` itself** |
| `script-sample` | empty (no `'report-sample'` in the policy) |
| `referrer` key | `""` on all 13 reports of both builds; the **`Referer` header** is the page's own address, **absent from a share view** (its `no-referrer` policy) |
| **`Origin` header** | **present, equal to the page's origin**, on every report. The plan's "no reliable `Origin`" [inf] is refuted for Chromium 151; the header still proves nothing about a non-browser sender |
| **Cookies** | **sent with the report** (`hasCookie` true once the context held them: the visitor cookie and `NEXT_LOCALE`) |
| Other headers | `sec-fetch-site/mode/dest`, `sec-ch-ua*`, `user-agent`, `accept`, `cache-control`, `pragma` |

### M7 — `next dev` under enforcement (`tour.mjs --only=…`, `next dev --port 4320`, constant `"enforce"`)

Seven stops: Step 1, the editor, the share view, the design's contact page, the load-error page, `/ro/zz`, the injection.

| Observation | Figure |
| --- | --- |
| The six stops other than the injection | **0 violations**, 0 console lines naming the policy, all hydrate, the scene is drawn. The dev policy admits `'unsafe-eval'` and `ws: wss:` [src], so Zod's probe passes |
| `/ro/zz` under dev | **rendered per request**: hydrated, 0 events (ADR 0158 *Limits*) |
| Injection | markers 0; 4 events (no eval event in dev); the page was recorded `hydrated: false` (not investigated) |

Not measured: a whole `next dev` e2e run; the hot-reload socket was not observed to open, only that no event named it.

### M8 — do `addInitScript` and `evaluate` still run under enforcement?

**Yes.** On the enforcing build, **for all 26 stops** `window.__initRan === true`; `page.evaluate` returned its facts every time; the
`exposeFunction` binding delivered every event the page counted (`eventsInPage` equals the events received on every stop); a
`page.route` that rewrote a document and `fulfill`ed it with the response's own headers worked (the injection control). The
suite's WebGL-forcing init scripts ran in the 860 passing M10 tests. **What does not run is a `fetch` of a `data:` URL made
from the page** (M10). Tier [ran].

### M9 — the callback form's scripts-off `POST` under enforcement

| | Figure |
| --- | --- |
| `CI=1 playwright test tests/e2e/qa-8l-contact-no-js.adversarial.e2e.spec.ts --project=mobile`, constant `"enforce"` | **4 passed (10.3 s)**. The command exits 1 only because the run's global teardown throws `NoCountersOfTheRunError` (a single spec mints nothing); a property of running one spec, not of the policy |
| My probe (`m9.mjs`): script chunks aborted by route, form typed, Enter in the phone field | **1 `POST /ro/configurator/contact`, answered 200**, the address after it is `/ro/configurator/contact` with **no query**, **0 `securitypolicyviolation` events, 0 `form-action` console messages** |

`form-action 'self'` admits the page's own POST under enforcement. Tier [ran].

### M10 — the whole `CI=1` e2e, enforcing, once

`CI=1 pnpm exec playwright test` in `apps/web`, constant `"enforce"`, the config's own `webServer` (`pnpm run build && next start --port 4320`),
nothing else running. **924 tests, 860 passed, 64 failed, 0 skipped, 10.8 min, exit 1.** The teardown line:

> `e2e rate limit: this run minted 655 designs (1 counter row removed), made 80 share writes (1 counter rows removed), made 394 saves
> (1 counter rows removed), and sent 40 contact requests of any kind (1 counter rows removed), 24 new ones counted in the hour (1
> counter rows removed) and 24 new ones counted in the UTC day (1 counter rows removed)`

(The live list carries 67 `✘` marks; three are `test.fail` tests that count as passed: `seeded-design.qa` :35 and `qa-8d-review-arrival` :500 and :524. Playwright's own count is 64 failed.)

**The 64, by cause** (error text read for every one; `grep -c "Content Security Policy\|Refused to"` on the run's log: 0):

| Cause | Count | Where |
| --- | --- | --- |
| **A. A pin on the report-only header name** (as the plan lists) | **32** | `configure-route.e2e.spec.ts` 20; `locale-routing.qa.e2e.spec.ts` 4; `contact-pages-per-request.e2e.spec.ts` 3 (*"the response carries no nonce in its content-security-policy-report-only"*); `qa-8m-done-door.adversarial.e2e.spec.ts` 3 (same text); `page-read-limit-proof.e2e.spec.ts` 1; `shared-design-locale-identity.e2e.spec.ts` 1 |
| **B. `page.evaluate: TypeError: Failed to fetch`, every one with `support/pixels.ts` in its trace** | **32** | `room-desktop-line.criteria-04-10.desktop` 8; `pixel-counter-witness.desktop` 6; `pixel-counter-witness.adversarial.desktop` 5; `qa-8d-review-scene.adversarial` 4 (:108, :189, :225 and one more); `qa-u5-cutaway` 2 (mobile and desktop); `room-desktop-line.criteria-12-17.desktop` 2; `editor-rail.desktop` 2; `overflow-mark` 1; `qa-7i-mirror-captures` 1 mobile + 1 desktop |

**B is not in the plan.** `support/pixels.ts:142` and `:175` decode a screenshot inside the app's own page with
`fetch("data:image/png;base64,…")`. The policy's `connect-src 'self'` does not admit `data:`, so the browser refuses the fetch.
No product script does this; it is a test technique that the flip breaks [ran: the trace; src: `pixels.ts:142, 175`;
`security-headers.ts` `connect-src`]. The policy admits `data:` for images (`img-src 'self' blob: data:`), so decoding through an
`Image` is a fix that needs no policy change [inf: not tried]. `qa-8d-review-scene.adversarial` :189, the plan's backlog-195
flake, is among the B reds here, so this run cannot say whether the flake also recurred.

The plan's S5 stop-if (*any test fails but the two pins and the QA pins of point 10*) **fires on B** unless S2 repairs the helper
first. The plan's "known pins" list found all of A (`webgl-unavailable-i18n`'s console filter did not fail: it is a no-op under
enforcement).

## The [inf] assumptions, confirmed or refuted

| Assumption (plan) | Measure | Verdict |
| --- | --- | --- |
| Playwright `addInitScript` / `evaluate` still run under enforcement (8Q.6, risk list) | M8, M4 | **Confirmed.** Also `exposeFunction` and `route.fulfill` of a rewritten document |
| A report-only violation fires `securitypolicyviolation` on `document` (8Q.6 (i)) | M3 | **Confirmed**, `disposition: "report"` |
| The collector sees violations in a worker, where no document event fires (8Q.6 (iii)) | none | **Not measured**: no worker was created by any tour page (`workers` was 0 everywhere) |
| `upgrade-insecure-requests` may blank the suite's `http://localhost:4320` (8Q.7, risk 3) | M5 | **Refuted for `localhost`** (0 upgrades). **Confirmed for a LAN address**: the page breaks |
| Development under enforcement may break on tooling scripts (8Q.8, risk 4) | M7 | **Refuted** for the seven stops: 0 violations |
| `report-uri` delivers promptly, so e2e evidence needs no `report-to` timing (8Q.3) | M6 | **Confirmed**: within about 12 ms, one POST per distinct violation, no batching |
| A browser's report carries no reliable `Origin` (8Q.3, *Not taken*) | M6 | **Refuted** for Chromium 151: the header is present and same-origin. The conclusion (no `Origin` check) still stands: a non-browser forges it |
| A nonce in `style-src` makes a browser ignore `'unsafe-inline'`, so React's `style` attributes would be blocked (8Q.4, *Never*) | `style-nonce.mjs`, a scratch page, no app | **Confirmed.** With `style-src 'self' 'unsafe-inline' 'nonce-abc'`: the `style="color:green"` attribute did **not** apply (computed black), an un-nonced `<style>` did not apply, a nonced one did; violations `style-src-attr` and `style-src-elem`. With today's `style-src` all three applied |
| Prerendered pages carry no nonce, so they would break under enforcement (ADR 0041 d3) | M2, M4 | **Confirmed, with a refinement**: the document is served byte-identical with 0 of 8 scripts nonced, but its **text still shows**; only hydration and the reports are lost |
| Next's built-in 404 / 500 cannot be rendered per request without a page of our own (risk 1) | M2 | **Partly refuted**: a 404 thrown inside a dynamic render **is** rendered per request with Next's own text and nonced scripts (`/xx/configurator/room`, `/internal/scene-shot` flag off), and a failed render is already per request (the 500 row) |
| The suite expects no violation in report-only (8Q.6, S4's baseline) | M3 | **Refuted**: **every hydrating page reports one** (Zod's eval probe), the editor six |
| Every test but the pins stays green when the mode flips (S5 stop-if) | M10 | **Refuted**: 32 further failures, cause B |

## Proposed restatement of S1, 8Q.7 and 8Q.8 (the architect decides at checkpoint A)

**S1's class table, by 8Q.4's ladder.**

| Class | Rung | Why |
| --- | --- | --- |
| `/xx/…`, `/internal/scene-shot` (flag off), the failed design render, `/zz`, `/RO/…`, `/%`-malformed, static assets, redirects | **1: already per request or no document** | M2. S2 pins them |
| An address that matches no route: under a valid locale (`/ro/zz`, `/ro/d/x/zz`, `/ro/configurator/zz`, `/ro/%`), under `/api` and `/internal`, any method | **2: a prerendered document is served** | M2, byte-identical to `_not-found.html` |
| **`/_global-error` and `/_not-found` typed as addresses** | **2 or 4** | M2: both prerendered files are served as documents, `/_global-error` with a 500 |

**Candidates for rung 2** [inf: none tried, each is a production change]: (a) catch-all files that call `notFound()` in a dynamic
render, so Next renders its own text per request as it already does for `/xx/…`: `app/[locale]/[...unmatched]/page.tsx`, and for
the two other families a route handler or page under `app/api/[...unmatched]` and `app/internal/[...unmatched]` (a handler that
answers an empty 404 is rung 1, no document at all); (b) `experimental.globalNotFound` with `app/global-not-found.tsx`, which
the installed docs say *"skips rendering"* and wants its own `<html>`, so it may well stay prerendered (**unmeasured**) and
restates a sentence; (c) for the two literal addresses, a `redirects()` entry in `next.config.ts` for `/_global-error` and
`/_not-found` (redirects run before the filesystem [inf]); otherwise rung 4. **Proposed S1 files, four at most:** the
`[locale]` catch-all, the `api` and `internal` catch-alls, `next.config.ts` (the redirects, or the flag if (b) is tried), plus the
comment in `lib/security-headers.ts`. **Its first step is an experiment**: whether (a) turns `/ro/zz` into a per-request nonced
404. If the literal addresses cannot be handled, a ruling is needed: **criterion 1's wording** (*"every entry of the manifest is
absent or one S0 showed no browser receives"*) cannot then be met literally for `/_global-error` and `/_not-found`, and the choice is
rung 4 or accepting that a typed address gets a text-only page with blocked scripts, up to 8 reports a hit, counted by the limiter.

**A fourth thing S1 cannot hold and no rung covers: Zod's eval probe (M3, M4).** It is **1 `script-src` violation per page view
site-wide** under enforcement, **1 per document in report-only**. Left alone it (i) fails criterion 2 on every tour page, (ii) fails
S4's baseline (S4's stop-if fires), (iii) writes a counter row per page view until the shared bucket's 100 an hour is spent (Q47),
after which the sink answers `429` to everything including a real violation. The probe is skipped when Zod is configured
`jitless` [src, `util.js:148`], which also removes the 5 compile calls. **Both places that can set it are on the plan's *Must not*
list**: `packages/configurator-domain` (the only importer of `zod`) or a new dependency in `apps/web`, which does not list `zod`. The
setting has to run before the first object schema is constructed, because `fastEnabled` is read at construction
(`schemas.js:970-972`) [inf: where in the bundle's evaluation order is not measured]. This needs a ruling, then a slice, ahead of S2.

**S2 gains a tests-only item the plan does not have**: `support/pixels.ts`'s two `fetch("data:…")` calls (cause B), a
developer-owned file used by developer and QA specs alike. With the pin repointing and the self-test S2 already holds six items
(the limit is five): split it.

**8Q.7: keep `upgrade-insecure-requests`.** `localhost` is not upgraded, so the suite and `next start` on this machine are unaffected.
**Add to 8T's gate:** a `next start` reached by a LAN address under enforcement serves a page with no script or style, so the
production policy cannot be looked at on a handset over the LAN; use a TLS host, or the dev server, whose policy has no such
directive and so is not the production policy. No dated note on ADR 0041 d6 is owed for removal.

**8Q.8: one switch for both stands; no dev allowance is needed.** Seven dev stops under enforcement: 0 violations. The teardown
under `next dev` should still **print and not assert**: no whole dev run was measured, and the plan's rule makes assertion depend on
that.

## Surprising, in order of consequence

1. **Zod's eval probe** (above): every hydrating page view. Over the tour's 16 stops that load one (the 15 plus the injection control): 26 events in report-only, 16 enforcing.
2. **32 tests fail for a reason of their own** (`fetch(data:)` in `pixels.ts`), on top of the 32 expected pins.
3. **`/_global-error` and `/_not-found` are reachable by address**, so the manifest's two routes are documents a browser can be sent.
4. **A report carries the share token** (`document-uri`), the visitor's **cookies**, and an **`Origin`**. 8Q.3's reduction is warranted,
   and the sink's route sees the visitor cookie on a request it should ignore.
5. **The blocked eval writes no console message**, so a console-only observer is blind to the most common violation; the event
   and the request observers see it. In report-only, every document also writes one `error` console line that is not a violation.
6. **The failing-render class is already clean** (500, nonced), but the plan's recipe needs the owner cookie to reach it.
7. **A LAN `next start` breaks under the flip** (M5).
8. **Chromium deduplicates identical reports** (8 events, 7 reports on `/ro/zz`): a report count is a lower bound on events.
9. `qa-8d-review-scene.adversarial` :189, the known flake, failed in this run for cause B, so it is not evidence about the flake.

## Stop-if rows

S0's: **did not fire.** No measurement needed a production file beyond the one constant, and none touched the application database.
The later slices' rows that these figures say **will** fire if nothing changes: **S4** (the baseline would count a report on every
page), **S5** (cause B), **S2** (*"the collector does not see the injected script in report-only"* did not fire: it does see it).
