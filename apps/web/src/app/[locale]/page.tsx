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

  // The room step arrives in a later milestone; until then the configurator opens on the scene.
  return redirect({ href: "/configurator/configure", locale });
}
