import type {
  ProfileTextChanges,
  RegisteredPhone,
  RegistrationFields,
  Role,
} from "@lemnaria/configurator-domain";

import { requireAccountIdShape } from "./account-id-shape.js";
import { requirePasswordHashShape } from "./password-hash-shape.js";
import { requireSha256Digest } from "./sha256-digest.js";

/** The undo link to the address an account has left. It is not a plain token: it carries that address. */
export const EMAIL_CHANGE_REVERT_PURPOSE = "email-change-revert";

/** The links the mail carries. The closed list lives here and not in the table, so a later purpose drops no
 *  constraint (`0014`). */
export const EMAIL_TOKEN_PURPOSES = [
  "verify-email",
  "reset-password",
  "email-change",
  EMAIL_CHANGE_REVERT_PURPOSE,
] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

/** The purposes whose row carries an address (`0018`). An `email-change` row holds the new address and is issued only
 *  through `issueEmailChangeToken`; an `email-change-revert` row holds the address being left and is written only
 *  inside `confirmEmailChange`'s transaction. Neither can exist without one. */
const ADDRESS_CARRYING_PURPOSES = [
  "email-change",
  EMAIL_CHANGE_REVERT_PURPOSE,
] as const satisfies readonly EmailTokenPurpose[];

/** The purposes whose row carries no address, and so the only ones `issueToken` writes. */
export type PlainEmailTokenPurpose = Exclude<
  EmailTokenPurpose,
  (typeof ADDRESS_CARRYING_PURPOSES)[number]
>;

export type AccountStoreOperation =
  | "look up an account"
  | "create an account"
  | "replace an unverified registration"
  | "issue an e-mail token"
  | "confirm an e-mail address"
  | "complete a password reset"
  | "issue an e-mail change token"
  | "retire e-mail change tokens"
  | "change an e-mail address"
  | "revert an e-mail address change"
  | "look up an address reservation"
  | "replace a password hash"
  | "read a profile"
  | "update a profile"
  | "change a password";

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

/**
 * `address-taken` covers a verified and an unverified account alike: the caller decides what to do about each.
 * `address-reserved` is an address no account holds but a live `email-change-revert` row names: nothing was created,
 * and the caller must not mail it (ADR 0172 Amendment H).
 */
export type AccountCreation =
  | { readonly kind: "created"; readonly accountId: string }
  | { readonly kind: "address-taken" }
  | { readonly kind: "address-reserved" };

/** `not-replaceable` is a verified account, or none at all: the predicate holds `email_verified_at is null`, so a
 *  verified account is never touched. */
export type RegistrationReplacementOutcome =
  | { readonly kind: "replaced"; readonly accountId: string }
  | { readonly kind: "not-replaceable" };

/** `tokenHash` is the SHA-256 of the value in the link; the value itself never reaches the store. */
export interface TokenToIssue {
  readonly accountId: string;
  readonly purpose: PlainEmailTokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** `refused` is an account that does not exist, or a token hash already held by another account or purpose. */
export type TokenIssueOutcome =
  | { readonly kind: "issued" }
  | { readonly kind: "refused" };

/**
 * An `email-change` token: the new address travels on the row, so the link carries only the token and the address is
 * read back from the row at confirmation, never from the link. `newEmail` is as typed and trimmed, `newEmailNormalForm`
 * is the domain's counted form, as `accounts` holds them. `verifiedPasswordHash` is the hash the caller verified the
 * current password against, bound into the one statement so a password changed after that check issues nothing.
 */
export interface EmailChangeTokenToIssue {
  readonly accountId: string;
  readonly verifiedPasswordHash: string;
  readonly newEmail: string;
  readonly newEmailNormalForm: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/**
 * The token alone is the subject of a confirmation: no account is named, and the address comes from the token's row.
 * `revertTokenHash` and `revertExpiresAt` are the undo link the caller minted **once** for this call (ADR 0172
 * Amendment H): the store writes that row, holding the address being left, in the same transaction and from the token
 * it actually consumed, so a refused confirmation writes none.
 */
export interface EmailChangeConfirmation {
  readonly tokenHash: string;
  readonly revertTokenHash: string;
  readonly revertExpiresAt: Date;
}

/**
 * `changed` carries the address and language the account had before, for the notice to the old address and its revert
 * link. A retry after a lost acknowledgement reads them back from the revert row it was asked to write, so they are
 * `undefined` only when that row does not exist: another call made the change, and no link of this call's is stored.
 * `invalid` covers an unknown, used, expired or superseded token, a token issued before the account's last password
 * change, an account that is not verified, and a new address another account now holds or has reserved.
 */
export type EmailChangeOutcome =
  | {
      readonly kind: "changed";
      readonly accountId: string;
      readonly previous: PreviousAddress | undefined;
    }
  | { readonly kind: "invalid" };

export interface PreviousAddress {
  readonly email: string;
  readonly locale: string;
}

/**
 * The undo link is the subject: the token and the new password, and no account named. `passwordHash` is the PHC string
 * the caller made from the new password, and it is minted once, before the call, so a retry names the same hash.
 */
export interface EmailChangeRevert {
  readonly tokenHash: string;
  readonly passwordHash: string;
}

/**
 * `reverted` carries the restored address and the account's language, for the password-changed notice to the restored
 * address; a retry after a lost acknowledgement reads them back from the account. `invalid` is one answer for every
 * refusal: an unknown, used, expired or retired token, a token of another purpose, an account that is not verified, and
 * an address another account holds or a live undo link of another account names.
 */
export type EmailChangeRevertOutcome =
  | {
      readonly kind: "reverted";
      readonly accountId: string;
      readonly email: string;
      readonly locale: string;
    }
  | { readonly kind: "invalid" };

/** Whether `emailNormalForm` is reserved against every account but `exceptAccountId`. */
export interface AddressReservationQuestion {
  readonly emailNormalForm: string;
  readonly exceptAccountId: string;
}

/** A token as the link carried it, asked of a purpose. An `email-change-revert` token is not asked this way: any live
 *  one is valid, so the newest-token rule this lookup applies would wrongly refuse an earlier one. */
export interface LiveTokenLookup {
  readonly tokenHash: string;
  readonly purpose: Exclude<
    EmailTokenPurpose,
    typeof EMAIL_CHANGE_REVERT_PURPOSE
  >;
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

/** The optional details an account keeps; `null` is "not given". The phone is as the person typed it, and unverified.
 *  The account's address and password hash are not here: this is what a profile screen may show. */
export interface StoredProfile {
  readonly name: string | null;
  readonly address: string | null;
  readonly phone: string | null;
}

export type ProfileLookup =
  | { readonly kind: "found"; readonly profile: StoredProfile }
  | { readonly kind: "none" };

/** `changes` is the domain's: a field is a key only when the request named it, `""` clears a text field, and the two
 *  phone columns travel together. Nothing else of the account can be named. */
export interface ProfileUpdate {
  readonly accountId: string;
  readonly changes: ProfileTextChanges;
}

/** `none` is an account that does not exist. */
export type ProfileUpdateOutcome =
  | { readonly kind: "saved" }
  | { readonly kind: "none" };

/** A signed-in password change is a compare-and-set on the hash the caller verified, so it cannot overwrite a password
 *  that a reset or another change replaced meanwhile. */
export interface PasswordChange {
  readonly accountId: string;
  readonly expectedPasswordHash: string;
  readonly passwordHash: string;
}

/** `stale`: the account no longer holds `expectedPasswordHash` (or is gone); nothing was written. */
export type PasswordChangeOutcome =
  | { readonly kind: "changed" }
  | { readonly kind: "stale" };

/**
 * The port for accounts and their e-mail tokens (ADR 0172 decisions 1, 2, 5, 10). A token works once, and only while
 * it is the newest unused, unexpired token of its purpose for its account; using one retires its older siblings.
 * `email-change-revert` is the one exception (Amendment H): every unused, unexpired one is valid, and a password
 * change, a reset or an address change retires none. While one is live, the address it names is **reserved**: no other
 * account can register it, be changed to it or be reverted to it.
 * No method writes `role` or `id` after insert; only `confirmEmailChange` and `revertEmailChange` write `email` and
 * `email_normal_form`.
 */
export interface AccountStore {
  findByNormalForm(emailNormalForm: string): Promise<AccountLookup>;
  /** The account a session has just shown to exist. `accountId` is the session's, never a request's. */
  findById(accountId: string): Promise<AccountLookup>;
  /** The profile of the account a session names, with no credential in it. */
  findProfile(accountId: string): Promise<ProfileLookup>;
  /** One statement that writes `name`, `address`, `phone` and `phone_normal_form` for the fields `changes` names and
   *  nothing else: an empty text is stored as `null`, and the phone pair is set or cleared together. */
  updateProfile(update: ProfileUpdate): Promise<ProfileUpdateOutcome>;
  /** One transaction: the hash replaced if it is still `expectedPasswordHash`, `password_changed_at` set, then every
   *  session of the account revoked (a second statement, so a session a racing login committed is revoked too). The
   *  caller starts the replacing session afterwards, bound to the new hash. */
  changePassword(change: PasswordChange): Promise<PasswordChangeOutcome>;
  /** The account a live token names, for the confirmation page, which knows a token and a password and no address.
   *  A read only: it uses nothing up. */
  findByLiveToken(token: LiveTokenLookup): Promise<AccountLookup>;
  createUnverified(account: NewAccount): Promise<AccountCreation>;
  replaceUnverifiedRegistration(
    replacement: RegistrationReplacement,
  ): Promise<RegistrationReplacementOutcome>;
  issueToken(token: TokenToIssue): Promise<TokenIssueOutcome>;
  /** Inserts an `email-change` token holding the new address, for a verified account that still holds
   *  `verifiedPasswordHash` only. A newer token of the purpose supersedes this one, as for any purpose. */
  issueEmailChangeToken(
    token: EmailChangeTokenToIssue,
  ): Promise<TokenIssueOutcome>;
  /** Marks every unused `email-change` token of the account used, and no token of another purpose. Idempotent. */
  retireEmailChangeTokens(accountId: string): Promise<void>;
  /**
   * One transaction: the newest live `email-change` token consumed, `email` and `email_normal_form` replaced by the
   * row's new address, an `email-change-revert` row holding the address left, every other unused token of the account
   * retired **except earlier `email-change-revert` rows** (a link mailed to the old address cannot outlive it, but the
   * undo link can), then every session revoked in a second statement. A token issued before the account's last
   * password change is refused, and so is a new address another account holds or a live `email-change-revert` row of
   * another account names, which writes nothing, leaves the token whole and writes no revert row.
   */
  confirmEmailChange(
    confirmation: EmailChangeConfirmation,
  ): Promise<EmailChangeOutcome>;
  /**
   * One transaction: the `email-change-revert` token consumed (unused, unexpired, address-carrying, of a verified
   * account; **not** subject to the newest-token rule or to the password-change binding), `email` and
   * `email_normal_form` restored from its row, the new hash and `password_changed_at` set, every other unused token of
   * the account retired **and every undo link created after this one** (the oldest wins: earlier links stay usable),
   * then every session revoked in a second statement. Refused with one answer, and nothing written, when another
   * account holds the address or another account's live undo link names it.
   */
  revertEmailChange(
    revert: EmailChangeRevert,
  ): Promise<EmailChangeRevertOutcome>;
  /** True when a live `email-change-revert` row of an account other than `exceptAccountId` names the address. */
  isAddressReserved(question: AddressReservationQuestion): Promise<boolean>;
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
/** The bounds `0017`'s checks enforce. The domain's own limits are tighter and are the rule; these are the backstop. */
const PROFILE_NAME_COLUMN_MAX = 120;
const PROFILE_ADDRESS_COLUMN_MAX = 200;

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
    isPlainEmailTokenPurpose(token.purpose),
    "purpose",
    "one of the closed list that carries no address",
    "issue an e-mail token",
  );
  requireField(
    token.expiresAt instanceof Date && !Number.isNaN(token.expiresAt.getTime()),
    "expiry",
    "a valid instant",
    "issue an e-mail token",
  );
}

export function requireValidEmailChangeTokenToIssue(
  token: EmailChangeTokenToIssue,
): void {
  const operation = "issue an e-mail change token";
  requireAccountIdShape(token.accountId, operation);
  requirePasswordHashShape(token.verifiedPasswordHash, operation);
  requireSha256Digest(token.tokenHash, "token hash", operation);
  requireField(
    isLengthWithin(
      token.newEmail,
      EMAIL_LENGTH_RANGE.least,
      EMAIL_LENGTH_RANGE.most,
    ),
    "new e-mail",
    "3 to 254 characters",
    operation,
  );
  requireField(
    isLengthWithin(
      token.newEmailNormalForm,
      EMAIL_LENGTH_RANGE.least,
      EMAIL_LENGTH_RANGE.most,
    ),
    "new e-mail normal form",
    "3 to 254 characters",
    operation,
  );
  requireField(
    token.expiresAt instanceof Date && !Number.isNaN(token.expiresAt.getTime()),
    "expiry",
    "a valid instant",
    operation,
  );
}

export function requireValidEmailChangeRetirement(accountId: string): void {
  requireAccountIdShape(accountId, "retire e-mail change tokens");
}

export function requireValidEmailChangeConfirmation(
  confirmation: EmailChangeConfirmation,
): void {
  const operation = "change an e-mail address";
  requireSha256Digest(confirmation.tokenHash, "token hash", operation);
  requireSha256Digest(
    confirmation.revertTokenHash,
    "revert token hash",
    operation,
  );
  requireField(
    confirmation.revertExpiresAt instanceof Date &&
      !Number.isNaN(confirmation.revertExpiresAt.getTime()),
    "revert expiry",
    "a valid instant",
    operation,
  );
}

export function requireValidEmailChangeRevert(revert: EmailChangeRevert): void {
  const operation = "revert an e-mail address change";
  requireSha256Digest(revert.tokenHash, "token hash", operation);
  requirePasswordHashShape(revert.passwordHash, operation);
}

export function requireValidAddressReservationQuestion(
  question: AddressReservationQuestion,
): void {
  const operation = "look up an address reservation";
  requireField(
    isLengthWithin(
      question.emailNormalForm,
      EMAIL_LENGTH_RANGE.least,
      EMAIL_LENGTH_RANGE.most,
    ),
    "e-mail normal form",
    "3 to 254 characters",
    operation,
  );
  requireAccountIdShape(question.exceptAccountId, operation);
}

export function requireValidLiveTokenLookup(lookup: LiveTokenLookup): void {
  requireSha256Digest(lookup.tokenHash, "token hash", "look up an account");
  requireField(
    isEmailTokenPurpose(lookup.purpose) &&
      !isEmailChangeRevertPurpose(lookup.purpose),
    "purpose",
    "one of the closed list that is subject to the newest-token rule",
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

export function requireValidProfileUpdate(update: ProfileUpdate): void {
  const operation = "update a profile";
  requireAccountIdShape(update.accountId, operation);
  const { name, address, phone } = update.changes;
  requireField(
    name === undefined || isLengthWithin(name, 0, PROFILE_NAME_COLUMN_MAX),
    "name",
    `empty or at most ${String(PROFILE_NAME_COLUMN_MAX)} characters`,
    operation,
  );
  requireField(
    address === undefined ||
      isLengthWithin(address, 0, PROFILE_ADDRESS_COLUMN_MAX),
    "address",
    `empty or at most ${String(PROFILE_ADDRESS_COLUMN_MAX)} characters`,
    operation,
  );
  requireField(
    phone === undefined || isStorablePhoneChange(phone),
    "phone",
    `both columns null or both 1 to ${String(PHONE_MAX_LENGTH)} characters`,
    operation,
  );
}

export function requireValidPasswordChange(change: PasswordChange): void {
  requireAccountIdShape(change.accountId, "change a password");
  requirePasswordHashShape(change.passwordHash, "change a password");
  requirePasswordHashShape(change.expectedPasswordHash, "change a password");
}

/** One account column's write: the value to store (`null` clears it), or `undefined` to leave the column as it is. */
export type ColumnWrite = string | null | undefined;

export interface ProfileColumnWrites {
  readonly name: ColumnWrite;
  readonly address: ColumnWrite;
  readonly phone: ColumnWrite;
  readonly phoneNormalForm: ColumnWrite;
}

/** The columns a validated update writes. The table refuses an empty text, so an empty one is stored as `null`. */
export function profileColumnWritesOf(
  changes: ProfileTextChanges,
): ProfileColumnWrites {
  return {
    name: nullWhenEmpty(changes.name),
    address: nullWhenEmpty(changes.address),
    phone: changes.phone?.phone,
    phoneNormalForm: changes.phone?.phoneNormalForm,
  };
}

function nullWhenEmpty(text: string | undefined): ColumnWrite {
  return text === "" ? null : text;
}

export function isEmailTokenPurpose(
  value: unknown,
): value is EmailTokenPurpose {
  return EMAIL_TOKEN_PURPOSES.some((purpose) => purpose === value);
}

function isEmailChangeRevertPurpose(value: unknown): boolean {
  return value === EMAIL_CHANGE_REVERT_PURPOSE;
}

/** A purpose whose row carries no address; a cast can hand `issueToken` the other kind, and it is refused. */
function isPlainEmailTokenPurpose(
  value: unknown,
): value is PlainEmailTokenPurpose {
  return (
    isEmailTokenPurpose(value) &&
    !ADDRESS_CARRYING_PURPOSES.some((purpose) => purpose === value)
  );
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

function isStorablePhoneChange(
  phone: NonNullable<ProfileTextChanges["phone"]>,
): boolean {
  if (phone.phone === null || phone.phoneNormalForm === null) {
    return phone.phone === null && phone.phoneNormalForm === null;
  }
  return (
    isLengthWithin(phone.phone, 1, PHONE_MAX_LENGTH) &&
    isLengthWithin(phone.phoneNormalForm, 1, PHONE_MAX_LENGTH)
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
