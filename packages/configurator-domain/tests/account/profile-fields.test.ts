import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  PROFILE_ADDRESS_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  validateProfileText,
  type ProfileTextChanges,
  type ProfileTextIssue,
} from "../../src/account/index.js";

const MOLDOVAN_PHONE_AS_TYPED = "079 123 456";
const MOLDOVAN_PHONE_NORMAL_FORM = "+37379123456";

function changesOf(input: unknown): ProfileTextChanges {
  const validation = validateProfileText(input);
  if (!validation.ok) {
    throw new Error(
      `expected a valid request, refused: ${JSON.stringify(validation.issues)}`,
    );
  }
  return validation.changes;
}

function issuesOf(input: unknown): readonly ProfileTextIssue[] {
  const validation = validateProfileText(input);
  if (validation.ok) throw new Error("expected a refusal");
  return validation.issues;
}

describe("validateProfileText: the optional details a person keeps", () => {
  it("bounds the name and the address at the contact form's 100 characters", () => {
    expect(PROFILE_NAME_MAX_LENGTH).toBe(100);
    expect(PROFILE_ADDRESS_MAX_LENGTH).toBe(100);
  });

  describe("a request that is not an object is refused, and is not a request to change nothing", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a string", "name=Ana"],
      ["a number", 7],
      ["a boolean", true],
      ["an array", []],
      ["an array holding an object", [{ name: "Ana" }]],
      ["a Date", new Date(0)],
      ["a Map", new Map()],
      ["an object with a polluted prototype", Object.create({ name: "Ana" })],
    ])("%s", (_label, input) => {
      expect(validateProfileText(input)).toEqual({
        ok: false,
        issues: [{ field: "body", code: "NOT_AN_OBJECT" }],
      });
    });

    it("accepts a null-prototype object, which is plain data", () => {
      const body = Object.assign(Object.create(null) as object, {
        name: "Ana",
      });

      expect(changesOf(body)).toEqual({ name: "Ana" });
    });
  });

  describe("an absent member leaves its field alone; only a named member is a key of `changes`", () => {
    it("an empty object changes nothing", () => {
      expect(changesOf({})).toEqual({});
      expect(Object.keys(changesOf({}))).toEqual([]);
    });

    it("an explicit undefined is absent", () => {
      expect(
        Object.keys(
          changesOf({ name: undefined, address: undefined, phone: undefined }),
        ),
      ).toEqual([]);
    });

    it("names exactly the fields the request named", () => {
      expect(Object.keys(changesOf({ name: "Ana" }))).toEqual(["name"]);
      expect(Object.keys(changesOf({ address: "Zürich" }))).toEqual([
        "address",
      ]);
      expect(Object.keys(changesOf({ phone: "" }))).toEqual(["phone"]);
    });
  });

  describe("an empty member clears the field", () => {
    it.each(["", "   ", "\u200B", " \u00A0 "])(
      "name %j is stored as the empty string, which the store turns into null",
      (name) => {
        expect(changesOf({ name })).toEqual({ name: "" });
      },
    );

    it("clears the address the same way", () => {
      expect(changesOf({ address: "" })).toEqual({ address: "" });
    });

    it('`phone: ""` clears both phone columns together', () => {
      expect(changesOf({ phone: "" })).toEqual({
        phone: { phone: null, phoneNormalForm: null },
      });
      expect(changesOf({ phone: "   " })).toEqual({
        phone: { phone: null, phoneNormalForm: null },
      });
    });
  });

  describe("a given value is stored in its read form", () => {
    it("trims and composes a name and an address", () => {
      expect(
        changesOf({ name: "  Ana\u200B Popescu ", address: " Cala\u0301ras " }),
      ).toEqual({ name: "Ana Popescu", address: "Caláras" });
    });

    it("sets the phone as typed and its normal form together", () => {
      expect(changesOf({ phone: ` ${MOLDOVAN_PHONE_AS_TYPED} ` })).toEqual({
        phone: {
          phone: MOLDOVAN_PHONE_AS_TYPED,
          phoneNormalForm: MOLDOVAN_PHONE_NORMAL_FORM,
        },
      });
    });

    it("reads one subscriber written two ways as one normal form", () => {
      const international = changesOf({ phone: "+373 79 123 456" }).phone;

      expect(international?.phoneNormalForm).toBe(MOLDOVAN_PHONE_NORMAL_FORM);
    });
  });

  describe("the bounds", () => {
    it("accepts a name of 100 characters and refuses 101", () => {
      expect(changesOf({ name: "a".repeat(100) })).toEqual({
        name: "a".repeat(100),
      });
      expect(issuesOf({ name: "a".repeat(101) })).toEqual([
        { field: "name", code: "TOO_LONG" },
      ]);
    });

    it("accepts an address of 100 characters and refuses 101", () => {
      expect(changesOf({ address: "ü".repeat(100) })).toEqual({
        address: "ü".repeat(100),
      });
      expect(issuesOf({ address: "ü".repeat(101) })).toEqual([
        { field: "address", code: "TOO_LONG" },
      ]);
    });

    it("counts an astral character once", () => {
      expect(changesOf({ name: "\u{1F373}".repeat(100) }).name).toBe(
        "\u{1F373}".repeat(100),
      );
      expect(issuesOf({ name: "\u{1F373}".repeat(101) })).toEqual([
        { field: "name", code: "TOO_LONG" },
      ]);
    });

    it("keeps within the database's backstops of 120 and 200", () => {
      const longestName = changesOf({ name: "a".repeat(100) }).name ?? "";
      const longestAddress = changesOf({ address: "a".repeat(100) }).address;

      expect(longestName.length).toBeLessThanOrEqual(120);
      expect((longestAddress ?? "").length).toBeLessThanOrEqual(200);
    });
  });

  describe("a member of the wrong type or with a forbidden character is refused with a code", () => {
    it.each([
      ["a null name", { name: null }, "name", "NOT_TEXT"],
      ["a numeric name", { name: 5 }, "name", "NOT_TEXT"],
      ["an array address", { address: ["x"] }, "address", "NOT_TEXT"],
      ["a null phone", { phone: null }, "phone", "NOT_TEXT"],
      ["a numeric phone", { phone: 79123456 }, "phone", "NOT_TEXT"],
      [
        "a name with a newline",
        { name: "A\nB" },
        "name",
        "FORBIDDEN_CHARACTER",
      ],
      [
        "an address with a NUL",
        { address: "A\u0000B" },
        "address",
        "FORBIDDEN_CHARACTER",
      ],
      [
        "a phone with a tab",
        { phone: "079\t123 456" },
        "phone",
        "FORBIDDEN_CHARACTER",
      ],
      [
        "a malformed phone",
        { phone: "abc" },
        "phone",
        "PHONE_FORMAT_UNRECOGNISED",
      ],
      [
        "a short Moldovan phone",
        { phone: "079 123" },
        "phone",
        "PHONE_MOLDOVAN_INCOMPLETE",
      ],
    ])("%s", (_label, input, field, code) => {
      expect(issuesOf(input)).toEqual([{ field, code }]);
    });
  });

  describe("every issue is returned, in the order name, address, phone", () => {
    it("whatever order the request lists them in", () => {
      const issues = issuesOf({ phone: "abc", address: 3, name: null });

      expect(issues.map((issue) => issue.field)).toEqual([
        "name",
        "address",
        "phone",
      ]);
    });

    it("does not return the changes of the fields that were fine", () => {
      const validation = validateProfileText({ name: "Ana", address: 3 });

      expect(validation).toEqual({
        ok: false,
        issues: [{ field: "address", code: "NOT_TEXT" }],
      });
    });
  });

  describe("a request cannot change anything but name, address and phone", () => {
    it("ignores e-mail, role, account id, password hash and the normal form", () => {
      const changes = changesOf({
        name: "Ana",
        email: "attacker@example.md",
        emailNormalForm: "attacker@example.md",
        role: "administrator",
        id: "x".repeat(21),
        accountId: "x".repeat(21),
        passwordHash: "$argon2id$",
        phoneNormalForm: "+37300000000",
        emailVerifiedAt: "2026-01-01",
      });

      expect(changes).toEqual({ name: "Ana" });
    });

    it("ignores an own `__proto__` member", () => {
      const body: unknown = JSON.parse(
        '{"__proto__": {"name": "evil"}, "address": "Orhei"}',
      );

      expect(changesOf(body)).toEqual({ address: "Orhei" });
    });

    describe("and reads only members the sender's object holds itself", () => {
      afterEach(() => {
        Reflect.deleteProperty(Object.prototype, "name");
        Reflect.deleteProperty(Object.prototype, "address");
        Reflect.deleteProperty(Object.prototype, "phone");
      });

      it("a polluted Object.prototype names no field of an empty request", () => {
        Object.defineProperty(Object.prototype, "name", {
          value: "polluted",
          configurable: true,
        });
        Object.defineProperty(Object.prototype, "address", {
          value: "polluted",
          configurable: true,
        });
        Object.defineProperty(Object.prototype, "phone", {
          value: "polluted",
          configurable: true,
        });

        expect(changesOf({})).toEqual({});
      });
    });
  });

  it("answers a refusal with a field and a code, never the value", () => {
    const issues = issuesOf({ name: "secret\nname" });

    expect(JSON.stringify(issues)).not.toContain("secret");
    expect(Object.keys(issues[0] ?? {}).sort()).toEqual(["code", "field"]);
  });

  describe("properties over arbitrary requests", () => {
    const anyMember = fc.oneof(
      fc.string({ unit: "binary", maxLength: 140 }),
      fc.string({ maxLength: 140 }),
      fc.constantFrom(
        "",
        " ",
        "079 123 456",
        "+37379123456",
        "+1 202 555 0100",
      ),
      fc.anything(),
    );
    const anyRequest = fc.record(
      { name: anyMember, address: anyMember, phone: anyMember },
      { requiredKeys: [] },
    );

    it("is deterministic and never throws", () => {
      fc.assert(
        fc.property(anyRequest, (request) => {
          expect(validateProfileText(request)).toEqual(
            validateProfileText(request),
          );
        }),
        { numRuns: 1000 },
      );
    });

    it("writes the two phone columns only together: both text or both null", () => {
      fc.assert(
        fc.property(anyRequest, (request) => {
          const validation = validateProfileText(request);
          fc.pre(validation.ok);
          const { phone } = validation.changes;
          if (phone === undefined) return;

          expect(phone.phone === null).toBe(phone.phoneNormalForm === null);
          if (phone.phoneNormalForm !== null) {
            expect(phone.phoneNormalForm).toMatch(/^\+[1-9][0-9]{6,14}$/);
          }
        }),
        { numRuns: 1500 },
      );
    });

    it("has a key in `changes` for exactly the members that were present and not undefined", () => {
      fc.assert(
        fc.property(anyRequest, (request) => {
          const validation = validateProfileText(request);
          fc.pre(validation.ok);
          const named = (["name", "address", "phone"] as const).filter(
            (field) => request[field] !== undefined,
          );

          expect(Object.keys(validation.changes).sort()).toEqual(
            [...named].sort(),
          );
        }),
        { numRuns: 1500 },
      );
    });

    it("never accepts a name or an address that is over its bound or holds a control character", () => {
      fc.assert(
        fc.property(anyRequest, (request) => {
          const validation = validateProfileText(request);
          fc.pre(validation.ok);
          const { name, address } = validation.changes;

          for (const text of [name, address]) {
            if (text === undefined) continue;
            expect(Array.from(text).length).toBeLessThanOrEqual(100);
            expect(text).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u);
            expect(text).toBe(text.trim());
          }
        }),
        { numRuns: 1500 },
      );
    });
  });
});
