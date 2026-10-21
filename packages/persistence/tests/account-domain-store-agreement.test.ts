import { fc } from "@fast-check/vitest";
import {
  judgeAccountEmail,
  validateEmailChange,
  validateProfileText,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  requireValidEmailChangeTokenToIssue,
  requireValidProfileUpdate,
} from "../src/account-store.js";

/**
 * What the domain accepts, the store must be able to write: a request that passed validation and is then refused by a
 * store guard is a 500 for a person who did nothing wrong. Each property runs the domain's judgement over arbitrary
 * input and hands the accepted result to the store's own guard (the one the table's checks mirror).
 */
const ACCOUNT_ID = "A".repeat(21);
const SHA256_HEX = "b".repeat(64);
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const FAR_FUTURE = new Date("2099-01-01T00:00:00Z");

const anyText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 130 }),
  fc.string({ maxLength: 130 }),
  fc.constantFrom(
    "",
    " ",
    "079 123 456",
    "+37379123456",
    "+1 202 555 0100",
    "\u200b",
  ),
);

describe("a profile the domain accepts is a profile the store accepts", () => {
  it("for any name, address and phone", () => {
    fc.assert(
      fc.property(anyText, anyText, anyText, (name, address, phone) => {
        const validation = validateProfileText({ name, address, phone });
        fc.pre(validation.ok);

        expect(() => {
          requireValidProfileUpdate({
            accountId: ACCOUNT_ID,
            changes: validation.changes,
          });
        }).not.toThrow();
      }),
      { numRuns: 3000 },
    );
  });

  it("including the longest the domain allows (100 code points of the widest character)", () => {
    const widest = "\u{1F373}".repeat(100);
    const validation = validateProfileText({ name: widest, address: widest });

    expect(validation.ok).toBe(true);
    expect(() => {
      requireValidProfileUpdate({
        accountId: ACCOUNT_ID,
        changes: validation.ok ? validation.changes : {},
      });
    }).not.toThrow();
  });
});

describe("an e-mail change the domain accepts is one the store accepts", () => {
  it("for any address, the address and its normal form fit 3 to 254 characters", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.emailAddress(), fc.string({ maxLength: 300 })),
        (typed) => {
          const validation = validateEmailChange({
            newEmail: typed,
            accountEmail: "someone@example.md",
          });
          fc.pre(validation.ok);

          expect(() => {
            requireValidEmailChangeTokenToIssue({
              accountId: ACCOUNT_ID,
              verifiedPasswordHash: PASSWORD_HASH,
              newEmail: validation.email,
              newEmailNormalForm: validation.emailNormalForm,
              tokenHash: SHA256_HEX,
              expiresAt: FAR_FUTURE,
            });
          }).not.toThrow();
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("including the longest address the domain allows, 254 characters", () => {
    const longest = `${"a".repeat(64)}@${["b".repeat(63), "c".repeat(63), "d".repeat(58), "md"].join(".")}`;
    const validation = validateEmailChange({
      newEmail: longest,
      accountEmail: "someone@example.md",
    });

    expect(longest).toHaveLength(254);
    expect(validation.ok).toBe(true);
    expect(() => {
      requireValidEmailChangeTokenToIssue({
        accountId: ACCOUNT_ID,
        verifiedPasswordHash: PASSWORD_HASH,
        newEmail: validation.ok ? validation.email : "",
        newEmailNormalForm: validation.ok ? validation.emailNormalForm : "",
        tokenHash: SHA256_HEX,
        expiresAt: FAR_FUTURE,
      });
    }).not.toThrow();
  });

  it("agrees with the registration's normal form for the same address", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (typed) => {
        const change = validateEmailChange({
          newEmail: typed,
          accountEmail: "someone@example.md",
        });
        const registration = judgeAccountEmail(typed);
        fc.pre(change.ok && registration.ok);

        expect(change.emailNormalForm).toBe(registration.emailNormalForm);
      }),
      { numRuns: 500 },
    );
  });
});
