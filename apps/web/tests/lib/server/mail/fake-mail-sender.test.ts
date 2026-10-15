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

  it("refuses a message that may not be sent, as the adapter does, and records nothing", async () => {
    const sender = createFakeMailSender([{ ok: false, kind: "busy" }]);

    const refused = await sender.send({ ...FIRST, key: "has a space" });
    const next = await sender.send(FIRST);

    expect(refused).toEqual({ ok: false, kind: "refused" });
    expect(sender.sent).toEqual([FIRST]);
    expect(next).toEqual({ ok: false, kind: "busy" });
  });

  it("refuses an empty text, records nothing and spends no scripted outcome", async () => {
    const sender = createFakeMailSender([{ ok: false, kind: "busy" }]);

    const refused = await sender.send({ ...FIRST, text: "" });
    const next = await sender.send(FIRST);

    expect(refused).toEqual({ ok: false, kind: "refused" });
    expect(sender.sent).toEqual([FIRST]);
    expect(next).toEqual({ ok: false, kind: "busy" });
  });

  it("records the copy it judged: a key that changes after the first read is not recorded", async () => {
    let keyReads = 0;
    const message = {
      get key() {
        keyReads += 1;
        return keyReads === 1 ? FIRST.key : "later\r\nX: 1";
      },
      subject: FIRST.subject,
      text: FIRST.text,
    };
    const sender = createFakeMailSender();

    await sender.send(message);

    expect(keyReads).toBe(1);
    expect(sender.sent).toEqual([FIRST]);
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
  it("reads source: names neither fetch, the process environment nor the build mode", () => {
    const source = readMailModuleSource("fake-mail-sender.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(/\bfetch\b/);
  });
});
