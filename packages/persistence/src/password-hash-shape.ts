const ARGON2ID_PHC =
  /^[$]argon2id[$]v=19[$]m=[0-9]+,t=[0-9]+,p=[0-9]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$/;

/** The strict argon2id shape, asked before a statement is sent. The table's own check (`accounts_password_hash_is_phc`,
 * `0012`) is the wider generic PHC shape, so this is the only gate on the scheme: moving to another scheme is a change
 * here and not a migration. It reads a hash's shape and says nothing of any password. Shared by the account and
 * session ports, which both bind a hash. */
export function requirePasswordHashShape(
  value: unknown,
  operation: string,
): void {
  if (typeof value === "string" && ARGON2ID_PHC.test(value)) return;
  throw new Error(
    `Refusing to ${operation}: a password hash must be an argon2id PHC string. The table would refuse the row.`,
  );
}
