import "server-only";

import {
  FAKE_SENDER_WARNING,
  type MailSenderCreation,
} from "@/lib/server/mail/create-mail-sender";
import type { CustomerMailSender } from "@/lib/server/mail/customer-mail";
import { createFakeCustomerMailSender } from "@/lib/server/mail/fake-mail-sender";
import { createGmailCustomerMailSender } from "@/lib/server/mail/gmail-mail-sender";
import {
  readMailConfiguration,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";
import { selectMailSender } from "@/lib/server/mail/select-mail-sender";

/** A customer sender, or the names of what keeps one from being built; never a value. */
export type CustomerMailSenderCreation =
  | { readonly kind: "sender"; readonly sender: CustomerMailSender }
  | Extract<MailSenderCreation, { readonly kind: "unavailable" }>;

/**
 * As `createMailSender`, with its selection: the same variables, the same flag and the same refusal of the flag beside
 * a mail variable. Like it, the only place that logs: one warning, made of constants, when it builds the fake.
 */
export function createCustomerMailSender(
  environment: MailEnvironment,
): CustomerMailSenderCreation {
  const selection = selectMailSender(environment);
  if (selection.kind === "unavailable") return selection;
  if (selection.kind === "fake") return buildFake();
  return buildProvider(environment);
}

function buildFake(): CustomerMailSenderCreation {
  console.warn(FAKE_SENDER_WARNING);
  const fake = createFakeCustomerMailSender();
  return { kind: "sender", sender: { send: (message) => fake.send(message) } };
}

function buildProvider(
  environment: MailEnvironment,
): CustomerMailSenderCreation {
  const configured = readMailConfiguration(environment);
  if (configured.status === "unavailable") {
    return { kind: "unavailable", variables: configured.variables };
  }
  return {
    kind: "sender",
    sender: createGmailCustomerMailSender(configured.configuration),
  };
}
