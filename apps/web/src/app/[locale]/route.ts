/**
 * `/{locale}` — Step 1's entry point, and since M7 wave 7E3a S3 the visitor's resume point too
 * (ADR 0114 decision 4, Amendment F). A Route Handler rather than the page this used to be: Next
 * refuses to set a cookie from a Server Component (`04-functions/cookies.md`), and D4's clear needs
 * exactly that. Route handlers do not participate in layouts, which is not a loss here — every
 * response this file answers with is a redirect, never HTML.
 *
 * The locale guard, the 404 and the resume matrix are all `resumeVisitorRoute`'s (C1.1, review
 * round 1) — identical to `configurator/configure/route.ts`'s, so both are exactly this re-export.
 */
export { resumeVisitorRoute as GET } from "@/lib/server/visitor-resume";
