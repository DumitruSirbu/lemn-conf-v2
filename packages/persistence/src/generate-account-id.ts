import { nanoid } from "nanoid";

/** Mints an account id: opaque, random and 21 URL-safe characters, the shape `accounts_id_shape` (`0012`) checks.
 *  Never derived from the address, a counter or a clock. */
export function generateAccountId(): string {
  return nanoid();
}
