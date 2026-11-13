import type { AppLocale } from "@/i18n/routing";

// The addresses of the account pages, in one leaf module. The shell imports the account control for its header, and the
// control writes these paths, so a path that lived in either would be imported back by the other: a cycle. This module
// imports neither.

/** The account pages that have a counterpart in the other language, as the path segment each is served under. */
export type AccountPage =
  | "register"
  | "login"
  | "forgot-password"
  | "verify-email"
  | "reset-password"
  | "kitchens"
  | "profile"
  | "password"
  | "export";

export function accountPathOf(locale: AppLocale, page: AccountPage): string {
  return `/${locale}/account/${page}`;
}

/** The start of the configurator in this language: where "back to the configurator" leads. */
export function startPathOf(locale: AppLocale): string {
  return `/${locale}`;
}
