/**
 * `/{locale}/configurator/configure` — the retired editor route, kept alive only as a second resume
 * entry point (M7 wave 7E3a S3, D5). Identical body to `[locale]/route.ts` (C1.1, review round 1
 * factored the shared locale guard, 404 and resume matrix into `resumeVisitorRoute`); the proxy
 * still allow-lists `configurator/configure` for the unprefixed path (`proxy.ts`'s
 * `isCustomerPath`), which negotiates a locale and lands here exactly as it always has.
 *
 * **Never answers 200, and never again mounts `ConfigureScreen`.** The page this replaced rendered
 * the editor directly; this file imports nothing from `app/configurator`, `store` or `components` —
 * every response is a redirect built by `visitor-resume.ts`.
 */
export { resumeVisitorRoute as GET } from "@/lib/server/visitor-resume";
