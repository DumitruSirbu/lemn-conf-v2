import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DIGEST_KEY_BYTES,
  DigestFieldsError,
  DigestKeyError,
  DigestPartError,
  encodeDigestInput,
  keyedDigest,
  type DigestInput,
} from "@/lib/server/digest/keyed-digest";

import { readSource } from "../server-source-support";

/** A key nobody would deploy: the bytes 0 to 31. */
const FAKE_KEY = Uint8Array.from({ length: DIGEST_KEY_BYTES }, (_, i) => i);

function bucket(
  policyName: string,
  subjectKind: string,
  subject: string,
): DigestInput {
  return {
    purpose: "rate-limit-bucket",
    fields: { policyName, subjectKind, subject },
  };
}

describe("the known answers, each from a second tool", () => {
  // printf '%s' '<encoding>' | openssl dgst -sha256 -mac HMAC -macopt hexkey:<the key's 64 hex characters>
  // (OpenSSL 3.6.2; the same two values come from Python's hmac module.)
  const KNOWN_ANSWERS: readonly [string, DigestInput, string, string][] = [
    [
      "ASCII parts",
      bucket("test-policy-day", "ipv4-block", "192.0.2"),
      "17:rate-limit-bucket,15:test-policy-day,10:ipv4-block,7:192.0.2,",
      "1bba7acd899444786ab88d855f9cd8b6101746bb902a8903a074159b704c9c52",
    ],
    [
      "a part whose byte count is not its length",
      bucket("poli\u00e7y-d\u00e9j\u00e0", "ipv6-block", "2001:0db8:0000:0000"),
      "17:rate-limit-bucket,14:poli\u00e7y-d\u00e9j\u00e0,10:ipv6-block,19:2001:0db8:0000:0000,",
      "e58b40acdbbe6745d99fc7bb0ec461917ff5a214fd5cdc712dcfc7a1e60c9857",
    ],
  ];

  it.each(KNOWN_ANSWERS)(
    "encodes and digests %s as the second tool does",
    (_label, input, encoded, digest) => {
      expect(encodeDigestInput(input)).toBe(encoded);
      expect(keyedDigest(FAKE_KEY, input)).toBe(digest);
    },
  );
});

describe("the encoding", () => {
  it.each([
    ["an empty part", bucket("", "k", "s"), "17:rate-limit-bucket,0:,1:k,1:s,"],
    [
      "a part holding the separators",
      bucket("a:b,c", "k", "1:x,"),
      "17:rate-limit-bucket,5:a:b,c,1:k,4:1:x,,",
    ],
    [
      "a part of two-byte letters",
      bucket("\u00e9\u00e9", "k", "s"),
      "17:rate-limit-bucket,4:\u00e9\u00e9,1:k,1:s,",
    ],
    [
      "a part of one four-byte character",
      bucket("\ud83d\ude00", "k", "s"),
      "17:rate-limit-bucket,4:\ud83d\ude00,1:k,1:s,",
    ],
    [
      "a count of two digits",
      bucket("a".repeat(10), "k", "s"),
      `17:rate-limit-bucket,10:${"a".repeat(10)},1:k,1:s,`,
    ],
  ])(
    "writes %s as its byte count, a colon, the part and a comma",
    (_label, input, encoded) => {
      expect(encodeDigestInput(input)).toBe(encoded);
    },
  );

  it("writes the fields in the purpose's order, whatever order the object lists them", () => {
    const reordered = {
      purpose: "rate-limit-bucket",
      fields: { subject: "s", subjectKind: "k", policyName: "p" },
    } as const;

    expect(encodeDigestInput(reordered)).toBe(
      encodeDigestInput(bucket("p", "k", "s")),
    );
  });
});

describe("fields that are not exactly the purpose's", () => {
  const WHOLE = { policyName: "p", subjectKind: "k", subject: "s" };

  function digestOfFields(fields: unknown): string {
    return keyedDigest(FAKE_KEY, {
      purpose: "rate-limit-bucket",
      fields,
    } as unknown as DigestInput);
  }

  function withHiddenMember(): object {
    return Object.defineProperty({ ...WHOLE }, "hidden", {
      value: "x",
      enumerable: false,
    });
  }

  function withSymbolMember(): object {
    return { ...WHOLE, [Symbol("extra")]: "x" };
  }

  it.each([
    ["a member beyond them", { ...WHOLE, extra: "x" }],
    ["a hidden member beyond them", withHiddenMember()],
    ["a symbol member beyond them", withSymbolMember()],
    ["a field short", { policyName: "p", subjectKind: "k" }],
    ["no fields", {}],
    ["a field renamed", { policyName: "p", subjectKind: "k", subjectX: "s" }],
    ["nothing", undefined],
    ["null", null],
    ["text", "policyName"],
  ])("refuses %s, naming no field", (_label, fields) => {
    expect(() => digestOfFields(fields)).toThrow(new DigestFieldsError());
  });

  it("refuses fields a prototype completes, since only own members are the fields", () => {
    const inherited = Object.create({ subject: "s" }) as Record<string, string>;
    inherited.policyName = "p";
    inherited.subjectKind = "k";

    expect(() => digestOfFields(inherited)).toThrow(new DigestFieldsError());
  });

  it("still answers the known digest for exactly the fields, in any order", () => {
    expect(digestOfFields(WHOLE)).toBe(
      keyedDigest(FAKE_KEY, bucket("p", "k", "s")),
    );
  });
});

describe("what the encoding refuses", () => {
  const PARTS = ["policyName", "subjectKind", "subject"] as const;
  const LONE_SURROGATES = [
    ["a lone high half", "ab\ud800cd"],
    ["a lone low half", "ab\udc00cd"],
    ["a high half at the end", "ab\ud83d"],
    ["a low half before a high half", "\ude00\ud83d"],
  ] as const;

  describe.each(PARTS)("in the %s", (part) => {
    it.each(LONE_SURROGATES)(
      "refuses %s, naming the part and none of the text",
      (_label, text) => {
        const fields = {
          policyName: "p",
          subjectKind: "k",
          subject: "s",
          [part]: text,
        };
        const input = { purpose: "rate-limit-bucket", fields } as DigestInput;

        let thrown: unknown;
        try {
          keyedDigest(FAKE_KEY, input);
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toEqual(new DigestPartError(part));
        expect((thrown as Error).message).not.toContain("cd");
      },
    );

    it("accepts a pair of halves as one character", () => {
      const fields = {
        policyName: "p",
        subjectKind: "k",
        subject: "s",
        [part]: "\ud83d\ude00",
      };

      expect(() =>
        keyedDigest(FAKE_KEY, {
          purpose: "rate-limit-bucket",
          fields,
        } as DigestInput),
      ).not.toThrow();
    });
  });

  it.each([
    ["undefined", undefined],
    ["a number", 5],
    ["a list", ["a"]],
    ["null", null],
  ])("refuses a field that holds %s, naming it", (_label, value) => {
    const fields = { policyName: "p", subjectKind: "k", subject: value };

    expect(() =>
      keyedDigest(FAKE_KEY, {
        purpose: "rate-limit-bucket",
        fields,
      } as unknown as DigestInput),
    ).toThrow(new DigestPartError("subject"));
  });

  it.each([
    "",
    "other",
    "__proto__",
    "constructor",
    "toString",
    "rate-limit-bucket ",
  ])("refuses the purpose %j, which is not in the closed set", (purpose) => {
    const input = {
      purpose,
      fields: { policyName: "p" },
    } as unknown as DigestInput;

    expect(() => keyedDigest(FAKE_KEY, input)).toThrow(
      new DigestPartError("purpose"),
    );
  });
});

describe("the key", () => {
  it.each([0, 1, 31, 33, 64])("refuses a key of %i bytes", (length) => {
    expect(() =>
      keyedDigest(new Uint8Array(length), bucket("p", "k", "s")),
    ).toThrow(DigestKeyError);
  });

  it.each([
    ["text of thirty-two characters", "a".repeat(32)],
    ["text of thirty-two multi-byte characters", "\u00e9".repeat(32)],
    ["a list of thirty-two numbers", Array.from({ length: 32 }, () => 0)],
    ["an array buffer of thirty-two bytes", new ArrayBuffer(32)],
    ["sixteen-bit units, thirty-two of them", new Uint16Array(32)],
    ["a length alone", { length: 32 }],
    ["nothing", undefined],
    ["null", null],
  ])("refuses %s, which is not thirty-two bytes", (_label, key) => {
    expect(() =>
      keyedDigest(key as unknown as Uint8Array, bucket("p", "k", "s")),
    ).toThrow(DigestKeyError);
  });

  it("accepts a Buffer of thirty-two bytes, which is the reader's key, as the same bytes", () => {
    expect(keyedDigest(Buffer.from(FAKE_KEY), bucket("p", "k", "s"))).toBe(
      keyedDigest(FAKE_KEY, bucket("p", "k", "s")),
    );
  });

  it("answers sixty-four lowercase hexadecimal characters, and another for another key", () => {
    const one = keyedDigest(FAKE_KEY, bucket("p", "k", "s"));
    const other = keyedDigest(
      new Uint8Array(DIGEST_KEY_BYTES),
      bucket("p", "k", "s"),
    );

    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(other).toMatch(/^[0-9a-f]{64}$/);
    expect(other).not.toBe(one);
  });
});

describe("equal keys only for equal parts", () => {
  const MARKED = fc.string({
    unit: fc.constantFrom(
      "0",
      "1",
      "2",
      ":",
      ",",
      "a",
      "\u00e9",
      "\ud83d\ude00",
    ),
    maxLength: 8,
  });
  const NUMBER_OF_RUNS = 400;
  const SEED = 8_062_026;

  it("gives equal encodings and digests only for equal tuples, over text holding the encoding's own marks", () => {
    let distinctPairs = 0;
    fc.assert(
      fc.property(
        fc.tuple(MARKED, MARKED, MARKED),
        fc.tuple(MARKED, MARKED, MARKED),
        (one, other) => {
          const isSameTuple = one.every((part, index) => part === other[index]);
          if (!isSameTuple) distinctPairs += 1;
          const a = bucket(...one);
          const b = bucket(...other);

          expect(encodeDigestInput(a) === encodeDigestInput(b)).toBe(
            isSameTuple,
          );
          expect(keyedDigest(FAKE_KEY, a) === keyedDigest(FAKE_KEY, b)).toBe(
            isSameTuple,
          );
        },
      ),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(distinctPairs).toBeGreaterThan(NUMBER_OF_RUNS / 2);
  });

  it("gives different encodings for the same characters split between the parts differently", () => {
    let splitsCompared = 0;
    fc.assert(
      fc.property(
        MARKED,
        fc.nat(8),
        fc.nat(8),
        fc.nat(8),
        fc.nat(8),
        (text, a1, a2, b1, b2) => {
          const split = (x: number, y: number): [string, string, string] => {
            const [low, high] = x <= y ? [x, y] : [y, x];
            const chars = Array.from(text);
            return [
              chars.slice(0, low).join(""),
              chars.slice(low, high).join(""),
              chars.slice(high).join(""),
            ];
          };
          const one = split(a1, a2);
          const other = split(b1, b2);
          const isSameTuple = one.every((part, index) => part === other[index]);
          if (!isSameTuple) splitsCompared += 1;

          expect(
            encodeDigestInput(bucket(...one)) ===
              encodeDigestInput(bucket(...other)),
          ).toBe(isSameTuple);
        },
      ),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(splitsCompared).toBeGreaterThan(NUMBER_OF_RUNS / 4);
  });

  it("keeps a part from moving across the boundary of its neighbour", () => {
    expect(encodeDigestInput(bucket("ab", "c", "d"))).not.toBe(
      encodeDigestInput(bucket("a", "bc", "d")),
    );
    expect(encodeDigestInput(bucket("1:a,", "c", "d"))).not.toBe(
      encodeDigestInput(bucket("1", "a,1:c", "d")),
    );
  });
});

describe("keyed-digest.ts", () => {
  const source = readSource("lib/server/digest/keyed-digest.ts");

  it("reads source: has no server-only import, so the e2e harness can import the same function", () => {
    expect(source).not.toMatch(/server-only/);
  });

  it("reads source: names neither the process environment nor the build mode", () => {
    expect(source).not.toMatch(/process\.env|NODE_ENV/);
  });
});
