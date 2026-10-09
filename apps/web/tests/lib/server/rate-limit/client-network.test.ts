import { fc } from "@fast-check/vitest";
import { isIP } from "node:net";
import { describe, expect, it } from "vitest";

import {
  blockOfAddress,
  SHARED_BLOCK,
  type NetworkBlock,
} from "@/lib/server/rate-limit/client-network";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

const SEED = 8_062_026;
const NUMBER_OF_RUNS = 500;
const MIN_PER_ARM = 100;

const SHARED: NetworkBlock = { kind: "shared", subject: "" };
const IPV4 = (subject: string): NetworkBlock => ({
  kind: "ipv4-block",
  subject,
});
const IPV6 = (subject: string): NetworkBlock => ({
  kind: "ipv6-block",
  subject,
});

describe("blockOfAddress: the truth table", () => {
  const ROWS: readonly [string, string | null | undefined, NetworkBlock][] = [
    ["a documentation IPv4 address", "192.0.2.77", IPV4("192.0.2")],
    ["another host of the same /24", "192.0.2.1", IPV4("192.0.2")],
    ["a host of the next /24", "192.0.3.1", IPV4("192.0.3")],
    ["the lowest and highest octets", "0.0.0.0", IPV4("0.0.0")],
    ["the highest octets", "255.255.255.255", IPV4("255.255.255")],
    [
      "a documentation IPv6 address",
      "2001:db8::1",
      IPV6("2001:0db8:0000:0000"),
    ],
    [
      "the same /64 spelled in full and in capitals",
      "2001:0DB8:0000:0000:ffff:ffff:ffff:ffff",
      IPV6("2001:0db8:0000:0000"),
    ],
    [
      "an IPv6 address of another /64",
      "2001:db8:0:1::1",
      IPV6("2001:0db8:0000:0001"),
    ],
    ["the unspecified address", "::", IPV6("0000:0000:0000:0000")],
    ["the loopback address", "::1", IPV6("0000:0000:0000:0000")],
    ["a mapped IPv4 address, dotted", "::ffff:192.0.2.77", IPV4("192.0.2")],
    [
      "a mapped IPv4 address, in hexadecimal",
      "::ffff:c000:24d",
      IPV4("192.0.2"),
    ],
    [
      "a mapped IPv4 address, spelled in full",
      "0:0:0:0:0:ffff:c000:24d",
      IPV4("192.0.2"),
    ],
    ["a mapped IPv4 address in capitals", "::FFFF:192.0.2.77", IPV4("192.0.2")],
    [
      "an address that is not mapped: another 16 bits",
      "::fffe:192.0.2.77",
      IPV6("0000:0000:0000:0000"),
    ],
    [
      "an address that is not mapped: a bit set above the 80th",
      "1::ffff:192.0.2.77",
      IPV6("0001:0000:0000:0000"),
    ],
    ["a list of two addresses", "192.0.2.1, 198.51.100.1", SHARED],
    ["a list without a space", "192.0.2.1,198.51.100.1", SHARED],
    ["a list of IPv6 addresses", "2001:db8::1, 2001:db8::2", SHARED],
    ["a port on IPv4", "192.0.2.1:443", SHARED],
    ["a bracketed IPv6 address with a port", "[2001:db8::1]:443", SHARED],
    ["a bracketed IPv6 address", "[2001:db8::1]", SHARED],
    ["a zone id", "fe80::1%eth0", SHARED],
    ["a numeric zone id", "fe80::1%1", SHARED],
    ["a leading zero in an octet", "192.0.02.1", SHARED],
    ["a leading zero in the first octet", "010.0.0.1", SHARED],
    ["a leading zero in a mapped octet", "::ffff:192.0.02.1", SHARED],
    ["a leading space", " 192.0.2.1", SHARED],
    ["a trailing space", "192.0.2.1 ", SHARED],
    ["a trailing line break", "192.0.2.1\n", SHARED],
    ["a tab", "192.0.2.1\t", SHARED],
    ["an octet over 255", "192.0.2.256", SHARED],
    ["three octets", "192.0.2", SHARED],
    ["five octets", "192.0.2.1.1", SHARED],
    ["a trailing dot", "192.0.2.1.", SHARED],
    ["a hostname", "example.com", SHARED],
    ["a decimal integer", "3221225985", SHARED],
    ["a hexadecimal octet", "0xc0.0.2.1", SHARED],
    ["two compressions", "2001::db8::1", SHARED],
    ["three colons", ":::", SHARED],
    ["a lone colon at the start", ":1:2:3:4:5:6:7", SHARED],
    ["a lone colon at the end", "1:2:3:4:5:6:7:", SHARED],
    ["nine groups", "1:2:3:4:5:6:7:8:9", SHARED],
    ["eight groups beside a compression", "1:2:3:4:5:6:7::8", SHARED],
    ["a group of five digits", "2001:db8::12345", SHARED],
    ["an embedded IPv4 address in the middle", "::1.2.3.4:5", SHARED],
    ["an empty string", "", SHARED],
    ["nothing", null, SHARED],
    ["undefined", undefined, SHARED],
    ["text longer than any address", `2001:db8::${"1".repeat(60)}`, SHARED],
  ];

  it.each(ROWS)("answers for %s", (_label, text, expected) => {
    expect(blockOfAddress(text)).toEqual(expected);
  });

  it("answers the shared block as one frozen value with an empty subject", () => {
    expect(SHARED_BLOCK).toEqual(SHARED);
    expect(Object.isFrozen(SHARED_BLOCK)).toBe(true);
  });
});

function octetsArbitrary() {
  return fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255));
}

function groupsArbitrary() {
  return fc.array(fc.nat(0xffff), { minLength: 8, maxLength: 8 });
}

type Octets = readonly [number, number, number, number];

const dotted = (octets: Octets): string => octets.join(".");

describe("blockOfAddress: IPv4 shares a block exactly when the first 24 bits agree", () => {
  const arms = { sameBlock: 0, thirdOctetFlipped: 0, firstOctetFlipped: 0 };

  it("holds over generated pairs, with a floor on each arm", () => {
    fc.assert(
      fc.property(
        octetsArbitrary(),
        fc.nat(255),
        fc.nat(7),
        (octets, lastOctet, bit) => {
          const [a, b, c] = octets;
          const sameBlock: Octets = [a, b, c, lastOctet];
          const thirdOctetFlipped: Octets = [a, b, c ^ (1 << bit), lastOctet];
          const firstOctetFlipped: Octets = [a ^ (1 << bit), b, c, lastOctet];
          const base = blockOfAddress(dotted(octets));
          arms.sameBlock += 1;
          arms.thirdOctetFlipped += 1;
          arms.firstOctetFlipped += 1;

          expect(blockOfAddress(dotted(sameBlock))).toEqual(base);
          expect(blockOfAddress(dotted(thirdOctetFlipped))).not.toEqual(base);
          expect(blockOfAddress(dotted(firstOctetFlipped))).not.toEqual(base);
        },
      ),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(Object.values(arms).every((count) => count >= MIN_PER_ARM)).toBe(
      true,
    );
  });

  it("makes the subject from the three octets alone", () => {
    fc.assert(
      fc.property(octetsArbitrary(), (octets) => {
        const [a, b, c] = octets;

        expect(blockOfAddress(dotted(octets))).toEqual(
          IPV4(`${String(a)}.${String(b)}.${String(c)}`),
        );
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );
  });
});

/** The ways one IPv6 address can be written, each built from the eight groups and never from another spelling. */
function spellingsOf(groups: readonly number[]): readonly string[] {
  const padded = groups.map((group) => group.toString(16).padStart(4, "0"));
  const bare = groups.map((group) => group.toString(16));
  return [
    padded.join(":"),
    bare.join(":"),
    bare.join(":").toUpperCase(),
    compressed(bare),
  ];
}

function compressed(groups: readonly string[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < groups.length; start += 1) {
    let length = 0;
    while (groups[start + length] === "0") length += 1;
    if (length > bestLength) [bestStart, bestLength] = [start, length];
  }
  if (bestLength < 2) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

describe("blockOfAddress: IPv6 shares a block exactly when the first 64 bits agree", () => {
  it("holds over generated pairs, each in every spelling, with a floor on each arm", () => {
    const arms = {
      sameBlock: 0,
      bitOfFourthGroupFlipped: 0,
      bitOfFifthGroupFlipped: 0,
      spellings: 0,
    };
    fc.assert(
      fc.property(
        groupsArbitrary(),
        groupsArbitrary(),
        fc.nat(15),
        (groups, others, bit) => {
          const sameBlock = [...groups.slice(0, 4), ...others.slice(4)];
          const fourthFlipped = groups.map((group, index) =>
            index === 3 ? group ^ (1 << bit) : group,
          );
          const fifthFlipped = groups.map((group, index) =>
            index === 4 ? group ^ (1 << bit) : group,
          );
          const [first = "", ...rest] = spellingsOf(groups);
          const base = blockOfAddress(first);
          arms.sameBlock += 1;
          arms.bitOfFourthGroupFlipped += 1;
          arms.bitOfFifthGroupFlipped += 1;
          arms.spellings += rest.length;

          for (const spelling of rest)
            expect(blockOfAddress(spelling)).toEqual(base);
          for (const spelling of spellingsOf(sameBlock))
            expect(blockOfAddress(spelling)).toEqual(base);
          for (const spelling of spellingsOf(fifthFlipped))
            expect(blockOfAddress(spelling)).toEqual(base);
          for (const spelling of spellingsOf(fourthFlipped))
            expect(blockOfAddress(spelling)).not.toEqual(base);
        },
      ),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(Object.values(arms).every((count) => count >= MIN_PER_ARM)).toBe(
      true,
    );
  });

  it("makes the subject from four groups of four lowercase digits, whatever the spelling", () => {
    fc.assert(
      fc.property(groupsArbitrary(), (groups) => {
        const first4 = groups
          .slice(0, 4)
          .map((group) => group.toString(16).padStart(4, "0"));
        const isMapped =
          groups.slice(0, 5).every((group) => group === 0) &&
          groups[5] === 0xffff;
        if (isMapped) return;

        for (const spelling of spellingsOf(groups)) {
          expect(blockOfAddress(spelling)).toEqual(IPV6(first4.join(":")));
        }
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );
  });
});

describe("blockOfAddress: an IPv4-mapped IPv6 address is in its IPv4 block", () => {
  it("holds in every spelling, over generated addresses", () => {
    const counted = { spellings: 0 };
    fc.assert(
      fc.property(octetsArbitrary(), (octets) => {
        const [a, b, c, d] = octets;
        const high = (a * 256 + b).toString(16);
        const low = (c * 256 + d).toString(16);
        const expected = blockOfAddress(dotted(octets));
        const spellings = [
          `::ffff:${dotted(octets)}`,
          `::FFFF:${dotted(octets)}`,
          `0:0:0:0:0:ffff:${dotted(octets)}`,
          `::ffff:${high}:${low}`,
          `0000:0000:0000:0000:0000:ffff:${high.padStart(4, "0")}:${low.padStart(4, "0")}`,
        ];
        counted.spellings += spellings.length;

        for (const spelling of spellings)
          expect(blockOfAddress(spelling)).toEqual(expected);
      }),
      { numRuns: NUMBER_OF_RUNS, seed: SEED },
    );

    expect(counted.spellings).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });
});

describe("blockOfAddress: agrees with the platform's own parser on what is one address", () => {
  const ALPHABET = fc.constantFrom(
    ..."0123456789abcdefABCDEF:.%[], \t-".split(""),
  );
  const NOT_AN_ADDRESS_BY_RULE = (text: string): boolean => text.includes("%");

  function acceptedByPlatform(text: string): boolean {
    return isIP(text) !== 0 && !NOT_AN_ADDRESS_BY_RULE(text);
  }

  function mutations(text: string): string[] {
    return [
      text.slice(1),
      text.slice(0, -1),
      `${text}0`,
      `0${text}`,
      text.replace(/\d/, "00"),
      text.replace(":", "::"),
      text.replace(".", ".."),
      ` ${text}`,
    ];
  }

  it("accepts and refuses exactly as net.isIP does, minus a zone, over strings made of an address's own marks", () => {
    const seen = { accepted: 0, refused: 0 };
    fc.assert(
      fc.property(
        fc.string({ unit: ALPHABET, minLength: 1, maxLength: 24 }),
        (text) => {
          const isAccepted = blockOfAddress(text).kind !== "shared";
          seen[isAccepted ? "accepted" : "refused"] += 1;

          expect(isAccepted).toBe(acceptedByPlatform(text));
        },
      ),
      { numRuns: 3000, seed: SEED },
    );

    expect(seen.refused).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });

  it("agrees on valid addresses and their one-character mutations, with a floor on each arm", () => {
    const seen = { valid: 0, mutated: 0, mutatedAccepted: 0 };
    fc.assert(
      fc.property(groupsArbitrary(), octetsArbitrary(), (groups, octets) => {
        const bases = [
          ...spellingsOf(groups),
          dotted(octets),
          `::ffff:${dotted(octets)}`,
        ];
        for (const base of bases) {
          seen.valid += 1;
          expect(blockOfAddress(base).kind !== "shared").toBe(
            acceptedByPlatform(base),
          );
          for (const mutated of mutations(base)) {
            seen.mutated += 1;
            const isAccepted = blockOfAddress(mutated).kind !== "shared";
            if (isAccepted) seen.mutatedAccepted += 1;
            expect(isAccepted).toBe(acceptedByPlatform(mutated));
          }
        }
      }),
      { numRuns: 300, seed: SEED },
    );

    expect(seen.valid).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(seen.mutated).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });
});

describe("client-network.ts", () => {
  it("reads source: names neither the process environment nor the build mode, and has no server-only import", () => {
    const source = readSource("lib/server/rate-limit/client-network.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(/server-only/);
  });
});
