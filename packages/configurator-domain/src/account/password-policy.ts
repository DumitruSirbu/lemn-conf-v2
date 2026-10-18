import { countCharacters } from "../contact/input-checks.js";

// The password rule (ADR 0169 decision 2): length is the whole policy. There are no composition rules, and
// nothing is trimmed, case-folded or truncated, so a password of twelve spaces is a password. The breached-
// password check is I/O and belongs to the server, which adds its own refusal beside these.

/** Characters, as code points after NFKC. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Normalising costs the input's length and no check below runs before it, so what is normalised is bounded
 *  first, in UTF-16 units because that count costs nothing. No normalisation shortens text by anything near
 *  this factor, so a value past it cannot come back under the maximum. */
const UNNORMALISED_LENGTH_FACTOR = 8;

export type PasswordRefusalCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_IS_EMAIL";

export interface PasswordCandidate {
  readonly password: string;
  /** The account's address as typed. A password may not be the address it protects. */
  readonly email: string;
}

/** On acceptance, `password` is the NFKC form: the one value that is hashed and, later, verified, so a
 *  password typed in a different but equivalent form still opens the account. */
export type PasswordJudgement =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly code: PasswordRefusalCode };

export function judgePassword(candidate: PasswordCandidate): PasswordJudgement {
  if (
    candidate.password.length >
    PASSWORD_MAX_LENGTH * UNNORMALISED_LENGTH_FACTOR
  ) {
    return refuse("PASSWORD_TOO_LONG");
  }
  const password = candidate.password.normalize("NFKC");
  const length = countCharacters(password);
  if (length < PASSWORD_MIN_LENGTH) return refuse("PASSWORD_TOO_SHORT");
  if (length > PASSWORD_MAX_LENGTH) return refuse("PASSWORD_TOO_LONG");
  if (isTheAddress(password, candidate.email))
    return refuse("PASSWORD_IS_EMAIL");
  return { ok: true, password };
}

/** A password's length as the rule counts it: code points after NFKC. A form's live counter reads this, so the number
 *  it shows is the number the rule judges. */
export function countPasswordCharacters(password: string): number {
  return countCharacters(password.normalize("NFKC"));
}

function isTheAddress(normalisedPassword: string, email: string): boolean {
  return (
    normalisedPassword.toLowerCase() === email.normalize("NFKC").toLowerCase()
  );
}

function refuse(code: PasswordRefusalCode): PasswordJudgement {
  return { ok: false, code };
}
