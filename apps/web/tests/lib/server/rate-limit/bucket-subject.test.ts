import { fc } from "@fast-check/vitest";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  BucketSubjectError,
  isMadeSubject,
  subjectOfNetworkBlock,
  subjectOfWriteCredentialHash,
  WRITE_CREDENTIAL_KIND,
} from "@/lib/server/rate-limit/bucket-subject";
import {
  blockOfAddress,
  type NetworkBlock,
  type NetworkBlockKind,
} from "@/lib/server/rate-limit/client-network";

import { readSource, sourceFilesMatching } from "../server-source-support";

const SEED = 10_102_027;
const NUMBER_OF_RUNS = 1000;
const MIN_PER_ARM = 100;

const A_CREDENTIAL_HASH = sha256Hex("a write credential");
const NETWORK_KINDS: readonly NetworkBlockKind[] = [
  "ipv4-block",
  "ipv6-block",
  "shared",
];

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function block(kind: NetworkBlockKind, subject: string): NetworkBlock {
  return { kind, subject };
}

function isRefusedAs(attempt: () => unknown, kind: string): boolean {
  try {
    attempt();
  } catch (thrown) {
    return thrown instanceof BucketSubjectError && thrown.kind === kind;
  }
  return false;
}

describe("subjectOfNetworkBlock: the text an address's parsed bits make", () => {
  it.each([
    ["the lowest IPv4 block", block("ipv4-block", "0.0.0")],
    ["a documentation IPv4 block", block("ipv4-block", "192.0.2")],
    ["the highest IPv4 block", block("ipv4-block", "255.255.255")],
    ["a documentation IPv6 block", block("ipv6-block", "2001:0db8:0000:0042")],
    ["the all-zero IPv6 block", block("ipv6-block", "0000:0000:0000:0000")],
    ["the shared bucket", block("shared", "")],
  ])("accepts %s, as the kind and the text it was handed", (_label, given) => {
    const subject = subjectOfNetworkBlock(given);

    expect(subject.kind).toBe(given.kind);
    expect(subject.subject).toBe(given.subject);
  });

  it.each([
    [
      "four octets, an address and not a block",
      block("ipv4-block", "192.0.2.77"),
    ],
    ["two octets", block("ipv4-block", "192.0")],
    ["an octet above 255", block("ipv4-block", "256.0.0")],
    ["a leading zero", block("ipv4-block", "01.0.0")],
    ["a space before it", block("ipv4-block", " 192.0.2")],
    ["a line break after it", block("ipv4-block", "192.0.2\n")],
    ["nothing, for an IPv4 block", block("ipv4-block", "")],
    ["uppercase hexadecimal", block("ipv6-block", "2001:0DB8:0000:0042")],
    ["short groups", block("ipv6-block", "2001:db8:0:42")],
    ["five groups", block("ipv6-block", "2001:0db8:0000:0042:0000")],
    ["a compressed group run", block("ipv6-block", "2001:0db8::")],
    [
      "an IPv4 block's text under the IPv6 kind",
      block("ipv6-block", "192.0.2"),
    ],
    [
      "an IPv6 block's text under the IPv4 kind",
      block("ipv4-block", "2001:0db8:0000:0042"),
    ],
    ["a text for the shared bucket", block("shared", "192.0.2")],
    ["a design's id under the shared kind", block("shared", "design 1")],
    [
      "a kind that is not one of three",
      block("write-credential" as NetworkBlockKind, A_CREDENTIAL_HASH),
    ],
  ])("refuses %s", (_label, given) => {
    expect(isRefusedAs(() => subjectOfNetworkBlock(given), given.kind)).toBe(
      true,
    );
  });

  it("refuses a subject that is not text", () => {
    const notText = block("shared", 0 as unknown as string);

    expect(() => subjectOfNetworkBlock(notText)).toThrow(BucketSubjectError);
  });
});

describe("subjectOfWriteCredentialHash: only a credential's hash", () => {
  it("accepts sixty-four lowercase hexadecimal characters under a kind of its own", () => {
    const subject = subjectOfWriteCredentialHash(A_CREDENTIAL_HASH);

    expect(subject.kind).toBe(WRITE_CREDENTIAL_KIND);
    expect(subject.subject).toBe(A_CREDENTIAL_HASH);
  });

  it.each([
    ["a design's id", "design 1"],
    ["a generated design id", "k3J9xQ2mT7vWcN4pRz8LbA"],
    ["a visitor's value", "visitor-4f1c0a9e"],
    ["a share's token", "S".repeat(43)],
    ["nothing", ""],
    ["the credential itself, which is not a hash", "w".repeat(64)],
    ["a hash of 63 characters", A_CREDENTIAL_HASH.slice(1)],
    ["a hash of 65 characters", `${A_CREDENTIAL_HASH}0`],
    ["a hash in uppercase", A_CREDENTIAL_HASH.toUpperCase()],
    ["a hash with a space before it", ` ${A_CREDENTIAL_HASH.slice(1)}`],
    ["a hash with a line break after it", `${A_CREDENTIAL_HASH}\n`],
    [
      "a hash with a character that is not hexadecimal",
      `g${A_CREDENTIAL_HASH.slice(1)}`,
    ],
  ])("refuses %s", (_label, text) => {
    expect(
      isRefusedAs(
        () => subjectOfWriteCredentialHash(text),
        WRITE_CREDENTIAL_KIND,
      ),
    ).toBe(true);
  });

  it.each([
    ["a list holding a hash", [A_CREDENTIAL_HASH]],
    ["an object whose text is a hash", { toString: () => A_CREDENTIAL_HASH }],
    ["a number", 1],
    ["nothing", undefined],
    ["null", null],
  ])(
    "refuses %s, which is not a string, before its pattern is asked",
    (_label, given) => {
      expect(
        isRefusedAs(
          () => subjectOfWriteCredentialHash(given as string),
          WRITE_CREDENTIAL_KIND,
        ),
      ).toBe(true);
    },
  );

  it("keeps the credential's kind apart from the three a network block has", () => {
    expect(NETWORK_KINDS).not.toContain(WRITE_CREDENTIAL_KIND);
  });
});

describe("a subject", () => {
  it("is frozen and holds a kind and a text only", () => {
    const subject = subjectOfNetworkBlock(block("ipv4-block", "192.0.2"));

    expect(Object.isFrozen(subject)).toBe(true);
    expect(Reflect.ownKeys(subject)).toEqual(["kind", "subject"]);
  });

  it("is refused with the kind named and none of the text", () => {
    const hostile = "HOSTILE-TEXT-MARKER-7741";
    let thrown: unknown;
    try {
      subjectOfWriteCredentialHash(hostile);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BucketSubjectError);
    expect((thrown as Error).message).toContain(WRITE_CREDENTIAL_KIND);
    expect(JSON.stringify(thrown)).not.toContain("MARKER");
    expect((thrown as Error).message).not.toContain("MARKER");
  });
});

describe("isMadeSubject: what a constructor made, by identity", () => {
  const MADE = [
    subjectOfNetworkBlock(block("ipv4-block", "192.0.2")),
    subjectOfNetworkBlock(block("shared", "")),
    subjectOfWriteCredentialHash(A_CREDENTIAL_HASH),
  ];

  it("knows each subject a constructor made", () => {
    expect(MADE.map((subject) => isMadeSubject(subject))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it.each([
    ["a spread copy", { ...MADE[0] }],
    ["a copy that went through JSON", JSON.parse(JSON.stringify(MADE[2]))],
    [
      "a literal of the same kind and text",
      { kind: "ipv4-block", subject: "192.0.2" },
    ],
    [
      "an object that inherits from a made subject",
      Object.create(MADE[0] as object) as object,
    ],
    ["text", "192.0.2"],
    ["nothing", undefined],
    ["null", null],
  ])("does not know %s", (_label, candidate) => {
    expect(isMadeSubject(candidate)).toBe(false);
  });
});

describe("what text becomes a subject: only a credential's hash or an address's parsed bits", () => {
  const ALPHABET = "0123456789abcdefABCDEF:.- _\né\ud83d";
  const randomText = fc.string({
    unit: fc.constantFrom(...Array.from(ALPHABET)),
    maxLength: 70,
  });
  const aHashOfSomeToken = fc
    .uint8Array({ minLength: 0, maxLength: 40 })
    .map((bytes) => sha256Hex(Buffer.from(bytes).toString("latin1")));
  const aHashMutatedOnce = aHashOfSomeToken.chain((hash) =>
    fc.constantFrom(
      hash.slice(1),
      `${hash}0`,
      hash.toUpperCase(),
      `${hash.slice(0, 63)}g`,
      ` ${hash.slice(1)}`,
      `${hash}\n`,
      "",
    ),
  );

  /** The hexadecimal decoding, as Node reads it, written back: text is a lowercase digest of 32 bytes exactly when
   *  it survives the trip. This does not share the module's pattern. */
  function isThirtyTwoBytesInLowercaseHex(text: string): boolean {
    return (
      text.length === 64 && Buffer.from(text, "hex").toString("hex") === text
    );
  }

  function isAcceptedAsCredential(text: string): boolean {
    try {
      subjectOfWriteCredentialHash(text);
      return true;
    } catch {
      return false;
    }
  }

  it("accepts text for a credential exactly when it is a lowercase digest, with a floor on each arm", () => {
    const seen = { accepted: 0, refused: 0 };
    fc.assert(
      fc.property(
        fc.oneof(randomText, aHashOfSomeToken, aHashMutatedOnce),
        (text) => {
          const isAccepted = isAcceptedAsCredential(text);

          expect(isAccepted).toBe(isThirtyTwoBytesInLowercaseHex(text));
          seen[isAccepted ? "accepted" : "refused"] += 1;
        },
      ),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(seen.accepted).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(seen.refused).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });

  it("accepts the hash of any credential and refuses the credential itself, whatever the credential is", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (credential) => {
        expect(isAcceptedAsCredential(sha256Hex(credential))).toBe(true);
        expect(isAcceptedAsCredential(credential)).toBe(
          isThirtyTwoBytesInLowercaseHex(credential),
        );
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );
  });

  const octet = fc.integer({ min: 0, max: 255 });
  const group = fc.integer({ min: 0, max: 0xffff });
  const anIpv4Block = fc
    .tuple(octet, octet, octet, octet)
    .map((octets) => blockOfAddress(octets.join(".")));
  const anIpv6Block = fc
    .tuple(group, group, group, group, group, group, group, group)
    .map((groups) =>
      blockOfAddress(groups.map((g) => g.toString(16)).join(":")),
    )
    .filter((parsed) => parsed.kind === "ipv6-block");
  const aParsedBlock = fc.oneof(anIpv4Block, anIpv6Block);

  /** The parser is the only maker of a block: text is a block's exactly when the parser, handed an address that ends in
   *  that text, answers the same kind and the same text. */
  function isMadeByTheParser({ kind, subject }: NetworkBlock): boolean {
    const completed: Record<NetworkBlockKind, string | undefined> = {
      "ipv4-block": `${subject}.0`,
      "ipv6-block": `${subject}:0:0:0:0`,
      shared: undefined,
    };
    const address = completed[kind];
    if (address === undefined) return subject === "";
    const parsed = blockOfAddress(address);
    return parsed.kind === kind && parsed.subject === subject;
  }

  function isAcceptedAsBlock(given: NetworkBlock): boolean {
    try {
      subjectOfNetworkBlock(given);
      return true;
    } catch {
      return false;
    }
  }

  it("accepts text for a block exactly when the address parser could have made it, with a floor on each arm", () => {
    const seen = { accepted: 0, refused: 0 };
    const aBlockWithAnyText = fc.record({
      kind: fc.constantFrom(...NETWORK_KINDS),
      subject: fc.oneof(
        randomText,
        aParsedBlock.map((parsed) => parsed.subject),
        aParsedBlock.map((parsed) => parsed.subject.slice(1)),
        aParsedBlock.map((parsed) => parsed.subject.toUpperCase()),
        aParsedBlock.map((parsed) => ` ${parsed.subject}`),
      ),
    });
    fc.assert(
      fc.property(fc.oneof(aParsedBlock, aBlockWithAnyText), (given) => {
        const isAccepted = isAcceptedAsBlock(given);

        expect(isAccepted).toBe(isMadeByTheParser(given));
        seen[isAccepted ? "accepted" : "refused"] += 1;
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(seen.accepted).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(seen.refused).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });

  it("refuses a block's text as a credential and a hash as a block, never mixing the two", () => {
    fc.assert(
      fc.property(aParsedBlock, (parsed) => {
        expect(isAcceptedAsCredential(parsed.subject)).toBe(false);
        for (const kind of NETWORK_KINDS) {
          const crossed = block(kind, A_CREDENTIAL_HASH);
          expect(isAcceptedAsBlock(crossed)).toBe(false);
        }
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );
  });

  it("gives a hash from random bytes to the credential's constructor and never to a block's", () => {
    const hash = randomBytes(32).toString("hex");

    expect(isAcceptedAsCredential(hash)).toBe(true);
    expect(
      NETWORK_KINDS.some((kind) => isAcceptedAsBlock(block(kind, hash))),
    ).toBe(false);
  });
});

describe("bucket-subject.ts", () => {
  const SOURCE_FILE = "lib/server/rate-limit/bucket-subject.ts";

  function callersOf(constructorName: string): string[] {
    return sourceFilesMatching(new RegExp(`${constructorName}\\(`)).filter(
      (path) => path !== SOURCE_FILE,
    );
  }

  it("reads source: exports the two constructors and the question of what they made, and no third maker", () => {
    const exportedFunctions = [
      ...readSource(SOURCE_FILE).matchAll(/^export function (\w+)\(/gm),
    ].map((match) => match[1]);

    expect(exportedFunctions).toEqual([
      "subjectOfNetworkBlock",
      "subjectOfWriteCredentialHash",
      "isMadeSubject",
    ]);
  });

  it("reads source: no other module under src makes a subject by a cast or names the credential's kind", () => {
    const makers = sourceFilesMatching(
      /as BucketSubject|MADE_BY_A_CONSTRUCTOR|WRITE_CREDENTIAL_KIND|"write-credential"/,
    );

    expect(makers).toEqual([SOURCE_FILE]);
  });

  it("reads source: only the block judge hands a block to its constructor, and it hands the parsed network's", () => {
    expect(callersOf("subjectOfNetworkBlock")).toEqual([
      "lib/server/rate-limit/judge-block-bucket.ts",
    ]);
    expect(readSource("lib/server/rate-limit/judge-block-bucket.ts")).toMatch(
      /subjectOfNetworkBlock\(\s*network\.block\s*\)/,
    );
  });

  it("reads source: only the save's judge makes a credential's subject, and from the hash the route read", () => {
    expect(callersOf("subjectOfWriteCredentialHash")).toEqual([
      "lib/server/rate-limit/judge-save-request.ts",
    ]);
    expect(readSource("lib/server/rate-limit/judge-save-request.ts")).toMatch(
      /subjectOfWriteCredentialHash\(\s*writeTokenHash\s*\)/,
    );
  });

  it("reads source: the evaluator takes a key's subject kind and text from the subject it is handed alone", () => {
    const evaluator = readSource("lib/server/rate-limit/enforce-rate-limit.ts");

    expect(evaluator).toMatch(/subjectKind:\s*subject\.kind/);
    expect(evaluator).toMatch(/subject:\s*subject\.subject/);
    expect(evaluator.match(/subjectKind:/g)).toHaveLength(1);
  });
});
