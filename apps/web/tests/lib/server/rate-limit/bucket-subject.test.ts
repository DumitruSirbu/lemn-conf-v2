import { fc } from "@fast-check/vitest";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_KIND,
  ADDRESS_KIND,
  BucketSubjectError,
  isMadeSubject,
  STORED_REQUEST_KIND,
  subjectOfAccountId,
  subjectOfAddress,
  subjectOfNetworkBlock,
  subjectOfStoredRequest,
  subjectOfVisitorHash,
  subjectOfWriteCredentialHash,
  VISITOR_KIND,
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
    subjectOfVisitorHash(A_CREDENTIAL_HASH),
    subjectOfAddress("ana@example.com"),
    subjectOfStoredRequest("0123456789abcdef"),
  ];

  it("knows each subject a constructor made", () => {
    expect(MADE.map((subject) => isMadeSubject(subject))).toEqual(
      MADE.map(() => true),
    );
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

describe("subjectOfVisitorHash: sixty-four hexadecimal characters and nothing else", () => {
  it("accepts a lowercase digest under a kind of its own", () => {
    const subject = subjectOfVisitorHash(A_CREDENTIAL_HASH);

    expect(subject.kind).toBe(VISITOR_KIND);
    expect(subject.subject).toBe(A_CREDENTIAL_HASH);
  });

  it.each([
    ["the visitor's own value, which is not a hash", "a".repeat(43)],
    ["a design's id", "k3J9xQ2mT7vWcN4pRz8LbA"],
    ["nothing", ""],
    ["sixty-three characters", A_CREDENTIAL_HASH.slice(1)],
    ["sixty-five characters", `${A_CREDENTIAL_HASH}0`],
    ["a digest in upper case", A_CREDENTIAL_HASH.toUpperCase()],
    ["a digest with a line break after it", `${A_CREDENTIAL_HASH}\n`],
    ["an address", "ana@example.com"],
  ])("refuses %s, naming the kind and none of the text", (_label, text) => {
    expect(isRefusedAs(() => subjectOfVisitorHash(text), VISITOR_KIND)).toBe(
      true,
    );
  });

  it("refuses what is not text, and never shares a kind with the credential's hash", () => {
    expect(
      isRefusedAs(
        () => subjectOfVisitorHash(42 as unknown as string),
        VISITOR_KIND,
      ),
    ).toBe(true);
    expect(VISITOR_KIND).not.toBe(WRITE_CREDENTIAL_KIND);
  });
});

describe("subjectOfAddress: an address in its counted form and nothing else", () => {
  it.each(["ana@example.com", "ana+shop@example.com", "a.na@mail.example.com"])(
    "accepts %s under a kind of its own",
    (address) => {
      const subject = subjectOfAddress(address);

      expect(subject.kind).toBe(ADDRESS_KIND);
      expect(subject.subject).toBe(address);
    },
  );

  it.each([
    [
      "an address with a capital, which is not the counted form",
      "Ana@example.com",
    ],
    ["nothing", ""],
    ["text that is no address", "not an address"],
    ["a line break after it", "ana@example.com\n"],
    ["two addresses", "a@example.com,b@example.com"],
    ["a hash", A_CREDENTIAL_HASH],
    ["a design id", "k3J9xQ2mT7vWcN4pRz8LbA"],
  ])("refuses %s", (_label, text) => {
    expect(isRefusedAs(() => subjectOfAddress(text), ADDRESS_KIND)).toBe(true);
  });

  it("holds none of the refused text in its refusal", () => {
    let refusal: unknown;
    try {
      subjectOfAddress("ADDRESS-MARKER-7");
    } catch (thrown) {
      refusal = thrown;
    }

    expect(refusal).toBeInstanceOf(BucketSubjectError);
    expect((refusal as Error).message).not.toContain("MARKER");
  });
});

describe("subjectOfStoredRequest: the shape of a request's id and nothing else", () => {
  it.each(["0123456789abcdef", "a".repeat(64), "A_b-C_d-E_f-G_h-"])(
    "accepts %s under a kind of its own",
    (id) => {
      const subject = subjectOfStoredRequest(id);

      expect(subject.kind).toBe(STORED_REQUEST_KIND);
      expect(subject.subject).toBe(id);
    },
  );

  it.each([
    ["fifteen characters", "a".repeat(15)],
    ["sixty-five characters", "a".repeat(65)],
    ["a space", "0123456789abcde f"],
    ["an address", "ana@example.com"],
    ["nothing", ""],
  ])("refuses %s", (_label, text) => {
    expect(
      isRefusedAs(() => subjectOfStoredRequest(text), STORED_REQUEST_KIND),
    ).toBe(true);
  });
});

describe("an account's id as a subject", () => {
  const AN_ACCOUNT_ID = "A1b2C3d4E5f6G7h8I9j0_";

  it.each([AN_ACCOUNT_ID, "-".repeat(21), "_".repeat(21), "a".repeat(21)])(
    "accepts %s under a kind of its own",
    (id) => {
      const subject = subjectOfAccountId(id);

      expect(subject.kind).toBe(ACCOUNT_KIND);
      expect(subject.subject).toBe(id);
      expect(isMadeSubject(subject)).toBe(true);
    },
  );

  it.each([
    ["twenty characters", "a".repeat(20)],
    ["twenty-two characters", "a".repeat(22)],
    ["a space", `${"a".repeat(20)} `],
    ["a dot", `${"a".repeat(20)}.`],
    ["a line break at the end", `${"a".repeat(21)}\n`],
    ["a non-ASCII letter", `${"a".repeat(20)}\u00e9`],
    ["an address", "ana@example.com"],
    ["a hash", A_CREDENTIAL_HASH],
    ["nothing", ""],
    ["a number", 7 as never],
    ["null", null as never],
  ])("refuses %s", (_label, text) => {
    expect(isRefusedAs(() => subjectOfAccountId(text), ACCOUNT_KIND)).toBe(
      true,
    );
  });

  it("does not put the refused text in the error", () => {
    const refused = (() => {
      try {
        subjectOfAccountId("SECRET-TEXT-MARKER");
      } catch (failure) {
        return failure as Error;
      }
      return undefined;
    })();

    expect(refused?.message).not.toContain("SECRET");
  });
});

describe("the six kinds of subject keep every other's text out", () => {
  it("is six different kinds, whatever the text", () => {
    const kinds = [
      subjectOfNetworkBlock(block("ipv4-block", "192.0.2")).kind,
      subjectOfWriteCredentialHash(A_CREDENTIAL_HASH).kind,
      subjectOfVisitorHash(A_CREDENTIAL_HASH).kind,
      subjectOfAddress("ana@example.com").kind,
      subjectOfStoredRequest("0123456789abcdef").kind,
      subjectOfAccountId("a".repeat(21)).kind,
    ];

    expect(new Set(kinds).size).toBe(6);
  });

  it("keeps a design's id and an account's id of one text apart by their kind: the text alone cannot", () => {
    const sameText = "a".repeat(21);

    expect(subjectOfAccountId(sameText).subject).toBe(sameText);
    expect(subjectOfAccountId(sameText).kind).toBe(ACCOUNT_KIND);
    expect(subjectOfAccountId(sameText).kind).not.toBe(
      subjectOfStoredRequest(sameText).kind,
    );
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

  it("reads source: exports the six constructors and the question of what they made, and no seventh maker", () => {
    const exportedFunctions = [
      ...readSource(SOURCE_FILE).matchAll(/^export function (\w+)\(/gm),
    ].map((match) => match[1]);

    expect(exportedFunctions).toEqual([
      "subjectOfNetworkBlock",
      "subjectOfWriteCredentialHash",
      "subjectOfVisitorHash",
      "subjectOfAddress",
      "subjectOfStoredRequest",
      "subjectOfAccountId",
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

  it("reads source: only the save's judge makes a credential's subject, and from the hash the credential holds", () => {
    expect(callersOf("subjectOfWriteCredentialHash")).toEqual([
      "lib/server/rate-limit/judge-save-request.ts",
    ]);
    expect(readSource("lib/server/rate-limit/judge-save-request.ts")).toMatch(
      /subjectOfWriteCredentialHash\(\s*credential\.hash\s*\)/,
    );
  });

  it("reads source: only the save's judge and the account judge make an account's subject, each from an id the caller read from the session", () => {
    expect(callersOf("subjectOfAccountId").sort()).toEqual([
      "lib/server/rate-limit/judge-account-request.ts",
      "lib/server/rate-limit/judge-save-request.ts",
    ]);
    expect(readSource("lib/server/rate-limit/judge-save-request.ts")).toMatch(
      /subjectOfAccountId\(\s*credential\.accountId\s*\)/,
    );
    expect(
      readSource("lib/server/rate-limit/judge-account-request.ts"),
    ).toMatch(/subjectOfAccountId\(\s*accountId\s*\)/);
  });

  it("reads source: the evaluator takes a key's subject kind and text from the subject it is handed alone", () => {
    const evaluator = readSource("lib/server/rate-limit/enforce-rate-limit.ts");

    expect(evaluator).toMatch(/subjectKind:\s*subject\.kind/);
    expect(evaluator).toMatch(/subject:\s*subject\.subject/);
    expect(evaluator.match(/subjectKind:/g)).toHaveLength(1);
  });
});
