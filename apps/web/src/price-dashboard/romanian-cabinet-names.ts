import "server-only";

import { createTranslator } from "next-intl";

import type { PriceBook } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import roMessages from "@/messages/ro.json";

import { cabinetNamesOf } from "./cabinet-names";

// The cabinets' names are the catalogue's Romanian ones, as the screens show them in both languages until the official
// translation.

const romanian = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

export function romanianCabinetNamesOf(
  book: PriceBook,
): Readonly<Record<string, string>> {
  return cabinetNamesOf(book, romanian);
}
