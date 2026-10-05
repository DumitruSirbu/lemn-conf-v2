import "server-only";

import { randomBytes } from "node:crypto";

import { sha256Hex } from "./sha256-hex";

/** `[0-9A-Za-z]`, in that order. Arbitrary as a value but it must be fixed, because
 *  `byte % ALPHABET.length` is where every accepted byte lands. */
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ALPHABET_SIZE = ALPHABET.length;

/** The largest multiple of 62 a byte can hold: `4 * 62 = 248`. A byte in `[0, 248)` maps to each
 *  character exactly four ways; a byte in `[248, 256)` would give symbols 0-7 a fifth preimage under
 *  a bare `% 62`, the bias rejection sampling removes (ADR 0114 Amendment C1). */
const MAX_ACCEPTED_BYTE = ALPHABET_SIZE * 4;

const TOKEN_LENGTH = 12;

/** Bytes drawn per round. Rejection discards about 8/256 (3%), so one draw almost always yields all
 *  12 accepted bytes; the loop draws again on the rare shortfall rather than trusting that. */
const DRAW_BATCH_SIZE = 32;

/** Shaped like `node:crypto`'s `randomBytes`: the one seam `createShareToken` exposes, so a test can
 *  hand it a fixed sequence (every byte 0-255, in order) instead of trusting the CSPRNG to visit every case. */
export type ByteSource = (size: number) => Uint8Array;

/** A freshly minted share token and the digest `design_share_links.token_hash` stores. The raw token
 *  is returned so the caller can hand it to the browser exactly once; nothing here persists it. */
export interface MintedShareToken {
  readonly token: string;
  readonly hash: string;
}

/**
 * The token: 12 characters from `[0-9A-Za-z]` (62 symbols, ≈71 bits; ADR 0114 Amendment C1), drawn by
 * rejection sampling so every character is equally likely: `byte % 62` alone would make symbols 0-7
 * about 25% more likely, since 256 is not a multiple of 62.
 *
 * `drawBytes` defaults to `randomBytes` and is the only way entropy enters. No pepper, no environment
 * variable: the token is the only secret a share link needs.
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

/** What a `/s/{token}` path segment must match before it is hashed and looked up: a malformed token
 *  names no query, and the "unavailable" response is answered with no read at all. */
const SHARE_TOKEN_SHAPE = /^[0-9A-Za-z]{12}$/;

export function isWellFormedShareToken(value: string): boolean {
  return SHARE_TOKEN_SHAPE.test(value);
}
