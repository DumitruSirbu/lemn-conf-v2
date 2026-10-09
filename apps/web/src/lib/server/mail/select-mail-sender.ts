import "server-only";

import {
  MAIL_VARIABLE_NAMES,
  ownValue,
  readMailConfiguration,
  type MailEnvironment,
  type MailVariableName,
} from "@/lib/server/mail/mail-configuration";

export const FAKE_MAIL_FLAG = "LEMNARIA_E2E_FAKE_MAIL";

/** Only this exact value opts in, so a stray `true`, `01` or ` 1` cannot read as "enabled". */
export const FAKE_MAIL_FLAG_ENABLED = "1";

export type MailSenderSelection =
  | { readonly kind: "fake" }
  | { readonly kind: "provider" }
  | {
      readonly kind: "unavailable";
      readonly variables: readonly (MailVariableName | typeof FAKE_MAIL_FLAG)[];
    };

/**
 * Answers which sender the server's environment asks for, as a value, and carries no configuration:
 * the key never leaves the factory that builds the sender. It takes no request and asks nothing of the
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

function hasAnyMailVariable(environment: MailEnvironment): boolean {
  return MAIL_VARIABLE_NAMES.some(
    (name) => ownValue(environment, name) !== undefined,
  );
}
