import "server-only";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import { createGmailMailSender } from "@/lib/server/mail/gmail-mail-sender";
import {
  readMailConfiguration,
  type MailEnvironment,
  type MailVariableName,
} from "@/lib/server/mail/mail-configuration";
import type { MailSender } from "@/lib/server/mail/mail-sender";
import {
  FAKE_MAIL_FLAG,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";

export const FAKE_SENDER_WARNING = `mail: the fake sender is in use (${FAKE_MAIL_FLAG}); no message leaves this server`;

/** A sender, or the names of what keeps one from being built; never a value. */
export type MailSenderCreation =
  | { readonly kind: "sender"; readonly sender: MailSender }
  | {
      readonly kind: "unavailable";
      readonly variables: readonly (MailVariableName | typeof FAKE_MAIL_FLAG)[];
    };

/**
 * The only module that imports the fake or the adapter, and the only one that logs: one warning, made
 * of constants, when it builds the fake. The password is read here and handed to the adapter, so no value
 * that holds it is returned.
 */
export function createMailSender(
  environment: MailEnvironment,
): MailSenderCreation {
  const selection = selectMailSender(environment);
  if (selection.kind === "unavailable") return selection;
  if (selection.kind === "fake") return buildFake();
  return buildProvider(environment);
}

function buildFake(): MailSenderCreation {
  console.warn(FAKE_SENDER_WARNING);
  const fake = createFakeMailSender();
  return { kind: "sender", sender: { send: (message) => fake.send(message) } };
}

function buildProvider(environment: MailEnvironment): MailSenderCreation {
  const configured = readMailConfiguration(environment);
  if (configured.status === "unavailable") {
    return { kind: "unavailable", variables: configured.variables };
  }
  return {
    kind: "sender",
    sender: createGmailMailSender(configured.configuration),
  };
}
