import {
  blockOfAddress,
  SHARED_BLOCK,
  type NetworkBlock,
} from "@/lib/server/rate-limit/client-network";

export const CLIENT_NETWORK_SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";

export type NetworkEnvironment = Readonly<Record<string, string | undefined>>;

/** The header each accepted source names: the one that source's platform overwrites with the client's address. */
const HEADER_OF_SOURCE = { vercel: "x-forwarded-for" } as const;

type NetworkSourceName = keyof typeof HEADER_OF_SOURCE;

export type NetworkSource =
  | { readonly kind: "header"; readonly header: string }
  | { readonly kind: "none" }
  | {
      readonly kind: "misconfigured";
      readonly variable: typeof CLIENT_NETWORK_SOURCE_VARIABLE;
    };

/** Whatever answers a header's value by its name: `Headers` does. */
export interface HeaderReader {
  get(name: string): string | null;
}

export type ClientNetwork =
  | { readonly status: "known"; readonly block: NetworkBlock }
  | {
      readonly status: "misconfigured";
      readonly variable: typeof CLIENT_NETWORK_SOURCE_VARIABLE;
    };

/**
 * Pure. The variable is the owner's, set on a deployment whose platform overwrites the header, and never a variable
 * the platform sets. Absent is none: no header is read. Present as an own member with anything else in it, whatever
 * it holds, is misconfigured.
 */
export function selectNetworkSource(
  environment: NetworkEnvironment,
): NetworkSource {
  if (!Object.hasOwn(environment, CLIENT_NETWORK_SOURCE_VARIABLE)) {
    return { kind: "none" };
  }
  const value = environment[CLIENT_NETWORK_SOURCE_VARIABLE];
  if (isSourceName(value)) {
    return { kind: "header", header: HEADER_OF_SOURCE[value] };
  }
  return { kind: "misconfigured", variable: CLIENT_NETWORK_SOURCE_VARIABLE };
}

function isSourceName(value: unknown): value is NetworkSourceName {
  return typeof value === "string" && Object.hasOwn(HEADER_OF_SOURCE, value);
}

/** Under none no header is asked for, so nothing a client sends can move it out of the one shared bucket. */
export function identifyClientNetwork(
  source: NetworkSource,
  headers: HeaderReader,
): ClientNetwork {
  if (source.kind === "misconfigured") {
    return { status: "misconfigured", variable: source.variable };
  }
  if (source.kind === "none") return { status: "known", block: SHARED_BLOCK };
  return { status: "known", block: blockOfAddress(headers.get(source.header)) };
}
