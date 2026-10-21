import { ROLES, type Role } from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

import {
  ADMINISTRATOR_IDLE_LIFETIME_MS,
  AUTHOR_CREDENTIALS_COOKIE,
  freshPresetAuthorWorld,
  requestCarrying,
  type PresetAuthorWorld,
} from "../../../support/preset-author-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/preset-author-world").then((world) =>
    world.presetAuthorSessionStoreModule(),
  ),
);

const {
  mayAuthorPresets,
  sessionHoldsPresetCreate,
  WIRED_PRESET_AUTHORING_POLICY,
} = await import("@/lib/server/preset/preset-authoring-policy");

/**
 * Who may save a kitchen as a preset (ADR 0112 Amendment A, ADR 0172 D7): the session the request's cookie
 * names, over the real session read and the real capability table, and nothing the request states about itself. Every
 * refusal below sits beside the control that answers yes, without which a refusal could pass for the wrong reason.
 */

let world: PresetAuthorWorld;

beforeEach(() => {
  world = freshPresetAuthorWorld();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function requestWithoutCookie(): NextRequest {
  return new NextRequest("https://example.test/api/designs/any/preset");
}

describe("who the domain gives preset.create to", () => {
  it("is the administrator and no other role, which the cases below rely on", () => {
    const holders = (Object.keys(ROLES) as Role[]).filter((role) =>
      ROLES[role].some((capability) => capability === "preset.create"),
    );

    expect(holders).toEqual(["administrator"]);
  });
});

describe("the wired preset-authoring policy", () => {
  it("reads the session and is not a policy that answers yes without looking", () => {
    expect(WIRED_PRESET_AUTHORING_POLICY).toBe(sessionHoldsPresetCreate);
  });
});

describe("mayAuthorPresets: the accounts that may", () => {
  it("answers yes to a live, confirmed administrator session (the control)", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      true,
    );
  });

  it("still answers yes to an administrator idle for just under the 12 hours", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    world.advance(ADMINISTRATOR_IDLE_LIFETIME_MS - 60_000);

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      true,
    );
  });
});

describe("mayAuthorPresets: everyone else answers no", () => {
  it.each(["client", "operator"] as const)(
    "a live %s session",
    async (role) => {
      const session = await world.signIn({ role });

      expect(await mayAuthorPresets(requestCarrying(session.cookie))).toBe(
        false,
      );
    },
  );

  it("a request with no cookie at all", async () => {
    expect(await mayAuthorPresets(requestWithoutCookie())).toBe(false);
  });

  it("a request whose only credential is the design's own (no session)", async () => {
    expect(
      await mayAuthorPresets(requestCarrying(AUTHOR_CREDENTIALS_COOKIE)),
    ).toBe(false);
  });

  it.each([
    ["too short", "short"],
    ["empty", ""],
    ["right length, not the base64url alphabet", "!".repeat(43)],
    ["a session value no store knows", "a".repeat(43)],
  ])("a session cookie that is %s", async (_name, value) => {
    await world.signIn({ role: "administrator" });

    expect(
      await mayAuthorPresets(
        requestCarrying(`${SESSION_COOKIE_NAME}=${value}`),
      ),
    ).toBe(false);
  });

  it("an administrator session that has been revoked", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    await world.sessions.revoke(administrator.tokenHash);

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      false,
    );
  });

  it("an administrator session idle for longer than the 12 hours", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    world.advance(ADMINISTRATOR_IDLE_LIFETIME_MS + 1_000);

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      false,
    );
  });

  it("an administrator demoted after the session began: the role is the account's current one", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    world.accounts.setRoleOf(administrator.accountId, "operator");

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      false,
    );
  });

  it("an administrator whose address is not confirmed", async () => {
    const administrator = await world.signIn({
      role: "administrator",
      isEmailConfirmed: false,
    });

    expect(await mayAuthorPresets(requestCarrying(administrator.cookie))).toBe(
      false,
    );
  });

  it("a client who states a role of administrator in a header, a cookie or the query", async () => {
    const client = await world.signIn({ role: "client" });
    const claimingRole = new NextRequest(
      "https://example.test/api/designs/any/preset?role=administrator&capability=preset.create",
      {
        headers: {
          cookie: `${client.cookie}; role=administrator`,
          "x-role": "administrator",
          "x-capabilities": "preset.create",
        },
      },
    );

    expect(await mayAuthorPresets(claimingRole)).toBe(false);
  });
});

describe("mayAuthorPresets: a session read that fails", () => {
  it("answers no to an administrator whose session the store cannot be asked about", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    const request = requestCarrying(administrator.cookie);
    expect(await mayAuthorPresets(request)).toBe(true);

    world.breakSessionLookups();

    expect(await mayAuthorPresets(request)).toBe(false);
  });

  it("reports the unavailable session read, as readCurrentSession does, so an outage is not mistaken for a refusal", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const administrator = await world.signIn({ role: "administrator" });
    world.breakSessionLookups();

    await mayAuthorPresets(requestCarrying(administrator.cookie));

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[account]", {
      event: "session-read",
      outcome: "unavailable",
    });
  });

  it("reports nothing when the answer is a plain refusal", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await world.signIn({ role: "client" });

    await mayAuthorPresets(requestCarrying(client.cookie));

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
