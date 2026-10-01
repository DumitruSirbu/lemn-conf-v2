import "server-only";

import { randomBytes } from "node:crypto";

import { sha256Hex } from "./sha256-hex";

/** D1: `[0-9A-Za-z]`, in that order — digits first, then uppercase, then lowercase. The order is
 *  arbitrary as a *value*, but it must be fixed and public, because `byte % ALPHABET.length` is
 *  where every accepted byte lands. */
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ALPHABET_SIZE = ALPHABET.length;

/** The largest multiple of 62 a byte can hold: `4 * 62 = 248`. A byte in `[0, 248)` has exactly four
 *  possible values mapping to each character; a byte in `[248, 256)` would give the eight symbols
 *  0-7 a fifth preimage under a bare `% 62`, which is the bias rejection sampling exists to remove
 *  (ADR 0114 Amendment C1: *"rejection-sampled, so every character is uniform"*). */
const MAX_ACCEPTED_BYTE = ALPHABET_SIZE * 4;

const TOKEN_LENGTH = 12;

/** How many bytes `createShareToken` asks for per draw. Rejecting discards roughly 8/256 ≈ 3% of
 *  bytes, so one draw this size almost always yields all 12 accepted bytes in a single round trip
 *  to the CSPRNG; the loop below simply draws again on the rare shortfall rather than trusting that. */
const DRAW_BATCH_SIZE = 32;

/** A source of random bytes, shaped exactly like `node:crypto`'s `randomBytes` — the one seam
 *  `createShareToken` exposes, so a test can hand it a fixed, known sequence (every byte 0-255, in
 *  order) instead of trusting the CSPRNG to visit every case within a bounded number of draws. */
export type ByteSource = (size: number) => Uint8Array;

/** A freshly minted share token and the digest `design_share_links.token_hash` stores. The raw
 *  token is returned so the caller can hand it to the browser exactly once (D10); nothing here
 *  persists it. */
export interface MintedShareToken {
  readonly token: string;
  readonly hash: string;
}

/**
 * D1's token: 12 characters from `[0-9A-Za-z]` (62 symbols, ≈71 bits — ADR 0114 Amendment C1),
 * drawn by rejection sampling so every character is equally likely. `byte % 62` alone would not be:
 * 256 is not a multiple of 62, so bytes 248-255 would land on symbols 0-7 a fifth time each, biasing
 * exactly those eight characters about 25% more likely than the rest. Discarding those eight values
 * before reducing removes the bias completely — every accepted byte has exactly four preimages.
 *
 * `drawBytes` defaults to `randomBytes` and is the only way entropy enters this function. **No
 * pepper, no environment variable** (ADR 0114 Amendment C1): the token is the only secret a share
 * link needs.
 */
export function createShareToken(
  drawBytes: ByteSource = randomBytes,
): MintedShareToken {
  const characters: string[] = [];
  while (characters.length < TOKEN_LENGTH) {
    for (const byte of drawBytes(DRAW_BATCH_SIZE)) {
      if (characters.length >= TOKEN_LENGTH) break;
      if (byte >= MAX_ACCEPTED_BYTE) continue;
      characters.push(ALPHABET.charAt(byte % ALPHABET_SIZE));
    }
  }
  const token = characters.join("");
  return { token, hash: sha256Hex(token) };
}

/** D1's shape, `^[0-9A-Za-z]{12}$` — what a `/s/{token}` path segment must match before it is ever
 *  hashed and looked up. A value failing this check names no query: the share view's "unavailable"
 *  response for a malformed token is answered with no read at all (criterion 10). */
const SHARE_TOKEN_SHAPE = /^[0-9A-Za-z]{12}$/;

export function isWellFormedShareToken(value: string): boolean {
  return SHARE_TOKEN_SHAPE.test(value);
}
