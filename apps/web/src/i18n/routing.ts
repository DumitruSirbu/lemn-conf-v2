import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ro", "ru"],
  defaultLocale: "ro",
  localePrefix: "always",
  localeCookie: {
    name: "NEXT_LOCALE",
    sameSite: "lax",
  },
});

export type AppLocale = (typeof routing.locales)[number];
