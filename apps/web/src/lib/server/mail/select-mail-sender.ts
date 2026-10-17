import "server-only";

import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
} from "@/lib/server/mail/fake-mail-flag";
import {
  MAIL_VARIABLE_NAMES,
  ownValue,
  readMailConfiguration,
  RETIRED_MAIL_VARIABLE_NAMES,
  type MailEnvironment,
  type MailVariableName,
} from "@/lib/server/mail/mail-configuration";

export { FAKE_MAIL_FLAG, FAKE_MAIL_FLAG_ENABLED };

export type MailSenderSelection =
  | { readonly kind: "fake" }
  | { readonly kind: "provider" }
  | {
      readonly kind: "unavailable";
      readonly variables: readonly (MailVariableName | typeof FAKE_MAIL_FLAG)[];
    };

/**
 * Answers which sender the server's environment asks for, as a value, and carries no configuration:
 * the password never leaves the factory that builds the sender. It takes no request and asks nothing of the
 * build mode, since a production build under CI is the e2e server too. The fake is chosen only by the
 * flag with no mail variable present; the flag beside any of them is a misconfiguration, never a fake.
 */
export function selectMailSender(
  environment: MailEnvironment,
): MailSenderSelection {
  if (ownValue(environment, FAKE_MAIL_FLAG) === FAKE_MAIL_FLAG_ENABLED) {
    return hasAnyMailVariable(environment)
      ? { kind: "unavailable", variables: [FAKE_MAIL_FLAG] }
      : { kind: "fake" };
  }
  const configured = readMailConfiguration(environment);
  return configured.status === "configured"
    ? { kind: "provider" }
    : { kind: "unavailable", variables: configured.variables };
}

/** The live names and the retired ones: a name that once meant mail beside the flag is still a misconfiguration. */
const MAIL_NAMES_THE_FAKE_REFUSES: readonly string[] = [
  ...MAIL_VARIABLE_NAMES,
  ...RETIRED_MAIL_VARIABLE_NAMES,
];

function hasAnyMailVariable(environment: MailEnvironment): boolean {
  return MAIL_NAMES_THE_FAKE_REFUSES.some((name) =>
    Object.hasOwn(environment, name),
  );
}
