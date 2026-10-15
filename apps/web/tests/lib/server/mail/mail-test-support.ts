import dns from "node:dns";
import { readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import tls from "node:tls";

import { expect, vi, type MockInstance } from "vitest";

const fetchSpy = vi.fn(() => {
  throw new Error("a mail test reached fetch");
});

/** Makes any request attempt throw, so a module that reaches the network fails its own test. */
export function forbidFetch(): void {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
}

/** Fails the test that made a request even if the code under test swallowed the throw. */
export function releaseFetch(): void {
  vi.unstubAllGlobals();
  expect(fetchSpy).not.toHaveBeenCalled();
}

const attemptedNetworkCalls: string[] = [];
let networkSpies: readonly MockInstance[] = [];

const FORBIDDEN_DNS_FUNCTIONS = [
  "lookup",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCname",
  "resolveMx",
  "resolveNs",
  "resolveSrv",
  "resolveTxt",
] as const;

function forbidCall(target: object, name: string, label: string): MockInstance {
  return vi
    .spyOn(target as Record<string, () => unknown>, name)
    .mockImplementation(() => {
      attemptedNetworkCalls.push(label);
      throw new Error(`a mail test reached ${label}`);
    });
}

/**
 * Makes every way of opening a socket or asking a resolver throw and be recorded: every socket connects through
 * `Socket.prototype.connect`, and the library resolves names through `dns` and `dns.promises`. The throw alone is not
 * the guard, because the library turns it into a connection error; `stopForbiddingNetwork` reports what was tried.
 */
export function forbidNetwork(): void {
  stopForbiddingNetwork();
  const dnsCalls = FORBIDDEN_DNS_FUNCTIONS.flatMap((name) => [
    forbidCall(dns, name, `dns.${name}`),
    forbidCall(dns.promises, name, `dns.promises.${name}`),
  ]);
  networkSpies = [
    forbidCall(net.Socket.prototype, "connect", "net.Socket.connect"),
    forbidCall(net, "connect", "net.connect"),
    forbidCall(tls, "connect", "tls.connect"),
    ...dnsCalls,
  ];
}

/** Restores the real functions and answers which forbidden ones were called, in order. */
export function stopForbiddingNetwork(): readonly string[] {
  for (const spy of networkSpies) spy.mockRestore();
  networkSpies = [];
  return attemptedNetworkCalls.splice(0);
}

/** Fails the test that reached the network even if the code under test swallowed the throw. */
export function releaseNetwork(): void {
  expect(stopForbiddingNetwork()).toEqual([]);
}

/** Values that are not one plain mailbox, grouped by the rule each breaks, so every rule keeps at least one witness. */
export const NOT_ONE_PLAIN_MAILBOX_GROUPS = {
  empty: [""],
  noAtSign: ["no-at-sign"],
  moreThanOneAtSign: ["two@at@signs.example"],
  secondAddressOrSeparator: [
    "a@b.example, c@d.example",
    "a@b.example;c@d.example",
  ],
  headerInjectingLineBreak: [
    "a@b.example\r\nBcc: c@d.example",
    "a@b.example\nReply-To: c@d.example",
  ],
  displayNameOrAngleBrackets: ['"a@b.example" <c@d.example>', "<a@b.example>"],
  whitespaceOrControlCharacter: [
    "a@b.example\u2028",
    "a@b.example\u0085",
    "a@b\u0000.example",
    "a b@b.example",
  ],
  quoteCommentLiteralOrBackslash: [
    'a@b"c.example',
    "a@(x).example",
    "a@[1.2.3.4]",
    "a@b\\c.example",
    "a(x)@b.example",
    'a"b@b.example',
  ],
  misplacedLocalPartDot: [".a@b.example", "a..b@b.example"],
  malformedDomainLabel: ["a@-b.example", "a@b.example."],
  numericOrAddressLikeDomain: ["a@0", "a@1.2", "a@0x7f.1", "a@b.123"],
} as const satisfies Record<string, readonly string[]>;

export const NOT_ONE_PLAIN_MAILBOX: readonly string[] = Object.values(
  NOT_ONE_PLAIN_MAILBOX_GROUPS,
).flat();

const MAIL_SOURCE_DIRECTORY = join(
  import.meta.dirname,
  "../../../../src/lib/server/mail",
);

export function readMailModuleSource(fileName: string): string {
  return readFileSync(join(MAIL_SOURCE_DIRECTORY, fileName), "utf8");
}

export const PROCESS_ENV_OR_BUILD_MODE = /process\.env|NODE_ENV/;

const SOURCE_ROOT = join(import.meta.dirname, "../../../../src");

/** Paths under `apps/web/src`, relative to it, of the files whose text matches `pattern`. */
export function sourceFilesMatching(pattern: RegExp): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true })
    .map(String)
    .filter((path) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
    .filter((path) =>
      pattern.test(readFileSync(join(SOURCE_ROOT, path), "utf8")),
    );
}

export type ConsoleSpy = MockInstance<(...data: unknown[]) => void>;

/** Every function the console offers, not a chosen few: a line written through `table` or `dir` is a line. */
export function spyOnEveryConsoleMethod(): readonly ConsoleSpy[] {
  const methodNames = Object.entries(console)
    .filter(([, member]) => typeof member === "function")
    .map(([name]) => name);
  return methodNames.map((name) =>
    vi.spyOn(console, name as "log").mockImplementation(() => undefined),
  );
}

export function consoleCallsOf(spies: readonly ConsoleSpy[]): unknown[][] {
  return spies.flatMap((spy) => spy.mock.calls);
}
