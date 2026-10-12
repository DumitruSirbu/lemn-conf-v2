import "server-only";

import {
  readDigester,
  type ServerEnvironment,
} from "@/lib/server/digest/digest-secret";
import { selectMailSender } from "@/lib/server/mail/select-mail-sender";

/**
 * Whether this server can take a contact request at all: the two things `submitContact` answers as unavailable when
 * it lacks them, a mail sender it can select and a digest secret it can use. Answers a boolean and nothing of how it
 * was decided, so that no variable's name or value, and not which one is missing, can reach a page. The selection is
 * asked of the pure selector and not of the factory, which logs when it builds the fake and builds a sender no page
 * will use; the two agree because a selection of anything but "unavailable" is exactly what the factory builds from.
 */
export function isContactSendable(environment: ServerEnvironment): boolean {
  return (
    selectMailSender(environment).kind !== "unavailable" &&
    readDigester(environment).status === "usable"
  );
}
