import { describe, expect, it } from "vitest";

import { isAccountSessionRead } from "./account-session-reads";

describe("isAccountSessionRead", () => {
  it("lets through the header's read, as a path or as an absolute address", () => {
    expect(isAccountSessionRead("GET", "/api/account/session")).toBe(true);
    expect(
      isAccountSessionRead("GET", "http://localhost:4320/api/account/session"),
    ).toBe(true);
  });

  it.each([
    ["a write to it", "POST", "/api/account/session"],
    ["a delete of it", "DELETE", "/api/account/session"],
    ["a query on it", "GET", "/api/account/session?as=staff"],
    ["a longer path", "GET", "/api/account/session/extra"],
    ["a sibling account route", "GET", "/api/account/logout"],
    ["a design read", "GET", "/api/designs/abc"],
    ["the design mint", "POST", "/api/designs"],
    ["a page that merely contains the words", "GET", "/ro/api/account/session"],
  ])("does not let through %s", (_name, method, address) => {
    expect(isAccountSessionRead(method, address)).toBe(false);
  });
});
