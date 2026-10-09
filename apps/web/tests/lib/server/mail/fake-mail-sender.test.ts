import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

import {
  forbidFetch,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
} from "./mail-test-support";

const FIRST: MailMessage = { key: "k/1", subject: "first", text: "one" };
const SECOND: MailMessage = { key: "k/2", subject: "second", text: "two" };

beforeEach(forbidFetch);
afterEach(releaseFetch);

describe("createFakeMailSender", () => {
  it("records every message in the order it was sent", async () => {
    const sender = createFakeMailSender();

    await sender.send(FIRST);
    await sender.send(SECOND);

    expect(sender.sent).toEqual([FIRST, SECOND]);
  });

  it("answers an acceptance when nothing is scripted", async () => {
    await expect(createFakeMailSender().send(FIRST)).resolves.toEqual({
      ok: true,
    });
  });

  it("answers the scripted outcomes in order, then accepts", async () => {
    const sender = createFakeMailSender([
      { ok: false, kind: "busy", status: 429 },
      { ok: false, kind: "unreachable" },
    ]);

    const outcomes = [
      await sender.send(FIRST),
      await sender.send(FIRST),
      await sender.send(FIRST),
    ];

    expect(outcomes).toEqual([
      { ok: false, kind: "busy", status: 429 },
      { ok: false, kind: "unreachable" },
      { ok: true },
    ]);
  });

  it("records a message whose scripted outcome was a failure, since it was attempted", async () => {
    const sender = createFakeMailSender([{ ok: false, kind: "refused" }]);

    await sender.send(FIRST);

    expect(sender.sent).toEqual([FIRST]);
  });

  it("keeps a copy, so a caller changing its message afterwards cannot alter the record", async () => {
    const sender = createFakeMailSender();
    const message = { ...FIRST };

    await sender.send(message);
    message.text = "changed afterwards";

    expect(sender.sent[0]?.text).toBe(FIRST.text);
  });

  it("records the three fields only, even if a caller hands in a recipient or markup", async () => {
    const sender = createFakeMailSender();
    const withExtras = {
      ...FIRST,
      to: "customer@example.com",
      html: "<b>x</b>",
    } as MailMessage;

    await sender.send(withExtras);

    expect(Object.keys(sender.sent[0] ?? {})).toEqual([
      "key",
      "subject",
      "text",
    ]);
  });

  it("keeps separate records for separate senders", async () => {
    const one = createFakeMailSender();
    const other = createFakeMailSender();

    await one.send(FIRST);

    expect(other.sent).toEqual([]);
  });

  it("never fetches: a send resolves while every fetch throws, and none was made", async () => {
    const sender = createFakeMailSender();

    await expect(sender.send(FIRST)).resolves.toEqual({ ok: true });
  });
});

describe("fake-mail-sender.ts", () => {
  it("names neither fetch, the process environment nor the build mode", () => {
    const source = readMailModuleSource("fake-mail-sender.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(/\bfetch\b/);
  });
});

const SOURCE_ROOT = join(import.meta.dirname, "../../../../src");
const FAKE_MODULE_FILE = "fake-mail-sender.ts";

/** Files under `src` that may import the fake. Empty until the factory exists. */
const MODULES_ALLOWED_TO_IMPORT_THE_FAKE: readonly string[] = [];

const FAKE_IMPORT = /(?:from|import\s*\()\s*["'][^"']*fake-mail-sender["']/;

describe("which modules import the fake", () => {
  it.each([
    ['import { x } from "@/lib/server/mail/fake-mail-sender";', true],
    ["export * from './fake-mail-sender';", true],
    ['const m = await import("./fake-mail-sender");', true],
    ["// fake-mail-sender is never imported here", false],
    ['import { x } from "./mail-sender";', false],
  ])("recognises an import in %s", (source, isImport) => {
    expect(FAKE_IMPORT.test(source)).toBe(isImport);
  });

  it("is imported by nothing under apps/web/src", () => {
    const importers = readdirSync(SOURCE_ROOT, { recursive: true })
      .map(String)
      .filter((path) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
      .filter((path) => !path.endsWith(FAKE_MODULE_FILE))
      .filter((path) => !MODULES_ALLOWED_TO_IMPORT_THE_FAKE.includes(path))
      .filter((path) =>
        FAKE_IMPORT.test(readFileSync(join(SOURCE_ROOT, path), "utf8")),
      );

    expect(importers).toEqual([]);
  });
});
