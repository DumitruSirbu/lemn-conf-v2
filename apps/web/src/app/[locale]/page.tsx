import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<never> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return redirect({ href: "/configurator/room", locale });
}
