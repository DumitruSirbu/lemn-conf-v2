/** What an account's id is made of: 21 characters of `A-Za-z0-9_-`, which `accounts_id_shape` (migration `0012`)
 *  checks and the persistence package's id generator makes. */
const ACCOUNT_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

/** Whether text has the shape of an account's id. A shape only: it says nothing of whether the account exists. */
export function isAccountId(text: string): boolean {
  return ACCOUNT_ID_SHAPE.test(text);
}
