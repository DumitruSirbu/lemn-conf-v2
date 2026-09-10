import { hasLocale } from "next-intl";
import { getRequestConfig, type RequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import { locale as getRootLocale } from "next/root-params";

import type roMessages from "../messages/ro.json";

import {
  isPseudoLocaleEnabled,
  pseudoLocalizeCatalogue,
} from "./pseudo-locale";
import { routing, type AppLocale } from "./routing";

type AppMessages = typeof roMessages;

const messageLoaders = {
  ro: () =>
    import("../messages/ro.json").then(({ default: messages }) => messages),
  // AppConfig intentionally derives ICU argument types from the Romanian source literals. Other
  // locales have different literal values, while the structural parity gate protects their shape.
  ru: () =>
    import("../messages/ru.json").then(
      ({ default: messages }) => messages as AppMessages,
    ),
} satisfies Record<AppLocale, () => Promise<AppMessages>>;

export async function createI18nRequestConfig(
  explicitLocale: string | undefined,
): Promise<RequestConfig> {
  // An explicit locale belongs to calls such as `getTranslations({locale})`; otherwise the locale
  // is the validated root segment. Neither path silently substitutes Romanian for a bad boundary.
  const locale = explicitLocale ?? (await getRootLocale());
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await messageLoaders[locale]();
  return {
    locale,
    // The length-stress catalogue is a transform over a real locale rather than a locale of its own,
    // so it changes what `/ro` and `/ru` say and nothing about where they are (`pseudo-locale.ts`).
    // `isPseudoLocaleEnabled` is `false` in production with no opt-in, so this branch cannot be
    // reached by a customer.
    messages: isPseudoLocaleEnabled(process.env)
      ? pseudoLocalizeCatalogue(messages)
      : messages,
  };
}

export default getRequestConfig(({ locale }) =>
  createI18nRequestConfig(locale),
);
