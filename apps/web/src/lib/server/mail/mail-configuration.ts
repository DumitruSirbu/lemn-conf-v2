import "server-only";

export type MailEnvironment = Readonly<Record<string, string | undefined>>;

export const MAIL_API_KEY_VARIABLE = "RESEND_API_KEY";
export const MAIL_FROM_ADDRESS_VARIABLE = "MAIL_FROM_ADDRESS";
export const LEAD_NOTIFICATION_ADDRESS_VARIABLE = "LEAD_NOTIFICATION_ADDRESS";

export const MAIL_VARIABLE_NAMES = [
  MAIL_API_KEY_VARIABLE,
  MAIL_FROM_ADDRESS_VARIABLE,
  LEAD_NOTIFICATION_ADDRESS_VARIABLE,
] as const;

export type MailVariableName = (typeof MAIL_VARIABLE_NAMES)[number];

export interface MailConfiguration {
  readonly apiKey: string;
  readonly fromAddress: string;
  readonly notificationAddress: string;
}

/** `unavailable` carries names only: a value, even a rejected one, is never copied into an answer. */
export type MailConfigurationResult =
  | { readonly status: "configured"; readonly configuration: MailConfiguration }
  | {
      readonly status: "unavailable";
      readonly variables: readonly MailVariableName[];
    };

// Visible ASCII only, so a key carries no space or control character into a header.
const USABLE_KEY = /^[\x21-\x7e]+$/;

// Exactly one `@` between two parts; no whitespace, separator, angle bracket, control or format
// character. A second recipient or a header break therefore cannot ride in an address.
const USABLE_ADDRESS = /^[^\s@,;<>\p{C}]+@[^\s@,;<>\p{C}]+$/u;

const USABILITY_RULES: Readonly<Record<MailVariableName, RegExp>> = {
  [MAIL_API_KEY_VARIABLE]: USABLE_KEY,
  [MAIL_FROM_ADDRESS_VARIABLE]: USABLE_ADDRESS,
  [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: USABLE_ADDRESS,
};

/** Pure: the environment is handed in, and nothing outside it is consulted. */
export function readMailConfiguration(
  environment: MailEnvironment,
): MailConfigurationResult {
  const apiKey = usableValue(environment, MAIL_API_KEY_VARIABLE);
  const fromAddress = usableValue(environment, MAIL_FROM_ADDRESS_VARIABLE);
  const notificationAddress = usableValue(
    environment,
    LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  );
  if (
    apiKey !== undefined &&
    fromAddress !== undefined &&
    notificationAddress !== undefined
  ) {
    return {
      status: "configured",
      configuration: { apiKey, fromAddress, notificationAddress },
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
  return typeof value === "string" && USABILITY_RULES[name].test(value)
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
