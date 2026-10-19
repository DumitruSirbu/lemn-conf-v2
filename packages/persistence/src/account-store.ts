import type {
  RegisteredPhone,
  RegistrationFields,
  Role,
} from "@lemnaria/configurator-domain";

import { requirePasswordHashShape } from "./password-hash-shape.js";
import { requireSha256Digest } from "./sha256-digest.js";

/** The links the mail carries. The closed list lives here and not in the table, so a later purpose drops no
 *  constraint (`0014`). */
export const EMAIL_TOKEN_PURPOSES = ["verify-email", "reset-password"] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

export type AccountStoreOperation =
  | "look up an account"
  | "create an account"
  | "replace an unverified registration"
  | "issue an e-mail token"
  | "confirm an e-mail address"
  | "complete a password reset"
  | "replace a password hash";

/** The database refused, did not answer, or answered with something that is not the row this port reads. Its `cause`
 *  is a `ReducedCause` (ADR 0146 B3), never the driver's own error, and its message holds no address or hash. */
export class AccountStoreError extends Error {
  readonly operation: AccountStoreOperation;

  constructor(operation: AccountStoreOperation, options?: ErrorOptions) {
    super(
      `The account store could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "AccountStoreError";
    this.operation = operation;
  }
}

/** What a registration stores: the domain's validated fields and the PHC string made from the NFKC password. */
export interface NewAccount extends RegistrationFields {
  readonly passwordHash: string;
}

/** What registering an address that is still unverified overwrites. The address itself is the key and never changes. */
export type RegistrationReplacement = Omit<NewAccount, "email">;

/** An account as login and confirmation read it. `passwordHash` is for verifying and is never logged or returned to a
 *  client. `role` is the account's current role. */
export interface StoredAccount {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly isEmailVerified: boolean;
  readonly role: Role;
  readonly locale: string;
}

/** Tagged, never `null`, so a caller cannot forget the unknown address. */
export type AccountLookup =
  | { readonly kind: "found"; readonly account: StoredAccount }
  | { readonly kind: "none" };

/** `address-taken` covers a verified and an unverified account alike: the caller decides what to do about each. */
export type AccountCreation =
  | { readonly kind: "created"; readonly accountId: string }
  | { readonly kind: "address-taken" };

/** `not-replaceable` is a verified account, or none at all: the predicate holds `email_verified_at is null`, so a
 *  verified account is never touched. */
export type RegistrationReplacementOutcome =
  | { readonly kind: "replaced"; readonly accountId: string }
  | { readonly kind: "not-replaceable" };

/** `tokenHash` is the SHA-256 of the value in the link; the value itself never reaches the store. */
export interface TokenToIssue {
  readonly accountId: string;
  readonly purpose: EmailTokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** `refused` is an account that does not exist, or a token hash already held by another account or purpose. */
export type TokenIssueOutcome =
  | { readonly kind: "issued" }
  | { readonly kind: "refused" };

/** A token as the link carried it, asked of a purpose. */
export interface LiveTokenLookup {
  readonly tokenHash: string;
  readonly purpose: EmailTokenPurpose;
}

/**
 * `verifiedPasswordHash` is the hash the caller verified the password against, bound into the one statement so a
 * re-registration that replaced the hash after that check cannot be confirmed under the new one.
 */
export interface EmailConfirmation {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly verifiedPasswordHash: string;
}

export type EmailConfirmationOutcome =
  | { readonly kind: "confirmed" }
  | { readonly kind: "invalid" };

export interface PasswordReset {
  readonly tokenHash: string;
  readonly passwordHash: string;
}

export type PasswordResetOutcome =
  | { readonly kind: "password-changed" }
  | { readonly kind: "invalid" };

/** A rehash is a compare-and-set on the hash the login verified, so it cannot restore a password a reset replaced. */
export interface PasswordRehash {
  readonly accountId: string;
  readonly expectedPasswordHash: string;
  readonly passwordHash: string;
}

export type PasswordRehashOutcome =
  | { readonly kind: "replaced" }
  | { readonly kind: "stale" };

/**
 * The port for accounts and their e-mail tokens (ADR 0172 decisions 1, 2, 5, 10). A token works once, and only while
 * it is the newest unused, unexpired token of its purpose for its account; using one retires its older siblings.
 * No method writes `role`, `email`, `email_normal_form` or `id` after insert.
 */
export interface AccountStore {
  findByNormalForm(emailNormalForm: string): Promise<AccountLookup>;
  /** The account a live token names, for the confirmation page, which knows a token and a password and no address.
   *  A read only: it uses nothing up. */
  findByLiveToken(token: LiveTokenLookup): Promise<AccountLookup>;
  createUnverified(account: NewAccount): Promise<AccountCreation>;
  replaceUnverifiedRegistration(
    replacement: RegistrationReplacement,
  ): Promise<RegistrationReplacementOutcome>;
  issueToken(token: TokenToIssue): Promise<TokenIssueOutcome>;
  /** One atomic step: the newest live token, marked used, and the address verified. */
  confirmEmail(
    confirmation: EmailConfirmation,
  ): Promise<EmailConfirmationOutcome>;
  /** One atomic transaction: the newest live token, marked used, the hash and `password_changed_at` set, then every
   *  session of the account revoked (a second statement, so a session a racing login committed is revoked too). */
  completeReset(reset: PasswordReset): Promise<PasswordResetOutcome>;
  replacePasswordHash(rehash: PasswordRehash): Promise<PasswordRehashOutcome>;
}

const LOCALE_SHAPE = /^[a-z]{2}(-[a-z]{2})?$/;
const PRIVACY_NOTICE_VERSION_SHAPE = /^[a-z0-9.-]{1,32}$/;
const EMAIL_LENGTH_RANGE = { least: 3, most: 254 } as const;
const PHONE_MAX_LENGTH = 32;

/** Every check `0012` makes on a registration's columns, and the hash's. A message names the field, never its value. */
export function requireValidNewAccount(account: NewAccount): void {
  requireValidRegistrationFields(account, "create an account");
  requireField(
    isLengthWithin(
      account.email,
      EMAIL_LENGTH_RANGE.least,
      EMAIL_LENGTH_RANGE.most,
    ),
    "e-mail",
    "3 to 254 characters",
    "create an account",
  );
}

export function requireValidRegistrationReplacement(
  replacement: RegistrationReplacement,
): void {
  requireValidRegistrationFields(
    replacement,
    "replace an unverified registration",
  );
}

export function requireValidTokenToIssue(token: TokenToIssue): void {
  requireSha256Digest(token.tokenHash, "token hash", "issue an e-mail token");
  requireField(
    isEmailTokenPurpose(token.purpose),
    "purpose",
    "one of the closed list",
    "issue an e-mail token",
  );
  requireField(
    token.expiresAt instanceof Date && !Number.isNaN(token.expiresAt.getTime()),
    "expiry",
    "a valid instant",
    "issue an e-mail token",
  );
}

export function requireValidLiveTokenLookup(lookup: LiveTokenLookup): void {
  requireSha256Digest(lookup.tokenHash, "token hash", "look up an account");
  requireField(
    isEmailTokenPurpose(lookup.purpose),
    "purpose",
    "one of the closed list",
    "look up an account",
  );
}

export function requireValidEmailConfirmation(
  confirmation: EmailConfirmation,
): void {
  requireSha256Digest(
    confirmation.tokenHash,
    "token hash",
    "confirm an e-mail address",
  );
  requirePasswordHashShape(
    confirmation.verifiedPasswordHash,
    "confirm an e-mail address",
  );
}

export function requireValidPasswordReset(reset: PasswordReset): void {
  requireSha256Digest(
    reset.tokenHash,
    "token hash",
    "complete a password reset",
  );
  requirePasswordHashShape(reset.passwordHash, "complete a password reset");
}

export function requireValidPasswordRehash(rehash: PasswordRehash): void {
  requirePasswordHashShape(rehash.passwordHash, "replace a password hash");
  requirePasswordHashShape(
    rehash.expectedPasswordHash,
    "replace a password hash",
  );
}

export function isEmailTokenPurpose(
  value: unknown,
): value is EmailTokenPurpose {
  return EMAIL_TOKEN_PURPOSES.some((purpose) => purpose === value);
}

function requireValidRegistrationFields(
  fields: RegistrationReplacement,
  operation: AccountStoreOperation,
): void {
  requireField(
    isLengthWithin(
      fields.emailNormalForm,
      EMAIL_LENGTH_RANGE.least,
      EMAIL_LENGTH_RANGE.most,
    ),
    "e-mail normal form",
    "3 to 254 characters",
    operation,
  );
  requireField(
    typeof fields.locale === "string" && LOCALE_SHAPE.test(fields.locale),
    "locale",
    "two lower-case letters",
    operation,
  );
  requireField(
    typeof fields.privacyNoticeVersion === "string" &&
      PRIVACY_NOTICE_VERSION_SHAPE.test(fields.privacyNoticeVersion),
    "privacy notice version",
    "1 to 32 of a-z, 0-9, dot and hyphen",
    operation,
  );
  requireField(
    isStorablePhone(fields.phone),
    "phone",
    "absent or at most 32 characters",
    operation,
  );
  requirePasswordHashShape(fields.passwordHash, operation);
}

function isStorablePhone(phone: RegisteredPhone | undefined): boolean {
  if (phone === undefined) return true;
  return (
    isLengthWithin(phone.entered, 1, PHONE_MAX_LENGTH) &&
    isLengthWithin(phone.normalForm, 1, PHONE_MAX_LENGTH)
  );
}

/** The table's `char_length` counts characters, not UTF-16 units. */
function isLengthWithin(value: unknown, least: number, most: number): boolean {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= least && length <= most;
}

function requireField(
  isValid: boolean,
  field: string,
  rule: string,
  operation: AccountStoreOperation,
): void {
  if (isValid) return;
  throw new Error(
    `Refusing to ${operation}: its ${field} must be ${rule}. The table would refuse the row.`,
  );
}
