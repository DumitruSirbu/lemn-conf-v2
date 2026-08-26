# Runbook — Vercel firewall setup

**Not set up. Deliberately deferred to the pre-launch phase** (owner's direction, 2026-08-25: the
project is nowhere near done, and a firewall protecting zero users is premature). The decisions
behind every rule below are `docs/decisions/0019-security-baseline-writes-throttling-retention.md`.

These rules were staged once, verified to stage cleanly, and **discarded**. The project currently
has **zero** custom rules. This runbook exists so re-creating them is a copy-paste rather than a
re-derivation — the expensive part was establishing the plan constraints, not writing the JSON.

Run this when the project is close to carrying real traffic: after M7 (real customers can reach
Step 1) and alongside M8 (the contact form exists and is the endpoint most worth protecting).

## What this firewall is for

**Vercel is the firewall; the application is the rate limiter** (ADR 0019 decision 2). Nothing
here expresses a product rule or a per-endpoint policy — those live in application code, because
they need to know about sessions, design ownership and email addresses, which the edge cannot see.

The firewall does three blunt things the application cannot do cheaply: drop traffic that is never
legitimate, challenge traffic that is unlikely to be legitimate, and absorb volume **for free**.
That last one is the whole reason it exists — an application limiter must run a function and touch
the database in order to say no, so under a flood it becomes the denial of service it was meant to
prevent.

## Plan constraints — established by experiment, not by reading

- **Exactly ONE `rate_limit` rule is permitted on this plan.** Staging a second returns
  `Rate limiting is not available for this plan (401)`, which is misleading: the first stages fine.
  Confirmed by removing the first, after which the second staged immediately.
- `log`, `deny` and `challenge` rules are **not** subject to that limit — three staged together.
- **IP Bypass is unavailable** on this plan (`vercel firewall overview` fails on it).
- `--duration` (persistent actions) is Pro/Enterprise only. None of the rules below use it.
- **WAF counters are per region.** A configured limit of N is enforced at roughly N × the number of
  regions serving traffic. The edge is a flood shield; it is never a hard cap. Exact per-endpoint
  and per-identity limits belong in the application layer.

## The rules

All three ship in `--action log` first. Do **not** skip that: a rule's blast radius is not
predictable until real traffic meets it, and these block customers when wrong.

```bash
# 1 — Known scanner paths. None of these exist in this app, so a hit is never a real customer.
vercel firewall rules add "Probe scanners" \
  --condition '{"type":"path","op":"inc","value":["/wp-admin","/wp-login.php","/.env","/.git/config","/phpmyadmin","/xmlrpc.php","/.aws/credentials"]}' \
  --action log --yes

# 2 — THE one rate-limit rule. Spent on the broadest useful target because the plan allows no
#     second. 120/60s per IP is far above any legitimate use; it exists to stop a flood before it
#     reaches a function, not to express policy.
vercel firewall rules add "Rate limit all API traffic" \
  --condition '{"type":"path","op":"pre","value":"/api/"}' \
  --action rate_limit \
  --rate-limit-window 60 --rate-limit-requests 120 \
  --rate-limit-keys ip --rate-limit-action log --yes

# 3 — Geography. The tool is expected to be used rarely and essentially only from Moldova, which
#     makes an attack separable from normal traffic by volume alone.
vercel firewall rules add "Non-MD API traffic" \
  --condition '{"type":"path","op":"pre","value":"/api/"}' \
  --condition '{"type":"geo_country","op":"eq","neg":true,"value":"MD"}' \
  --action log --yes

vercel firewall diff        # review
vercel firewall publish     # the owner publishes; never an agent
```

## Rolling out — do not skip the stages

1. **Log everywhere.** Publish all three as `log`. They block nothing.
2. **Watch real traffic** at
   `https://vercel.com/<team>/lemnaria-configurator-gbt/firewall/traffic?filter=<ruleId>`
   (rule ids come from `vercel firewall rules list --json`). Confirm only intended traffic matches:
   no real customers, no SEO crawlers, no uptime monitor, no Vercel cron.
3. **Enforce in preview first** — add `{"type":"environment","op":"eq","value":"preview"}` and
   switch the action, so production stays in log mode while you verify the block actually fires.
4. **Enforce in production**, and keep the dashboard open for 24 hours. Roll back with
   `vercel firewall rules edit "<name>" --action log --yes` or `rules disable`.

## Two things not to do

- **Do not `deny` non-MD traffic.** Use `challenge`. The Moldovan diaspora is concentrated in
  Romania and Italy, roaming and VPNs geolocate unpredictably, and the owner will test from
  elsewhere. A country deny fails *silently*: a real customer never arrives and nothing in the logs
  looks like a problem.
- **Do not set a low site-wide `deny` cap**, however tempting the low expected volume makes it. A
  low global deny threshold is itself a denial-of-service vector — one attacker trips it
  deliberately and locks out everyone. The global layer challenges; the precise per-identity
  buckets in the application layer are what protect an individual endpoint.

## Before enabling any of this

`vercel firewall rules edit` with `--condition` **replaces every condition on the rule**. Always
pass the full set, and `vercel firewall rules inspect "<name>" --expand` before and after.
