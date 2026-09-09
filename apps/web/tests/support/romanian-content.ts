import { createTranslator } from "next-intl";

import roMessages from "../../src/messages/ro.json";
import { resolveContent } from "../../src/i18n/content";

const translate = createTranslator({ locale: "ro", messages: roMessages });

/** Romanian resolution fixture for tests that are not themselves locale-behaviour tests. */
export const ro = resolveContent(translate);
