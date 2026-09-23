import "server-only";

const VARIABLE_NAME = "VISITOR_ROTATION_SECRET";

/** Exactly what 32 random bytes look like base64url-encoded: 43 characters, no `=` padding — the
 *  same shape a visitor value itself has, which is what lets the derived HMAC tag be stored as one
 *  without any further encoding step. */
const WELL_FORMED_SECRET = /^[A-Za-z0-9_-]{43}$/;

/**
 * `VISITOR_ROTATION_SECRET` is missing, empty, or not 32 base64url-encoded random bytes (ADR 0114
 * Amendment H4). **Every** mint fails closed on this, not only a rotating one — so a misconfigured
 * environment shows on the very first mint rather than selectively on a returning visitor's.
 *
 * The message names the variable and nothing else: never its value, never its length, and never
 * whether it was absent or merely malformed — the two shapes of "not usable" carry one refusal.
 */
export class VisitorRotationSecretUnavailableError extends Error {
  constructor() {
    super(
      `Refusing to mint a design: ${VARIABLE_NAME} is not set to 32 base64url-encoded random ` +
        "bytes. Every mint fails closed until it is provisioned correctly.",
    );
    this.name = "VisitorRotationSecretUnavailableError";
  }
}

/**
 * Reads and shape-checks `VISITOR_ROTATION_SECRET` — lazily, at mint, and never at module load.
 * `next build` runs with no environment at all (`ci.yml`'s `build` job), so a boot-time read here
 * would fail the build gate rather than the deploy that actually needs the value.
 *
 * No default and no fallback to a random value: a silent fallback is exactly the defect ADR 0114
 * Amendment H4 exists to close — an attacker who cannot derive `N` offline learns nothing from a
 * mint that quietly stopped deriving it.
 */
export function readVisitorRotationSecret(): string {
  const value = process.env[VARIABLE_NAME];
  if (value === undefined || !WELL_FORMED_SECRET.test(value)) {
    throw new VisitorRotationSecretUnavailableError();
  }
  return value;
}
