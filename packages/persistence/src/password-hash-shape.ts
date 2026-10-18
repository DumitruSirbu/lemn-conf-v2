const ARGON2ID_PHC =
  /^[$]argon2id[$]v=19[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$/;

/** The shape `accounts_password_hash_is_argon2id` (`0012`) enforces, asked before a statement is sent. It reads a
 * hash's  shape and says nothing of any password. Shared by the account and session ports, which both bind a hash. */
export function requirePasswordHashShape(
  value: unknown,
  operation: string,
): void {
  if (typeof value === "string" && ARGON2ID_PHC.test(value)) return;
  throw new Error(
    `Refusing to ${operation}: a password hash must be an argon2id PHC string. The table would refuse the row.`,
  );
}
