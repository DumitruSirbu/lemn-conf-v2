import { ROLES, type Role } from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/server/account/session-cookie";

import {
  freshPresetAuthorWorld,
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
 * Who may save a kitchen as a preset (plan K-14, ADR 0112 Amendment A, ADR 0172 D7): the session the request's cookie
 * names, over the real session read and the real capability table, and nothing the request states about itself. Every
 * refusal below sits beside the control that answers yes, without which a refusal could pass for the wrong reason.
 */

const HOURS = 60 * 60 * 1000;
const ADMINISTRATOR_IDLE_LIFETIME_MS = 12 * HOURS;

let world: PresetAuthorWorld;

beforeEach(() => {
  world = freshPresetAuthorWorld();
});

function requestWith(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.test/api/designs/any/preset", {
    headers,
  });
}

function asking(cookie: string): NextRequest {
  return requestWith({ cookie });
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

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(true);
  });

  it("still answers yes to an administrator idle for just under the 12 hours", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    world.advance(ADMINISTRATOR_IDLE_LIFETIME_MS - 60_000);

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(true);
  });
});

describe("mayAuthorPresets: everyone else answers no", () => {
  it.each(["client", "operator"] as const)(
    "a live %s session",
    async (role) => {
      const session = await world.signIn({ role });

      expect(await mayAuthorPresets(asking(session.cookie))).toBe(false);
    },
  );

  it("a request with no cookie at all", async () => {
    expect(await mayAuthorPresets(requestWith())).toBe(false);
  });

  it("a request whose only credential is the design's own (no session)", async () => {
    const cookie = "lemnaria_write_token_abc=token; __Host-lemnaria_visitor=v";

    expect(await mayAuthorPresets(asking(cookie))).toBe(false);
  });

  it.each([
    ["too short", "short"],
    ["empty", ""],
    ["right length, not the base64url alphabet", "!".repeat(43)],
    ["a session value no store knows", "a".repeat(43)],
  ])("a session cookie that is %s", async (_name, value) => {
    await world.signIn({ role: "administrator" });

    expect(
      await mayAuthorPresets(asking(`${SESSION_COOKIE_NAME}=${value}`)),
    ).toBe(false);
  });

  it("an administrator session that has been revoked", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    await world.sessions.revoke(administrator.tokenHash);

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
  });

  it("an administrator session idle for longer than the 12 hours", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    world.advance(ADMINISTRATOR_IDLE_LIFETIME_MS + 1_000);

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
  });

  it("an administrator demoted after the session began: the role is the account's current one", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    world.accounts.setRoleOf(administrator.accountId, "operator");

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
  });

  it("an administrator whose address is not confirmed", async () => {
    const administrator = await world.signIn({
      role: "administrator",
      isEmailConfirmed: false,
    });

    expect(await mayAuthorPresets(asking(administrator.cookie))).toBe(false);
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
    const request = asking(administrator.cookie);
    expect(await mayAuthorPresets(request)).toBe(true);

    world.breakSessionLookups();

    expect(await mayAuthorPresets(request)).toBe(false);
  });

  it("is the catch that closes it: the policy itself rejects, and does not answer yes", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    world.breakSessionLookups();

    await expect(
      sessionHoldsPresetCreate(asking(administrator.cookie)),
    ).rejects.toThrow("session store is down");
  });
});
