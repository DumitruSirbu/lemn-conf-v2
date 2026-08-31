# Security and API boundary

## FINDING: Unauthenticated minting has no active application quota

- **ID:** SEC-001
- **SEVERITY:** High
- **THE EXPLOIT/FLAW:** `POST /api/designs` takes no request data, performs no authentication,
  throttling, challenge, or quota check, and always inserts a seeded design
  (`apps/web/src/app/api/designs/route.ts:13-21`). An attacker does not need to discover a design ID
  or defeat the write-token system: each request legitimately creates a new row and a new credential.
  ADR 0019 records the endpoint as unauthenticated/unthrottled and defers the application limiter and
  retention cron to M8, with WAF rules deferred until pre-launch
  (`docs/decisions/0019-security-baseline-writes-throttling-retention.md:14-19,221-239`). Until those
  stages actually ship, a request loop can exhaust database storage, compute, invocation limits, and
  increase the already unbounded backup workload. Edge/WAF state was not inspected in this review;
  the finding is that the application has no control and the maintained decision says rollout is
  deferred.
- **REMEDIATION:** Implement ADR 0019's already-decided buckets before exposing the endpoint to real
  traffic: IP `/24` and IPv6 `/64`, signed session, and global per-endpoint counters. Enforce the
  recorded mint limits (10/hour and 30/day for MD networks, 3/hour plus challenge for non-MD, 5/hour
  per session), return `429` with `Retry-After`, and fail closed when the counter store is unavailable.
  Ship the 30-day abandoned-design retention cron and the staged WAF rule in the same release gate;
  a plan or runbook is not a runtime control.

## FINDING: Request bytes and collection cardinality are unbounded

- **ID:** SEC-002
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** An authorized `PUT`/`PATCH` calls `request.json()` before any byte limit
  (`apps/web/src/app/api/designs/[id]/route.ts:102-157`). `DesignSchema` uses an unbounded
  `z.array(DesignPlacementSchema)` (`packages/configurator-domain/src/design.ts:57-63`). ADR 0019
  explicitly accepts the missing body limit while the firewall is deferred
  (`docs/decisions/0019-security-baseline-writes-throttling-retention.md:262-268`). A caller can mint
  its own credential, upload a near-platform-limit placement array, store it as JSONB, and make every
  later reader derive and render it. A local benchmark of the load-time `derivePlacementRecords` plus
  `deriveColumns` path took 144 ms at 8,000 placements and 430.7 ms at 16,000 placements before void
  derivation or Three.js object construction. The cost grows again in the scene because one body can
  create many meshes.
- **REMEDIATION:** Enforce both independent limits. Reject streamed input after `MAX_DESIGN_BYTES`
  bytes instead of trusting `Content-Length`, and cap `placements` in the schema to the maximum a
  supported room can physically contain. Return `413` for byte/cardinality overflow. A safe shape is:

  ```ts
  const placements = z.array(DesignPlacementSchema).max(MAX_PLACEMENTS);

  const raw = await readUtf8BodyWithLimit(request.body, MAX_DESIGN_BYTES);
  if (!raw.ok)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const body: unknown = JSON.parse(raw.value);
  ```

  The stream reader must count received bytes so chunked requests cannot bypass the limit. Keep the
  semantic validation in DOM-001 after this size gate.

## FINDING: Public internal route accepts unbounded WebGL dimensions

- **ID:** SEC-003
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** `/internal/scene-shot` is a normal production route. `noindex` and lack of
  links do not authorize or hide it (`apps/web/src/app/internal/scene-shot/page.tsx:6-21`). Its size
  parser accepts every finite positive number and only rounds it
  (`apps/web/src/app/internal/scene-shot/shot-request.ts:45-59`). Those dimensions are assigned to the
  container, which mounts a WebGL canvas with `frameloop="always"`
  (`apps/web/src/app/internal/scene-shot/scene-shot.tsx:55-71`). A crafted link with extreme `w` and
  `h` can force a victim tab to request an enormous drawing buffer or hit browser/GPU allocation
  limits continuously. This is client-side denial of service, not a server takeover.
- **REMEDIATION:** Remove the route from production builds or require an environment-gated server
  authorization check. Independently clamp dimensions to the verified capture envelope before they
  reach CSS or R3F, for example:

  ```ts
  const MAX_SCENE_SHOT_WIDTH = 1920;
  const MAX_SCENE_SHOT_HEIGHT = 1080;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1
    ? Math.min(Math.round(value), maximum)
    : fallback;
  ```

  Add adversarial tests for `Infinity`, exponent notation, `Number.MAX_SAFE_INTEGER`, and values just
  above each maximum.

## FINDING: Browser security policy is not encoded in the repository

- **ID:** SEC-004
- **SEVERITY:** Low
- **THE EXPLOIT/FLAW:** `apps/web/next.config.ts:3-6` contains only strict mode and package
  transpilation. No repository configuration or middleware declares CSP, anti-framing,
  `X-Content-Type-Options`, `Referrer-Policy`, or a restricted `Permissions-Policy`. Platform defaults
  may add some headers, but they are not a versioned application guarantee and runtime response
  headers were not verified here. This leaves clickjacking and future script-injection blast radius
  dependent on external configuration nobody reviewing the code can see.
- **REMEDIATION:** Add explicit response-header tests and version the policy. Use a nonce-based CSP
  compatible with Next rather than weakening `script-src` globally; at minimum enforce
  `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'`, plus
  `X-Content-Type-Options: nosniff`, a strict referrer policy, and a permissions policy disabling
  unused sensors/camera/microphone. Roll CSP out as `Report-Only`, fix violations, then enforce it.
