import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// Same seam `write-token.test.ts` uses to spy on `node:crypto`'s frozen ESM namespace: `vi.mock`
// intercepts the module at resolution time, and the real implementation still runs underneath.
const randomBytesSpy = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  randomBytesSpy.mockImplementation(actual.randomBytes);
  return { ...actual, randomBytes: randomBytesSpy };
});

const { createShareToken, isWellFormedShareToken } = await import(
  "../../../src/lib/server/share-token"
);
type ByteSource = (size: number) => Uint8Array;

/** The module's own alphabet, kept independently here rather than imported — the same black-box
 *  discipline `write-token.test.ts` applies to its digest: a test that imported the constant under
 *  test could not catch the constant itself drifting. Order matters (D1: digits, then upper, then
 *  lower) because it decides exactly which character `byte % 62` names. */
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_LENGTH = 12;
/** `4 * 62`: the largest byte value rejection sampling accepts. Bytes 248-255 are the ones a bare
 *  `% 62` would give a fifth preimage to (ADR 0114 Amendment C1's *"a modulo reduction would bias
 *  it"*), which is exactly what this file's tests exist to catch if it ever regresses. */
const MAX_ACCEPTED_BYTE = 248;

/** A `ByteSource` that returns each array in `batches`, in order, and repeats the last one forever
 *  once they run out — so a test can hand `createShareToken` an exact, known sequence regardless of
 *  how many times it draws. */
function fixedByteSource(...batches: readonly number[][]): ByteSource {
  let index = 0;
  return () => {
    const batch = batches[Math.min(index, batches.length - 1)] ?? [];
    index += 1;
    return Uint8Array.from(batch);
  };
}

describe("createShareToken", () => {
  it("produces exactly 12 characters, all from [0-9A-Za-z]", () => {
    const { token } = createShareToken();

    expect(token).toMatch(/^[0-9A-Za-z]{12}$/);
  });

  it("pairs the token with its SHA-256 digest and nothing else", () => {
    const { token, hash } = createShareToken();

    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(hash).not.toBe(token);
  });

  it("draws its bytes from the platform CSPRNG by default", () => {
    randomBytesSpy.mockClear();

    createShareToken();

    expect(randomBytesSpy).toHaveBeenCalled();
  });

  it("calls no non-cryptographic random source anywhere in the module", () => {
    // Watched as a call, and every character of the token traced to the bytes the CSPRNG returned. The spy on
    // `randomBytes` is satisfied by a draw that is thrown away, and a search of the source for `Math.random(` by
    // `Math["random"]()`; neither says where the token's bytes came from.
    const mathRandom = vi.spyOn(Math, "random");
    randomBytesSpy.mockClear();

    const { token } = createShareToken();
    const callsToMathRandom = mathRandom.mock.calls.length;
    mathRandom.mockRestore();
    const drawn = randomBytesSpy.mock.results.flatMap((result) => [
      ...(result.value as Uint8Array),
    ]);
    const tokenFromTheDrawnBytes = drawn
      .filter((byte) => byte < MAX_ACCEPTED_BYTE)
      .slice(0, TOKEN_LENGTH)
      .map((byte) => ALPHABET.charAt(byte % ALPHABET.length))
      .join("");

    expect(callsToMathRandom).toBe(0);
    expect(token).toBe(tokenFromTheDrawnBytes);
  });

  it("maps a batch of accepted bytes to ALPHABET[byte % 62], in order", () => {
    // 0 and 247 are the accepted range's own edges; the rest spread across it, including a
    // deliberate repeat (0 and 62 both name the alphabet's first character) to show the mapping is
    // `byte % 62` and not merely "distinct bytes look distinct".
    const bytes = [0, 61, 62, 65, 123, 130, 184, 186, 200, 245, 246, 247];

    const { token } = createShareToken(fixedByteSource(bytes));

    expect(token).toBe(
      bytes.map((byte) => ALPHABET.charAt(byte % 62)).join(""),
    );
  });

  it("rejects every byte from 248 to 255, drawing again rather than using one", () => {
    const rejected = [248, 249, 250, 251, 252, 253, 254, 255];
    const accepted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    const { token } = createShareToken(fixedByteSource(rejected, accepted));

    // If a single rejected byte had ever been used, the token could not equal this: every
    // character here names a distinct low residue, so a leaked 248-255 byte would show up as a
    // character none of `accepted`'s residues produce.
    expect(token).toBe(accepted.map((byte) => ALPHABET.charAt(byte)).join(""));
  });

  it(
    "gives every accepted byte 0-247 exactly four preimages, proved without statistics " +
      "(criterion 1's sabotage: a bare `% 62` over 0-255 would give eight characters a fifth)",
    () => {
      const byteToCharacter = new Map<number, string>();

      for (let start = 0; start < MAX_ACCEPTED_BYTE; start += TOKEN_LENGTH) {
        const batch = Array.from({ length: TOKEN_LENGTH }, (_, offset) => {
          const byte = start + offset;
          // The final batch is short by four (248 is not a multiple of 12); padding with an
          // already-recorded byte from the same batch keeps every draw exactly 12 long without
          // introducing an out-of-range value or losing coverage of the real ones.
          return byte < MAX_ACCEPTED_BYTE ? byte : start;
        });

        const { token } = createShareToken(fixedByteSource(batch));
        for (const [index, byte] of batch.entries()) {
          byteToCharacter.set(byte, token.charAt(index));
        }
      }

      // Every byte 0-247 was recorded — the padding above must not have left a gap.
      expect(byteToCharacter.size).toBe(MAX_ACCEPTED_BYTE);
      for (const [byte, character] of byteToCharacter) {
        expect(character).toBe(ALPHABET.charAt(byte % 62));
      }

      const preimageCounts = new Map<string, number>();
      for (const character of byteToCharacter.values()) {
        preimageCounts.set(character, (preimageCounts.get(character) ?? 0) + 1);
      }
      expect(preimageCounts.size).toBe(62);
      for (const count of preimageCounts.values()) expect(count).toBe(4);
    },
  );
});

describe("isWellFormedShareToken", () => {
  it("accepts a well-formed token", () => {
    expect(isWellFormedShareToken("AbC123xYz789")).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["AbC123xYz78", "11 characters"],
    ["AbC123xYz7890", "13 characters"],
    ["AbC123xYz78-", "a non-base62 character"],
    ["AbC123xYz78_", "an underscore"],
    ["AbC 23xYz789", "a space"],
  ])("refuses %j (%s)", (value) => {
    expect(isWellFormedShareToken(value)).toBe(false);
  });
});
