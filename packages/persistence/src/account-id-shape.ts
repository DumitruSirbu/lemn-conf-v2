/** The shape `designs_account_id_shape` (`0015`) and `accounts_id_shape` (`0012`) check: what `generateAccountId`
 *  makes. */
const ACCOUNT_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

/** Refuses an account id of any other shape with a reason, not with a database constraint's name. The value is left out
 *  of the message. */
export function requireAccountIdShape(
  accountId: unknown,
  operation: string,
): void {
  if (typeof accountId === "string" && ACCOUNT_ID_SHAPE.test(accountId)) return;
  throw new Error(
    `Refusing to ${operation}: an account id must be the 21 URL-safe characters an account is given.`,
  );
}
