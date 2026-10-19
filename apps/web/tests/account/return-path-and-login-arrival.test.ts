// The closed lists the login page reads from its address: the way back (`returnTo`) and the reason it was reached
// (`reason`). Neither may carry anything the person typed or an address to leave for (Lot 2 C26; Lot 1 criterion on open
// redirects).
import { describe, expect, it } from "vitest";

import { loginArrivalOf, loginPathWithReason } from "@/account/login-arrival";
import {
  loginPathWithReturn,
  returnPathOf,
  returnPathOfDesign,
} from "@/account/return-path";

import { designIdOf } from "../support/account-kitchens-wire";

const DESIGN_ID = designIdOf(7);

describe("returnPathOf: only a design's own address, in a language the application serves", () => {
  it.each(["ro", "ru"])("accepts /%s/d/{id}", (locale) => {
    expect(returnPathOf(`/${locale}/d/${DESIGN_ID}`)).toBe(
      `/${locale}/d/${DESIGN_ID}`,
    );
  });

  it.each([
    ["no value", undefined],
    ["an empty value", ""],
    ["a repeated parameter", [`/ro/d/${DESIGN_ID}`, `/ro/d/${DESIGN_ID}`]],
    ["an array of one", [`/ro/d/${DESIGN_ID}`]],
    ["a language that is not served", `/de/d/${DESIGN_ID}`],
    ["an upper-case language", `/RO/d/${DESIGN_ID}`],
    ["no language", `/d/${DESIGN_ID}`],
    ["no leading slash", `ro/d/${DESIGN_ID}`],
    ["a protocol-relative address", `//evil.example/d/${DESIGN_ID}`],
    [
      "a protocol-relative address that looks like a path",
      `//ro/d/${DESIGN_ID}`,
    ],
    ["an absolute address", `https://evil.example/ro/d/${DESIGN_ID}`],
    ["a trailing slash", `/ro/d/${DESIGN_ID}/`],
    ["a longer path", `/ro/d/${DESIGN_ID}/contact`],
    ["a query string", `/ro/d/${DESIGN_ID}?x=1`],
    ["a fragment", `/ro/d/${DESIGN_ID}#x`],
    ["another marker", `/ro/s/${DESIGN_ID}`],
    ["an id one character short", `/ro/d/${DESIGN_ID.slice(1)}`],
    ["an id one character long", `/ro/d/${DESIGN_ID}x`],
    [
      "an encoded slash in the id",
      `/ro/d/${DESIGN_ID.slice(0, 10)}%2F${DESIGN_ID.slice(13)}`,
    ],
    ["a backslash in the id", `/ro/d/${DESIGN_ID.slice(0, 20)}\\`],
    ["a dot segment", "/ro/d/.."],
    ["a javascript scheme", "javascript:alert(1)"],
    ["a line feed after the id", `/ro/d/${DESIGN_ID}\n`],
    ["a leading space", ` /ro/d/${DESIGN_ID}`],
    ["an id with a scheme-like prefix", "/ro/d/https:evil.example0123456"],
  ])("refuses %s", (_, value) => {
    expect(returnPathOf(value)).toBeUndefined();
  });

  it("is built from the parts that matched and never echoes the input", () => {
    const accepted = returnPathOf(`/ro/d/${DESIGN_ID}`);
    expect(accepted).toBe(`/ro/d/${DESIGN_ID}`);
    expect(returnPathOf(`/ro/d/${DESIGN_ID}`)).not.toContain("//");
  });

  it("does not decode a second time: an encoded value stays refused", () => {
    expect(
      returnPathOf(encodeURIComponent(`/ro/d/${DESIGN_ID}`)),
    ).toBeUndefined();
  });
});

describe("returnPathOfDesign: the address the editor offers is always one returnPathOf honours", () => {
  it("builds the path for a saved design in either language", () => {
    expect(returnPathOfDesign("ro", DESIGN_ID)).toBe(`/ro/d/${DESIGN_ID}`);
    expect(returnPathOfDesign("ru", DESIGN_ID)).toBe(`/ru/d/${DESIGN_ID}`);
  });

  it.each([null, undefined, "", "short", `${DESIGN_ID}!`])(
    "offers nothing for a design with no address (%s)",
    (designId) => {
      expect(returnPathOfDesign("ro", designId)).toBeUndefined();
    },
  );

  it("round-trips through returnPathOf", () => {
    for (const locale of ["ro", "ru"] as const) {
      const path = returnPathOfDesign(locale, DESIGN_ID);
      expect(returnPathOf(path)).toBe(path);
    }
  });
});

describe("loginPathWithReturn", () => {
  it("is the plain arrival without a way back", () => {
    expect(loginPathWithReturn("ro", "session-expired", undefined)).toBe(
      loginPathWithReason("ro", "session-expired"),
    );
  });

  it("appends the way back as one encoded query member after the reason", () => {
    const path = loginPathWithReturn(
      "ru",
      "session-expired",
      `/ru/d/${DESIGN_ID}`,
    );
    expect(path).toBe(
      `${loginPathWithReason("ru", "session-expired")}&returnTo=${encodeURIComponent(`/ru/d/${DESIGN_ID}`)}`,
    );
    const url = new URL(path, "https://lemnaria.example");
    expect(url.searchParams.get("reason")).toBe("session-expired");
    expect(url.searchParams.get("returnTo")).toBe(`/ru/d/${DESIGN_ID}`);
  });

  it("builds a path returnPathOf reads back to the same value", () => {
    const wanted = `/ro/d/${DESIGN_ID}`;
    const url = new URL(
      loginPathWithReturn("ro", "signed-out-everywhere", wanted),
      "https://lemnaria.example",
    );
    expect(returnPathOf(url.searchParams.get("returnTo") ?? undefined)).toBe(
      wanted,
    );
  });
});

describe("loginArrivalOf: a closed list of three reasons", () => {
  it.each([
    "session-expired",
    "signed-out-everywhere",
    "password-maybe-changed",
  ])("knows %s", (reason) => {
    expect(loginArrivalOf(reason)).toBe(reason);
  });

  it.each([
    ["no reason", undefined],
    ["an empty reason", ""],
    ["a repeated parameter", ["session-expired", "session-expired"]],
    ["a one-element array", ["session-expired"]],
    ["another case", "Session-Expired"],
    ["a trailing space", "session-expired "],
    ["a word outside the list", "password-changed"],
    ["a script", "<script>"],
    ["an object key", "constructor"],
    ["a prototype key", "__proto__"],
    ["a path", "../../etc/passwd"],
  ])("knows nothing of %s", (_, reason) => {
    expect(loginArrivalOf(reason)).toBeUndefined();
  });

  it("builds a path that loginArrivalOf reads back, for every reason and language", () => {
    for (const locale of ["ro", "ru"] as const) {
      for (const reason of [
        "session-expired",
        "signed-out-everywhere",
        "password-maybe-changed",
      ] as const) {
        const url = new URL(
          loginPathWithReason(locale, reason),
          "https://lemnaria.example",
        );
        expect(url.pathname.startsWith(`/${locale}/`)).toBe(true);
        expect(
          loginArrivalOf(url.searchParams.get("reason") ?? undefined),
        ).toBe(reason);
      }
    }
  });
});
