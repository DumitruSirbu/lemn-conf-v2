/**
 * What the suite's server is given so that a contact request is passed on by the fake sender, and what keeps it from
 * ever being given a real one (ADR 0154). The names are written here because `select-mail-sender.ts` is `server-only`
 * and cannot be imported where Node, not the bundler, loads the Playwright config; `fake-mail-environment.test.ts`
 * holds them equal to the server's own.
 */
export const FAKE_MAIL_SERVER_ENVIRONMENT = Object.freeze({
  LEMNARIA_E2E_FAKE_MAIL: "1",
});

/** The variables that make a sender real. The flag beside any of them is a misconfiguration the server refuses, so a
 *  server given the flag must be given none of these. */
export const MAIL_VARIABLES_THE_SUITE_REFUSES = Object.freeze([
  "RESEND_API_KEY",
  "MAIL_FROM_ADDRESS",
  "LEAD_NOTIFICATION_ADDRESS",
]);

/**
 * Fails the run before any server starts when its own environment holds a mail variable, since the server inherits the
 * runner's environment and would then read it beside the flag. The message names the variables and never a value.
 */
export function requireNoMailVariable(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const present = MAIL_VARIABLES_THE_SUITE_REFUSES.filter((name) =>
    Object.hasOwn(environment, name),
  );
  if (present.length > 0) {
    throw new MailVariableInTheSuiteError(present);
  }
}

export class MailVariableInTheSuiteError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(
      `The e2e run's environment holds ${variables.join(", ")}: the suite's server is given the fake mail sender, ` +
        "which the server refuses beside any mail variable, and must never be given a real one. " +
        "Unset it for this run; nothing was changed.",
    );
    this.name = "MailVariableInTheSuiteError";
    this.variables = variables;
  }
}
