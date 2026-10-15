// Case 6 of the plan's QA section: that the network guard refuses every way out and is lifted after each test, and that no
// test builds a transport without it (the library's default transport is never driven here: that control was run once, as a
// scratch test); that the test tree names the SMTP host only where its options are asserted; that the previous
// provider's names remain in the source only in the retired list; and that the shop's address and no Gmail address at
// all stands in any source or test file (criterion 21). Every needle is assembled at run time, so this file is not the
// thing it searches for.
import dns from "node:dns";
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import net from "node:net";
import { join, relative, sep } from "node:path";
import tls from "node:tls";

import { afterEach, describe, expect, it } from "vitest";

import { GMAIL_SMTP_HOST } from "@/lib/server/mail/gmail-mail-sender";

import {
  forbidNetwork,
  sourceFilesMatching,
  stopForbiddingNetwork,
} from "./mail-test-support";

const WEB_ROOT = join(import.meta.dirname, "../../../..");
const REPOSITORY_ROOT = join(WEB_ROOT, "../..");
const TESTS_ROOT = join(WEB_ROOT, "tests");

afterEach(() => {
  stopForbiddingNetwork();
});

describe("the network guard", () => {
  it("refuses every way of reaching a socket or a resolver, and records each", () => {
    forbidNetwork();

    expect(() => net.connect(9, "127.0.0.1")).toThrow();
    expect(() => tls.connect(9, "127.0.0.1")).toThrow();
    expect(() => new net.Socket().connect(9, "127.0.0.1")).toThrow();
    expect(() => {
      dns.lookup("example.invalid", () => undefined);
    }).toThrow();
    expect(() => dns.promises.resolve4("example.invalid")).toThrow();
    expect(stopForbiddingNetwork().length).toBe(5);
  });

  it("is lifted by stopForbiddingNetwork, so the next test is not guarded by this one", () => {
    const realConnect = memberOf(net.Socket.prototype, "connect");
    forbidNetwork();
    expect(memberOf(net.Socket.prototype, "connect")).not.toBe(realConnect);

    stopForbiddingNetwork();

    expect(memberOf(net.Socket.prototype, "connect")).toBe(realConnect);
  });
});

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  ".turbo",
  ".vercel",
]);

/** Env files hold values and are never opened: this walk reads source, never a secret. */
const IS_AN_ENV_FILE = /^\.env(?:\..*)?$/;
const IS_TEXT =
  /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|css|sh|yml|yaml|example)$/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name) ? [] : filesUnder(path);
      }
      return entry.isFile() &&
        !IS_AN_ENV_FILE.test(entry.name) &&
        IS_TEXT.test(entry.name)
        ? [path]
        : [];
    },
  );
}

function pathsNaming(needle: string, roots: readonly string[]): string[] {
  const lowered = needle.toLowerCase();
  return roots
    .flatMap(filesUnder)
    .filter((path) =>
      readFileSync(path, "utf8").toLowerCase().includes(lowered),
    )
    .map((path) => relative(REPOSITORY_ROOT, path).split(sep).join("/"));
}

const CODE_ROOTS = [
  join(REPOSITORY_ROOT, "apps"),
  join(REPOSITORY_ROOT, "packages"),
];

describe("what the tree names", () => {
  it("is scanned: the walk finds this file and the adapter, and skips an env file by name", () => {
    const files = CODE_ROOTS.flatMap(filesUnder).map((path) =>
      relative(REPOSITORY_ROOT, path).split(sep).join("/"),
    );

    expect(files).toContain(
      "apps/web/tests/lib/server/mail/qa-8n-no-network-and-scans.adversarial.test.ts",
    );
    expect(files).toContain(
      "apps/web/src/lib/server/mail/gmail-mail-sender.ts",
    );
    expect(IS_AN_ENV_FILE.test(".env.local")).toBe(true);
    expect(IS_AN_ENV_FILE.test(".env.test.local")).toBe(true);
    expect(IS_AN_ENV_FILE.test("environment.ts")).toBe(false);
  });

  it("names the SMTP host in the source only in the adapter, and in the tests only where the options are asserted", () => {
    const named = pathsNaming(GMAIL_SMTP_HOST, CODE_ROOTS);

    expect(named.sort()).toEqual([
      "apps/web/src/lib/server/mail/gmail-mail-sender.ts",
      "apps/web/tests/lib/server/mail/gmail-mail-sender.test.ts",
    ]);
  });

  it("holds the shop's address in no source, test or example file of apps, packages or the repository's example", () => {
    const shopsAddress = ["patrasiteli7", "gmail.com"].join("@");

    expect(pathsNaming(shopsAddress, CODE_ROOTS)).toEqual([]);
    expect(
      readFileSync(join(REPOSITORY_ROOT, ".env.example"), "utf8").toLowerCase(),
    ).not.toContain(shopsAddress);
  });

  it("holds no Gmail address of any kind in apps or packages, nor in the example (criterion 21)", () => {
    const anyGmailAddress = ["@gmail", "com"].join(".");

    expect(pathsNaming(anyGmailAddress, CODE_ROOTS)).toEqual([]);
    expect(
      readFileSync(join(REPOSITORY_ROOT, ".env.example"), "utf8").toLowerCase(),
    ).not.toContain(anyGmailAddress);
  });

  it("leaves the previous provider's variable names under apps/web/src only in the retired list", () => {
    const providerNames = /RESEND_|MAIL_FROM_ADDRESS/;

    expect(sourceFilesMatching(providerNames)).toEqual([
      "lib/server/mail/mail-configuration.ts",
    ]);
  });

  it("leaves no other trace of the previous provider under apps/web/src: no word, host, module or header", () => {
    const providerTrace =
      /\bresend\b|resend-mail-sender|createResendMailSender|api\.resend\.com|Idempotency-Key/i;

    expect(sourceFilesMatching(providerTrace)).toEqual([]);
  });

  it("recognises what it looks for: each needle matches a sample of itself", () => {
    expect(/RESEND_|MAIL_FROM_ADDRESS/.test("process.env.RESEND_API_KEY")).toBe(
      true,
    );
    expect(/\bresend\b/i.test("the Resend adapter")).toBe(true);
    expect(/\bresend\b/i.test("canPressResendUnansweredSend")).toBe(false);
  });
});

describe("every test file in the whole tree that can build a mail transport", () => {
  const BUILDS_A_TRANSPORT =
    /(?:from|import\(|require\()\s*["'](?:nodemailer|@\/lib\/server\/mail\/(?:gmail-mail-sender|create-mail-sender)|(?:\.{1,2}\/)+[\w./-]*(?:gmail-mail-sender|create-mail-sender))["']/;
  const GUARDS_THE_NETWORK = (source: string) =>
    /\bforbidNetwork\(/.test(source) && /\breleaseNetwork\b/.test(source);

  function testFiles(): string[] {
    return filesUnder(TESTS_ROOT).filter((path) => /\.test\.tsx?$/.test(path));
  }

  it("is scanned: the walk reaches the mail directory's adversarial files and the e2e support tests", () => {
    const names = testFiles().map((path) => relative(TESTS_ROOT, path));

    expect(names).toContain(
      join("lib", "server", "mail", "qa-8j-environment.adversarial.test.ts"),
    );
    expect(names).toContain(
      join("e2e", "support", "fake-mail-environment.test.ts"),
    );
  });

  it("forbids and then releases the network in each one, the QA files included", () => {
    const unguarded = testFiles()
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return BUILDS_A_TRANSPORT.test(source) && !GUARDS_THE_NETWORK(source);
      })
      .map((path) => relative(TESTS_ROOT, path));

    expect(unguarded).toEqual([]);
  });

  it("finds a qa file that builds a transport and does not guard, in a sample of one", () => {
    const sample = 'import { createTransport } from "nodemailer";';

    expect(BUILDS_A_TRANSPORT.test(sample) && !GUARDS_THE_NETWORK(sample)).toBe(
      true,
    );
    expect(
      BUILDS_A_TRANSPORT.test(`${sample}\nforbidNetwork(); releaseNetwork();`),
    ).toBe(true);
    expect(
      GUARDS_THE_NETWORK(`${sample}\nforbidNetwork(); releaseNetwork();`),
    ).toBe(true);
  });
});

function memberOf(target: object, name: string): unknown {
  return Reflect.get(target, name);
}
