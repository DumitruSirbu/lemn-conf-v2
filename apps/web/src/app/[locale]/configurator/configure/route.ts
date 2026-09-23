import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { resumeVisitor } from "@/lib/server/visitor-resume";

/**
 * `/{locale}/configurator/configure` — the retired editor route, kept alive only as a second resume
 * entry point (M7 wave 7E3a S3, D5). Identical body to `[locale]/route.ts`; the proxy still allow-
 * lists `configurator/configure` for the unprefixed path (`proxy.ts`'s `isCustomerPath`), which
 * negotiates a locale and lands here exactly as it always has.
 *
 * **Never answers 200, and never again mounts `ConfigureScreen`.** The page this replaced rendered
 * the editor directly; this file imports nothing from `app/configurator`, `store` or `components` —
 * every response is a redirect built by `visitor-resume.ts`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return new NextResponse(null, { status: 404 });
  }
  return resumeVisitor(request, locale);
}
