import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PresetAuthoringRequest } from "@/lib/server/preset/preset-authoring-policy";
import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";
import { sha256Hex } from "@/lib/server/sha256-hex";

import {
  freshPresetAuthorWorld,
  type PresetAuthorWorld,
  type SeededPresetSession,
} from "../../../support/preset-author-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/preset-author-world").then((world) =>
    world.presetAuthorSessionStoreModule(),
  ),
);

const { mayAuthorPresets } = await import(
  "@/lib/server/preset/preset-authoring-policy"
);

/**
 * QA of wave L3-A1: what else a request can carry that is not "the administrator's session value under the session
 * cookie's name", and must not be taken for it. Each refusal is asked beside the same administrator's real cookie in
 * the same test, so a refusal cannot pass because the administrator never was one. Covers other credentials of the
 * session value's shape, a stored hash, cookies of another spelling, and which of two cookies of one name is read.
 */

const ONE_DAY_MS = 86_400_000;

let world: PresetAuthorWorld;
let administrator: SeededPresetSession;
let administratorValue: string;

beforeEach(async () => {
  world = freshPresetAuthorWorld();
  administrator = await world.signIn({ role: "administrator" });
  administratorValue = administrator.cookie.slice(
    `${SESSION_COOKIE_NAME}=`.length,
  );
});

function asking(cookie: string): NextRequest {
  return new NextRequest("https://example.test/api/designs/any/preset", {
    headers: { cookie },
  });
}

/** A request whose cookies are exactly the given pairs, which `Cookie` header parsing would trim or refuse. */
function carrying(
  sessionValue: string,
  headers: Record<string, string> = {},
): PresetAuthoringRequest {
  return {
    cookies: {
      get: (name) =>
        name === SESSION_COOKIE_NAME ? { value: sessionValue } : undefined,
    },
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

async function expectControlThenRefusal(refused: PresetAuthoringRequest) {
  expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(true);
  expect(await mayAuthorPresets(refused)).toBe(false);
}

describe("a credential of another purpose presented as the session cookie", () => {
  it("the visitor cookie's value, which has the session value's exact shape", async () => {
    const visitorValue = "v".repeat(43);

    await expectControlThenRefusal(
      asking(
        `${SESSION_COOKIE_NAME}=${visitorValue}; __Host-lemnaria_visitor=${visitorValue}`,
      ),
    );
  });

  it.each(["verify-email", "reset-password"] as const)(
    "a live %s token of the administrator's own account, raw value, under the session name",
    async (purpose) => {
      const tokenValue = "t".repeat(43);
      await world.accounts.issueToken({
        accountId: administrator.accountId,
        purpose,
        tokenHash: sha256Hex(tokenValue),
        expiresAt: new Date(Date.now() + ONE_DAY_MS),
      });

      await expectControlThenRefusal(
        asking(`${SESSION_COOKIE_NAME}=${tokenValue}`),
      );
    },
  );

  it("the stored hash of the administrator's session (a leaked row), whole or cut to the value's length", async () => {
    const { tokenHash } = administrator;

    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME}=${tokenHash}`),
    );
    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME}=${tokenHash.slice(0, 43)}`),
    );
  });

  it("the administrator's value in a header, the query string, or a cookie of another name", async () => {
    const elsewhere = new NextRequest(
      `https://example.test/api/designs/any/preset?session=${administratorValue}`,
      {
        headers: {
          authorization: `Bearer ${administratorValue}`,
          "x-session": administratorValue,
          cookie: `session=${administratorValue}; __Host-lemnaria_visitor=${administratorValue}; lemnaria_write_token_x=${administratorValue}`,
        },
      },
    );

    await expectControlThenRefusal(elsewhere);
  });
});

describe("a session cookie that is not exactly the value the server minted", () => {
  it.each([
    ["one character more", (value: string) => `${value}A`],
    ["one character fewer", (value: string) => value.slice(0, -1)],
    [
      "a character outside the alphabet in place of the last",
      (value: string) => `${value.slice(0, -1)}+`,
    ],
    ["double-quoted", (value: string) => `"${value}"`],
    ["a percent-encoded space after it", (value: string) => `${value}%20`],
    ["a percent-encoded NUL after it", (value: string) => `${value}%00`],
    ["a percent-encoded newline after it", (value: string) => `${value}%0A`],
  ])("%s", async (_name, alter) => {
    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME}=${alter(administratorValue)}`),
    );
  });

  it.each([
    ["a trailing newline", "\n"],
    ["a trailing carriage return", "\r"],
    ["a trailing NUL", "\u0000"],
    ["a trailing space", " "],
  ])(
    "%s, which only a reader that does not trim can hand the policy",
    async (_name, suffix) => {
      await expectControlThenRefusal(
        carrying(`${administratorValue}${suffix}`),
      );
    },
  );

  it("a leading space or newline", async () => {
    await expectControlThenRefusal(carrying(` ${administratorValue}`));
    await expectControlThenRefusal(carrying(`\n${administratorValue}`));
  });

  it("the cookie name in another case or with spaces around the equals sign", async () => {
    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME.toLowerCase()}=${administratorValue}`),
    );
    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME.toUpperCase()}=${administratorValue}`),
    );
    await expectControlThenRefusal(
      asking(`${SESSION_COOKIE_NAME} = ${administratorValue}`),
    );
    await expectControlThenRefusal(
      asking(`Host-lemnaria_session=${administratorValue}`),
    );
  });
});

describe("two session cookies in one request: the one the server reads decides, and the other changes nothing", () => {
  let client: SeededPresetSession;
  let clientValue: string;
  const garbage = "g".repeat(43);

  beforeEach(async () => {
    client = await world.signIn({ role: "client" });
    clientValue = client.cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
  });

  function duplicated(first: string, second: string): NextRequest {
    return asking(
      `${SESSION_COOKIE_NAME}=${first}; ${SESSION_COOKIE_NAME}=${second}`,
    );
  }

  it.each([
    ["a client and an administrator", () => [clientValue, administratorValue]],
    ["an administrator and a client", () => [administratorValue, clientValue]],
    ["garbage and an administrator", () => [garbage, administratorValue]],
    ["an administrator and garbage", () => [administratorValue, garbage]],
    ["a client and garbage", () => [clientValue, garbage]],
    ["garbage and a client", () => [garbage, clientValue]],
  ])(
    "%s: the answer is the answer for the last cookie read alone, in either order",
    async (_name, pair) => {
      const [first, second] = pair() as [string, string];

      const answerForPair = await mayAuthorPresets(duplicated(first, second));
      const answerForLastAlone = await mayAuthorPresets(
        asking(`${SESSION_COOKIE_NAME}=${second}`),
      );

      expect(answerForPair).toBe(answerForLastAlone);
    },
  );

  it("a client's cookie never gains the administrator's rights from an administrator cookie beside it that the server does not read", async () => {
    expect(
      await mayAuthorPresets(duplicated(administratorValue, clientValue)),
    ).toBe(false);
  });
});

describe("the policy reads the session and writes nothing", () => {
  it("a request that carries no well-formed session value does not ask the store at all", async () => {
    const lookup = vi.spyOn(world.sessions, "findLive");

    await mayAuthorPresets(asking("lemnaria_write_token_x=y"));
    await mayAuthorPresets(asking(`${SESSION_COOKIE_NAME}=short`));
    await mayAuthorPresets(carrying(`${administratorValue}\n`));

    expect(lookup).not.toHaveBeenCalled();
  });

  it("one well-formed value is one lookup, and the answer neither touches nor revives the session", async () => {
    const lookup = vi.spyOn(world.sessions, "findLive");
    const touch = vi.spyOn(world.sessions, "touch");

    await mayAuthorPresets(asking(administrator.cookie));

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(touch).not.toHaveBeenCalled();
  });

  it("an idle-expired administrator is not revived by being asked, however often", async () => {
    world.advance(12 * 60 * 60 * 1000 + 1_000);

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
  });
});

describe("an administrator is not lost to a stale answer", () => {
  it("a client promoted to administrator after the session began is an administrator on the next request", async () => {
    const promoted = await world.signIn({ role: "client" });
    expect(await mayAuthorPresets(asking(promoted.cookie))).toBe(false);

    world.accounts.setRoleOf(promoted.accountId, "administrator");

    expect(await mayAuthorPresets(asking(promoted.cookie))).toBe(true);
  });

  it("a store that failed once answers yes again when it recovers: a failure is not remembered", async () => {
    const failing = vi
      .spyOn(world.sessions, "findLive")
      .mockRejectedValueOnce(new Error("session store is down"));

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(true);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
