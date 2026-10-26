// The Romanian catalogue's words, asked by key, for a test that states what a person reads: the sentence is the
// catalogue's, so a test never holds a second copy of it (the lint gate keeps Romanian out of a test's own literals).
import { createTranslator } from "next-intl";

import roMessages from "../../src/messages/ro.json";

export const roCopy = createTranslator({ locale: "ro", messages: roMessages });
