import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { resumeVisitor } from "@/lib/server/visitor-resume";

/**
 * `/{locale}` — Step 1's entry point, and since M7 wave 7E3a S3 the visitor's resume point too
 * (ADR 0114 decision 4, Amendment F). A Route Handler rather than the page this used to be: Next
 * refuses to set a cookie from a Server Component (`04-functions/cookies.md`), and D4's clear needs
 * exactly that. Route handlers do not participate in layouts, which is not a loss here — every
 * response this file answers with is a redirect, never HTML.
 *
 * The unsupported-locale 404 runs before `resumeVisitor` touches the cookie, matching the page this
 * replaced and criterion 6's "before any cookie is read".
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
