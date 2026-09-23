import "server-only";

import { createHash } from "node:crypto";

/**
 * SHA-256, hex, over the UTF-8 encoding of `value` — this app's one digest shape for a
 * high-entropy secret at rest (a visitor value, a write token, a share token). Not a slow KDF: each
 * input is already well over a hundred bits of CSPRNG output rather than a guessable human secret,
 * so there is no dictionary for a work factor to slow down — the hash exists only to make a database
 * leak non-transferable.
 *
 * **Third use, extracted** (M7 wave 7E3c S3a): `visitor.ts`'s former `hashVisitor` and
 * `write-token.ts`'s former `hashWriteToken` were byte-identical one-liners, kept apart only because
 * two uses is not yet the rule this codebase extracts on. `createShareToken` is the third.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
