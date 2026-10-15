import "server-only";

import { VISIBLE_ASCII_KEY } from "@/lib/server/mail/mail-sender";
import { asciiDomainOfPlainMailbox } from "@/lib/server/mail/plain-mailbox";

export type MailEnvironment = Readonly<Record<string, string | undefined>>;

export const GOOGLE_EMAIL_VARIABLE = "GOOGLE_EMAIL";
export const GOOGLE_APP_PASSWORD_VARIABLE = "GOOGLE_APP_PASSWORD";
export const LEAD_NOTIFICATION_ADDRESS_VARIABLE = "LEAD_NOTIFICATION_ADDRESS";

export const MAIL_VARIABLE_NAMES = [
  GOOGLE_EMAIL_VARIABLE,
  GOOGLE_APP_PASSWORD_VARIABLE,
  LEAD_NOTIFICATION_ADDRESS_VARIABLE,
] as const;

/**
 * The previous provider's names. Nothing reads them for configuration, but variables are add-only, so one may outlive
 * its code in an environment, and the fake sender's flag beside it stays a misconfiguration.
 */
export const RETIRED_MAIL_VARIABLE_NAMES = [
  "RESEND_API_KEY",
  "MAIL_FROM_ADDRESS",
] as const;

export type MailVariableName = (typeof MAIL_VARIABLE_NAMES)[number];

export interface MailConfiguration {
  readonly senderAddress: string;
  readonly appPassword: string;
  readonly notificationAddress: string;
}

/** `unavailable` carries names only: a value, even a rejected one, is never copied into an answer. */
export type MailConfigurationResult =
  | { readonly status: "configured"; readonly configuration: MailConfiguration }
  | {
      readonly status: "unavailable";
      readonly variables: readonly MailVariableName[];
    };

// An address is usable exactly when the adapter can write it: the one predicate, shared, so that a value the adapter
// would refuse unsent never reads as configured. The app password is visible ASCII with no space: Google displays it in groups, and it must be pasted without them.
const USABILITY_RULES: Readonly<
  Record<MailVariableName, (value: string) => boolean>
> = {
  [GOOGLE_EMAIL_VARIABLE]: isPlainMailbox,
  [GOOGLE_APP_PASSWORD_VARIABLE]: (value) => VISIBLE_ASCII_KEY.test(value),
  [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: isPlainMailbox,
};

function isPlainMailbox(address: string): boolean {
  return asciiDomainOfPlainMailbox(address) !== undefined;
}

/** Pure: the environment is handed in, and nothing outside it is consulted. */
export function readMailConfiguration(
  environment: MailEnvironment,
): MailConfigurationResult {
  const senderAddress = usableValue(environment, GOOGLE_EMAIL_VARIABLE);
  const appPassword = usableValue(environment, GOOGLE_APP_PASSWORD_VARIABLE);
  const notificationAddress = usableValue(
    environment,
    LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  );
  if (
    senderAddress !== undefined &&
    appPassword !== undefined &&
    notificationAddress !== undefined
  ) {
    return {
      status: "configured",
      configuration: { senderAddress, appPassword, notificationAddress },
    };
  }
  return {
    status: "unavailable",
    variables: MAIL_VARIABLE_NAMES.filter(
      (name) => usableValue(environment, name) === undefined,
    ),
  };
}

function usableValue(
  environment: MailEnvironment,
  name: MailVariableName,
): string | undefined {
  const value = ownValue(environment, name);
  return typeof value === "string" && USABILITY_RULES[name](value)
    ? value
    : undefined;
}

/** Only the environment's own members: a name an object inherits from its prototype is not set. */
export function ownValue(
  environment: MailEnvironment,
  name: string,
): string | undefined {
  return Object.hasOwn(environment, name) ? environment[name] : undefined;
}
