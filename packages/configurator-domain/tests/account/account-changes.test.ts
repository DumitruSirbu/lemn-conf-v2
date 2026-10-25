import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  countPasswordCharacters,
  readExistingPassword,
  validateEmailChange,
  validatePasswordChange,
  type EmailChangeValidation,
  type PasswordChangeValidation,
} from "../../src/account/index.js";

const ACCOUNT_EMAIL = "someone@example.md";
const GOOD_CURRENT = "the-current-password";
const GOOD_NEW = "a-brand-new-password";

function passwordChange(
  currentPassword: unknown,
  newPassword: unknown,
  accountEmail = ACCOUNT_EMAIL,
): PasswordChangeValidation {
  return validatePasswordChange({ currentPassword, newPassword, accountEmail });
}

function issueOf(validation: PasswordChangeValidation) {
  if (validation.ok) throw new Error("expected a refusal");
  return validation.issue;
}

function acceptedPasswordChange(validation: PasswordChangeValidation) {
  if (!validation.ok) {
    throw new Error(`expected acceptance, refused: ${validation.issue.code}`);
  }
  return validation;
}

describe("validatePasswordChange", () => {
  describe("a value that is not text is a field error on the field that held it", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 123456789012],
      ["an array", [GOOD_NEW]],
      ["an object", { password: GOOD_NEW }],
    ])("a current password that is %s", (_label, value) => {
      expect(issueOf(passwordChange(value, GOOD_NEW))).toEqual({
        field: "currentPassword",
        code: "PASSWORD_NOT_TEXT",
      });
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 123456789012],
      ["a boolean", true],
    ])("a new password that is %s", (_label, value) => {
      expect(issueOf(passwordChange(GOOD_CURRENT, value))).toEqual({
        field: "newPassword",
        code: "PASSWORD_NOT_TEXT",
      });
    });

    it("names the current password first when both are not text", () => {
      expect(issueOf(passwordChange(undefined, undefined)).field).toBe(
        "currentPassword",
      );
    });
  });

  describe("the new password is judged by the registration rule", () => {
    it("accepts the shortest, 12 characters, and refuses 11", () => {
      expect(PASSWORD_MIN_LENGTH).toBe(12);
      expect(
        acceptedPasswordChange(passwordChange(GOOD_CURRENT, "a".repeat(12))),
      ).toMatchObject({ newPassword: "a".repeat(12) });
      expect(issueOf(passwordChange(GOOD_CURRENT, "a".repeat(11)))).toEqual({
        field: "newPassword",
        code: "PASSWORD_TOO_SHORT",
      });
    });

    it("accepts the longest, 128 characters, and refuses 129", () => {
      expect(PASSWORD_MAX_LENGTH).toBe(128);
      expect(
        acceptedPasswordChange(passwordChange(GOOD_CURRENT, "a".repeat(128)))
          .newPassword,
      ).toBe("a".repeat(128));
      expect(issueOf(passwordChange(GOOD_CURRENT, "a".repeat(129)))).toEqual({
        field: "newPassword",
        code: "PASSWORD_TOO_LONG",
      });
    });

    it("refuses a huge value as too long without normalising it", () => {
      expect(
        issueOf(passwordChange(GOOD_CURRENT, "a".repeat(2_000_000))).code,
      ).toBe("PASSWORD_TOO_LONG");
    });

    it("counts code points after NFKC: 12 astral characters are long enough, 11 are not", () => {
      const astral = "\u{1F511}";

      expect(passwordChange(GOOD_CURRENT, astral.repeat(12)).ok).toBe(true);
      expect(
        issueOf(passwordChange(GOOD_CURRENT, astral.repeat(11))).code,
      ).toBe("PASSWORD_TOO_SHORT");
    });

    it("never trims: twelve spaces are a password", () => {
      expect(
        acceptedPasswordChange(passwordChange(GOOD_CURRENT, " ".repeat(12)))
          .newPassword,
      ).toBe(" ".repeat(12));
    });

    it("returns the NFKC form to hash", () => {
      const result = acceptedPasswordChange(
        passwordChange(GOOD_CURRENT, "ﬁve-and-twenty-keys"),
      );

      expect(result.newPassword).toBe("five-and-twenty-keys");
    });
  });

  describe("PASSWORD_IS_EMAIL applies to the new password only", () => {
    it("refuses a new password that is the account's address", () => {
      expect(issueOf(passwordChange(GOOD_CURRENT, ACCOUNT_EMAIL))).toEqual({
        field: "newPassword",
        code: "PASSWORD_IS_EMAIL",
      });
    });

    it.each([
      ["upper case", "SOMEONE@EXAMPLE.MD"],
      ["mixed case", "Someone@Example.md"],
      ["fullwidth characters (NFKC)", "someone\uFF20example.md"],
    ])("refuses the address in %s", (_label, typed) => {
      expect(issueOf(passwordChange(GOOD_CURRENT, typed)).code).toBe(
        "PASSWORD_IS_EMAIL",
      );
    });

    it("compares with the address as stored, whatever its case", () => {
      expect(
        issueOf(
          passwordChange(
            GOOD_CURRENT,
            "someone@example.md",
            "SOMEONE@Example.MD",
          ),
        ).code,
      ).toBe("PASSWORD_IS_EMAIL");
    });

    it("accepts an address that only contains the account's address", () => {
      expect(passwordChange(GOOD_CURRENT, `${ACCOUNT_EMAIL}-and-more`).ok).toBe(
        true,
      );
    });

    it("accepts a current password that equals the address: it exists, and may not lock the person out", () => {
      const result = acceptedPasswordChange(
        passwordChange(ACCOUNT_EMAIL, GOOD_NEW),
      );

      expect(result.currentPassword).toBe(ACCOUNT_EMAIL);
    });

    it("accepts the address as current and any other address-like new password", () => {
      expect(passwordChange(ACCOUNT_EMAIL, "other@example.md.x").ok).toBe(true);
    });
  });

  describe("no normalisation runs on a value far past the bound", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never normalises a new or a current password longer than eight times the maximum", () => {
      const normalisedLengths: number[] = [];
      const normalise = Reflect.get(String.prototype, "normalize") as (
        this: string,
        form?: string,
      ) => string;
      vi.spyOn(String.prototype, "normalize").mockImplementation(function (
        this: string,
        form?: string,
      ) {
        normalisedLengths.push(this.length);
        return normalise.call(this, form);
      });

      passwordChange("b".repeat(5_000), "a".repeat(5_000));

      expect(Math.max(0, ...normalisedLengths)).toBeLessThanOrEqual(
        PASSWORD_MAX_LENGTH * 8,
      );
    });
  });

  describe("the current password is verified, never judged as a new one", () => {
    it("returns its NFKC form for the hash comparison", () => {
      const result = acceptedPasswordChange(
        passwordChange("ﬁve-and-twenty-keys", GOOD_NEW),
      );

      expect(result.currentPassword).toBe("five-and-twenty-keys");
    });

    it.each([
      ["empty", ""],
      ["11 characters", "a".repeat(11)],
      ["129 characters", "a".repeat(129)],
      ["huge", "a".repeat(2_000_000)],
    ])(
      "one that is %s is a wrong password, not a field error: accepted with no current password to match",
      (_label, current) => {
        const result = acceptedPasswordChange(
          passwordChange(current, GOOD_NEW),
        );

        expect(result.currentPassword).toBeUndefined();
        expect(result.newPassword).toBe(GOOD_NEW);
      },
    );

    it("accepts the bounds, 12 and 128 characters, as passwords to match", () => {
      expect(
        acceptedPasswordChange(passwordChange("a".repeat(12), GOOD_NEW))
          .currentPassword,
      ).toBe("a".repeat(12));
      expect(
        acceptedPasswordChange(passwordChange("a".repeat(128), GOOD_NEW))
          .currentPassword,
      ).toBe("a".repeat(128));
    });

    it("does not refuse a new password for the current one's length", () => {
      expect(passwordChange("x", GOOD_NEW).ok).toBe(true);
    });

    it("allows the new password to equal the current one: that rule is the route's, not the domain's", () => {
      expect(passwordChange(GOOD_NEW, GOOD_NEW).ok).toBe(true);
    });
  });

  describe("when both are wrong, the first issue is the one returned", () => {
    it("a new password that is too short is reported although the current one is also short", () => {
      expect(issueOf(passwordChange("x", "y"))).toEqual({
        field: "newPassword",
        code: "PASSWORD_TOO_SHORT",
      });
    });

    it("a current password that is not text is reported before a bad new password", () => {
      expect(issueOf(passwordChange(5, "y")).field).toBe("currentPassword");
    });
  });

  it("answers an acceptance with exactly the two forms and a refusal with a field and a code", () => {
    expect(
      Object.keys(
        acceptedPasswordChange(passwordChange(GOOD_CURRENT, GOOD_NEW)),
      ).sort(),
    ).toEqual(["currentPassword", "newPassword", "ok"]);
    expect(
      Object.keys(issueOf(passwordChange(GOOD_CURRENT, "y"))).sort(),
    ).toEqual(["code", "field"]);
  });

  it("never echoes a password in a refusal", () => {
    const refusal = passwordChange(GOOD_CURRENT, "sec-short");

    expect(JSON.stringify(refusal)).not.toContain("sec-short");
  });

  describe("properties", () => {
    const anyPassword = fc.oneof(
      fc.string({ unit: "binary", maxLength: 200 }),
      fc.string({ maxLength: 200 }),
      fc.integer({ min: 0, max: 140 }).map((length) => "a".repeat(length)),
    );

    it("accepts a new password exactly when its NFKC length is 12 to 128 and it is not the address", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 20 }),
          anyPassword,
          (email, value) => {
            const result = passwordChange(GOOD_CURRENT, value, email);
            const length = countPasswordCharacters(value);
            const isTheAddress =
              value.normalize("NFKC").toLowerCase() ===
              email.normalize("NFKC").toLowerCase();
            const shouldAccept =
              length >= PASSWORD_MIN_LENGTH &&
              length <= PASSWORD_MAX_LENGTH &&
              !isTheAddress;

            expect(result.ok).toBe(shouldAccept);
          },
        ),
        { numRuns: 2000 },
      );
    });

    it("the current password's form is exactly what `readExistingPassword` gives, or absent when that refuses", () => {
      fc.assert(
        fc.property(anyPassword, (current) => {
          const result = acceptedPasswordChange(
            passwordChange(current, GOOD_NEW),
          );
          const reading = readExistingPassword(current);

          expect(result.currentPassword).toBe(
            reading.ok ? reading.password : undefined,
          );
        }),
        { numRuns: 1000 },
      );
    });
  });
});

describe("readExistingPassword: the form verified against a stored hash", () => {
  it("applies the same bounds and NFKC form as choosing a password", () => {
    expect(readExistingPassword("a".repeat(11))).toEqual({
      ok: false,
      code: "PASSWORD_TOO_SHORT",
    });
    expect(readExistingPassword("a".repeat(129))).toEqual({
      ok: false,
      code: "PASSWORD_TOO_LONG",
    });
    expect(readExistingPassword("ﬁve-and-twenty-keys")).toEqual({
      ok: true,
      password: "five-and-twenty-keys",
    });
  });

  it("has no email rule: it takes no address to compare with", () => {
    expect(readExistingPassword(ACCOUNT_EMAIL)).toEqual({
      ok: true,
      password: ACCOUNT_EMAIL,
    });
    expect(readExistingPassword.length).toBe(1);
  });
});

function emailChange(
  newEmail: unknown,
  accountEmail = ACCOUNT_EMAIL,
): EmailChangeValidation {
  return validateEmailChange({ newEmail, accountEmail });
}

function acceptedEmailChange(validation: EmailChangeValidation) {
  if (!validation.ok) {
    throw new Error(`expected acceptance, refused: ${validation.issue.code}`);
  }
  return validation;
}

describe("validateEmailChange", () => {
  it("accepts a free address with its normal form, and says it is not the current one", () => {
    expect(emailChange("new.address@example.md")).toEqual({
      ok: true,
      email: "new.address@example.md",
      emailNormalForm: "new.address@example.md",
      isCurrentAddress: false,
    });
  });

  it("keeps the address as typed and trims it, and counts it lower-cased", () => {
    expect(emailChange("  New.Address@Example.MD  ")).toEqual({
      ok: true,
      email: "New.Address@Example.MD",
      emailNormalForm: "new.address@example.md",
      isCurrentAddress: false,
    });
  });

  describe("naming the caller's own address is not a refusal", () => {
    it("is recognised by the normal form, whatever the case or padding typed", () => {
      for (const typed of [
        ACCOUNT_EMAIL,
        "SOMEONE@EXAMPLE.MD",
        "  Someone@Example.md ",
      ]) {
        expect(acceptedEmailChange(emailChange(typed)).isCurrentAddress).toBe(
          true,
        );
      }
    });

    it("is recognised when the stored address has a different case from the typed one", () => {
      expect(
        acceptedEmailChange(
          emailChange("someone@example.md", "Someone@EXAMPLE.md"),
        ).isCurrentAddress,
      ).toBe(true);
    });

    it("is not claimed for a different address, a plus-alias or a longer one", () => {
      for (const typed of [
        "someone2@example.md",
        "someone+tag@example.md",
        "someone@example.md.ro",
        "xsomeone@example.md",
      ]) {
        expect(acceptedEmailChange(emailChange(typed)).isCurrentAddress).toBe(
          false,
        );
      }
    });
  });

  describe("an address that is not one is refused with the address rule's code", () => {
    it.each([
      ["undefined", undefined, "REQUIRED"],
      ["the empty string", "", "REQUIRED"],
      ["spaces", "   ", "REQUIRED"],
      ["a number", 5, "NOT_TEXT"],
      ["null", null, "NOT_TEXT"],
      ["an array", ["a@b.md"], "NOT_TEXT"],
      ["no at sign", "someone.example.md", "MALFORMED"],
      ["no domain", "someone@", "MALFORMED"],
      ["two at signs", "a@b@example.md", "MALFORMED"],
      ["a newline", "some\none@example.md", "FORBIDDEN_CHARACTER"],
      ["a NUL", "some\u0000one@example.md", "FORBIDDEN_CHARACTER"],
      ["more than 254 characters", `${"a".repeat(250)}@example.md`, "TOO_LONG"],
    ])("%s", (_label, typed, code) => {
      expect(emailChange(typed)).toEqual({
        ok: false,
        issue: { field: "newEmail", code },
      });
    });

    it("never echoes the address in a refusal", () => {
      expect(
        JSON.stringify(emailChange("secret-not-an-address")),
      ).not.toContain("secret");
    });
  });

  it("removes a format character before judging, so it cannot make two addresses differ", () => {
    const withMark = acceptedEmailChange(
      emailChange("some\u200Bone@example.md"),
    );

    expect(withMark.email).toBe(ACCOUNT_EMAIL);
    expect(withMark.isCurrentAddress).toBe(true);
  });

  describe("properties", () => {
    it("the normal form is the lower-cased address, and is the identity of the account", () => {
      fc.assert(
        fc.property(fc.emailAddress(), (typed) => {
          const result = emailChange(typed, "unrelated@example.org");
          fc.pre(result.ok);

          expect(result.emailNormalForm).toBe(result.email.toLowerCase());
          expect(
            acceptedEmailChange(emailChange(typed.toUpperCase(), typed))
              .isCurrentAddress,
          ).toBe(true);
        }),
        { numRuns: 500 },
      );
    });
  });
});
