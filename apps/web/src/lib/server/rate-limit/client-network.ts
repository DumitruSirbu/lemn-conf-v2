/** One word for each kind of subject, so two alphabets need never be told apart. */
export type NetworkBlockKind = "ipv4-block" | "ipv6-block" | "shared";

/** A client's block: IPv4 by its first 24 bits, IPv6 by its first 64, or the one shared bucket. */
export interface NetworkBlock {
  readonly kind: NetworkBlockKind;
  /** Made from the parsed bits alone, never from the text that was parsed. Empty for the shared bucket. */
  readonly subject: string;
}

export const SHARED_BLOCK: NetworkBlock = Object.freeze({
  kind: "shared",
  subject: "",
});

const LONGEST_ADDRESS_TEXT = 45;
const IPV4_OCTETS = 4;
const IPV6_GROUPS = 8;
const IPV4_BLOCK_OCTETS = 3;
const IPV6_BLOCK_GROUPS = 4;
const HEX_GROUP_DIGITS = 4;
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/;
const DECIMAL_OCTET = /^(?:0|[1-9][0-9]{0,2})$/;
const ADDRESS_CHARACTERS = /^[0-9A-Fa-f:.]+$/;
const MAPPED_PREFIX_GROUPS = [0, 0, 0, 0, 0, 0xffff];

/**
 * Exactly one address, with nothing around it: a list, a port, brackets, a zone, whitespace or a leading zero is the
 * shared bucket, and so is an absent value. An IPv4-mapped IPv6 address is in its IPv4 block.
 */
export function blockOfAddress(text: string | null | undefined): NetworkBlock {
  if (typeof text !== "string" || text.length > LONGEST_ADDRESS_TEXT) {
    return SHARED_BLOCK;
  }
  const octets = parseIpv4(text);
  if (octets !== undefined) return ipv4Block(octets);
  const groups = parseIpv6(text);
  if (groups === undefined) return SHARED_BLOCK;
  return isMapped(groups)
    ? ipv4Block(octetsOfMapped(groups))
    : ipv6Block(groups);
}

function ipv4Block(octets: readonly number[]): NetworkBlock {
  return {
    kind: "ipv4-block",
    subject: octets.slice(0, IPV4_BLOCK_OCTETS).join("."),
  };
}

function ipv6Block(groups: readonly number[]): NetworkBlock {
  return {
    kind: "ipv6-block",
    subject: groups
      .slice(0, IPV6_BLOCK_GROUPS)
      .map((group) => group.toString(16).padStart(HEX_GROUP_DIGITS, "0"))
      .join(":"),
  };
}

function parseIpv4(text: string): number[] | undefined {
  const pieces = text.split(".");
  if (pieces.length !== IPV4_OCTETS) return undefined;
  if (!pieces.every((piece) => DECIMAL_OCTET.test(piece))) return undefined;
  const octets = pieces.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

function parseIpv6(text: string): number[] | undefined {
  if (!ADDRESS_CHARACTERS.test(text)) return undefined;
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const [head = "", tail = ""] = halves;
  const isCompressed = halves.length === 2;
  const headGroups = isCompressed ? groupsOf(head, "no-ipv4") : undefined;
  const tailGroups = groupsOf(isCompressed ? tail : head, "ipv4-last");
  if (tailGroups === undefined) return undefined;
  if (!isCompressed) {
    return tailGroups.length === IPV6_GROUPS ? tailGroups : undefined;
  }
  if (headGroups === undefined) return undefined;
  const missing = IPV6_GROUPS - headGroups.length - tailGroups.length;
  if (missing < 1) return undefined;
  return [...headGroups, ...new Array<number>(missing).fill(0), ...tailGroups];
}

/** The groups of one side of the address; empty text is no groups, and an empty piece is not an address. */
function groupsOf(
  side: string,
  ipv4: "no-ipv4" | "ipv4-last",
): number[] | undefined {
  if (side === "") return [];
  const pieces = side.split(":");
  const groups: number[] = [];
  for (const [index, piece] of pieces.entries()) {
    const isLast = index === pieces.length - 1;
    const read =
      ipv4 === "ipv4-last" && isLast && piece.includes(".")
        ? groupsOfIpv4(piece)
        : groupOfHex(piece);
    if (read === undefined) return undefined;
    groups.push(...read);
  }
  return groups;
}

function groupOfHex(piece: string): number[] | undefined {
  return HEX_GROUP.test(piece) ? [Number.parseInt(piece, 16)] : undefined;
}

function groupsOfIpv4(piece: string): number[] | undefined {
  const octets = parseIpv4(piece);
  if (octets === undefined) return undefined;
  const [a = 0, b = 0, c = 0, d = 0] = octets;
  return [a * 256 + b, c * 256 + d];
}

function isMapped(groups: readonly number[]): boolean {
  return MAPPED_PREFIX_GROUPS.every((group, index) => groups[index] === group);
}

function octetsOfMapped(groups: readonly number[]): number[] {
  const [high = 0, low = 0] = groups.slice(MAPPED_PREFIX_GROUPS.length);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}
