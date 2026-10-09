import "server-only";

import {
  DIGEST_KEY_BYTES,
  keyedDigest,
  type DigestInput,
} from "@/lib/server/digest/keyed-digest";

export const DIGEST_SECRET_VARIABLE = "DIGEST_SECRET";

export type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type Digester = (input: DigestInput) => string;

/** `unavailable` names the variable and nothing of what it holds: not its length, not a character. */
export type DigesterOutcome =
  | { readonly status: "usable"; readonly digest: Digester }
  | {
      readonly status: "unavailable";
      readonly variable: typeof DIGEST_SECRET_VARIABLE;
    };

const USABLE_SECRET = new RegExp(`^[0-9a-f]{${String(DIGEST_KEY_BYTES * 2)}}$`);

/**
 * Pure: the environment is handed in and read at each call, so a build needs no value and no module holds one. The key
 * lives in the closure of the digester and in no value this module returns or throws. There is no default.
 */
export function readDigester(environment: ServerEnvironment): DigesterOutcome {
  const value = ownValue(environment, DIGEST_SECRET_VARIABLE);
  if (typeof value !== "string" || !USABLE_SECRET.test(value)) {
    return { status: "unavailable", variable: DIGEST_SECRET_VARIABLE };
  }
  const key = Buffer.from(value, "hex");
  return { status: "usable", digest: (input) => keyedDigest(key, input) };
}

function ownValue(environment: ServerEnvironment, name: string): unknown {
  return Object.hasOwn(environment, name) ? environment[name] : undefined;
}
