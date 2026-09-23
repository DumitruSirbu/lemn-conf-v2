/** SHA-256 as `node:crypto`'s `digest("hex")` renders it: 64 lowercase hex characters. */
const SHA256_HEX_DIGEST = /^[0-9a-f]{64}$/;

/**
 * The one shape this package accepts for a value it is about to store as a credential's digest:
 * exactly what SHA-256 produces, a 64-character lowercase hex digest.
 *
 * Stated as what a hash **is**, not as a list of what it must not be. The empty string is the
 * instance that prompted this — `'' = ''` is true in SQL, so a row stored with one is writable (or
 * resumable, or openable) by anyone presenting an empty string — but a whitespace-only value has the
 * same property, and so does every other low-entropy value a broken caller might supply. A blocklist
 * grows one discovered value at a time; the contract does not.
 *
 * **Operation-named, not caller-named** (extracted from `neon-configuration-repository.ts`, M7 wave
 * 7E3c D3): `mint` and `issue` both guard a value about to be stored, and each needs its own refusal
 * to say what it was refusing to do — "Refusing to mint a design" would be simply wrong from
 * `NeonShareLinkRepository.issue`. `whatItIs` names which credential failed; the offending value is
 * deliberately absent from the message either way (7E3a D2: "names no value").
 */
export function requireSha256Digest(
  value: string,
  whatItIs: string,
  operation: string,
): void {
  if (SHA256_HEX_DIGEST.test(value)) return;
  throw new Error(
    `Refusing to ${operation}: a ${whatItIs} must be a 64-character lowercase hex SHA-256 digest. ` +
      `Any other shape risks a row a guessable value could write or claim.`,
  );
}
