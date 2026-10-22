import { readFileSync } from "node:fs";

import { createTranslator, type Messages } from "next-intl";

import {
  resolveAccountControlCopy,
  resolveContent,
} from "../../src/i18n/content";

const messages = JSON.parse(
  readFileSync(new URL("../../src/messages/ro.json", import.meta.url), "utf8"),
) as Messages;
const translate = createTranslator({ locale: "ro", messages });

/** Romanian resolution fixture for Playwright's Node ESM process. */
export const ro = resolveContent(translate);

/** The account control's own words, which `resolveContent` does not carry. */
export const roAccountControl = resolveAccountControlCopy(translate);
