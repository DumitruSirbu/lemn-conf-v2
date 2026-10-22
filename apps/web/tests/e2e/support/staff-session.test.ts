import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME as SERVER_COOKIE_NAME,
  mintSessionValue as mintServerSessionValue,
  readSessionCookie,
} from "@/lib/server/account/session-cookie";
import { sha256Hex } from "@/lib/server/sha256-hex";

import {
  SESSION_COOKIE_NAME,
  mintSessionValue,
  sessionCookieOf,
  sessionTokenHashOf,
} from "./staff-session";

const ORIGIN = "http://localhost:4320";

describe("the session cookie a spec holds", () => {
  it("is named exactly as the server names it", () => {
    expect(SESSION_COOKIE_NAME).toBe(SERVER_COOKIE_NAME);
  });

  it("mints a value the server's reader accepts as a session value, and one the server would mint in shape", () => {
    const value = mintSessionValue();

    expect(readSessionCookie({ get: () => ({ value }) })).toBe(value);
    expect(value).toHaveLength(mintServerSessionValue().length);
  });

  it("never mints the same value twice", () => {
    expect(mintSessionValue()).not.toBe(mintSessionValue());
  });

  it("hashes a value to what the server stores for it", () => {
    const value = mintSessionValue();

    expect(sessionTokenHashOf(value)).toBe(sha256Hex(value));
  });

  it("is host-only, secure and httpOnly, so the browser accepts the __Host- name", () => {
    const cookie = sessionCookieOf("v", ORIGIN);

    expect(cookie).toMatchObject({
      name: SESSION_COOKIE_NAME,
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    expect(cookie.domain).not.toMatch(/^\./);
  });
});
