import { fc } from "@fast-check/vitest";
import {
  profileFillOf,
  validateContactFields,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FakeAccountStore } from "../src/fake-account-store.js";

/** `fillProfileBlanks` against a model of every held/blank combination, over accepted requests (ADR 0179 d2). */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const RUNS = 1500;
const MIN_PER_ARM = 40;
const HELD = {
  // eslint-disable-next-line no-restricted-syntax -- the letter is the input under test: a held value is kept whatever its letters
  name: "Held Name ș",
  address: "Held Address",
  phone: { entered: "078 111 222", normalForm: "+37378111222" },
} as const;

interface Held {
  readonly hasName: boolean;
  readonly hasAddress: boolean;
  readonly hasPhone: boolean;
}

const heldArbitrary: fc.Arbitrary<Held> = fc.record({
  hasName: fc.boolean(),
  hasAddress: fc.boolean(),
  hasPhone: fc.boolean(),
});

const typedText = fc.oneof(
  fc.constantFrom(
    "Ana",
    "  Ion  ",
    // eslint-disable-next-line no-restricted-syntax -- the letter is the input under test: the fill must write every letter the form accepts
    "Ștefan",
    "\u{1F373}".repeat(100),
    "",
  ),
  fc.string({ unit: "grapheme", maxLength: 100 }),
);
const typedPhone = fc.constantFrom(
  "069 000 111",
  "+37369000111",
  " 069-000-111 ",
  "+1 202 555 0100",
);

async function aHeldAccount(held: Held): Promise<{
  store: FakeAccountStore;
  accountId: string;
}> {
  const store = new FakeAccountStore();
  const email = "model@example.invalid";
  const created = await store.createUnverified({
    email,
    emailNormalForm: email,
    phone: held.hasPhone ? { ...HELD.phone } : undefined,
    locale: "ro",
    privacyNoticeVersion: "2026-10-draft",
    passwordHash: PASSWORD_HASH,
  });
  if (created.kind !== "created") throw new Error("the address was taken");
  await store.updateProfile({
    accountId: created.accountId,
    changes: {
      ...(held.hasName ? { name: HELD.name } : {}),
      ...(held.hasAddress ? { address: HELD.address } : {}),
    },
  });
  return { store, accountId: created.accountId };
}

describe("fillProfileBlanks over every held and blank combination and every request the contact domain accepts", () => {
  it("sets exactly the blanks, keeps every held byte, pairs the phone, never writes an empty address, and is idempotent", async () => {
    const arms = {
      addressOffered: 0,
      addressWithheld: 0,
      nothingBlank: 0,
      allBlank: 0,
    };

    await fc.assert(
      fc.asyncProperty(
        heldArbitrary,
        typedText,
        typedText,
        typedPhone,
        async (held, name, locality, phone) => {
          const validation = validateContactFields({
            name,
            phone,
            locality,
            channel: "phone",
            consent: true,
            consentTextVersion: "placeholder",
          });
          fc.pre(validation.ok);
          const fill = profileFillOf(validation.contact);
          const { store, accountId } = await aHeldAccount(held);

          const first = await store.fillProfileBlanks({ accountId, fill });
          const after = store.heldProfileOf(accountId);
          const second = await store.fillProfileBlanks({ accountId, fill });

          const expectedName = held.hasName ? HELD.name : fill.name;
          const expectedAddress = held.hasAddress
            ? HELD.address
            : (fill.address ?? null);
          const expectedPhone = held.hasPhone ? HELD.phone : fill.phone;
          expect(after).toEqual({
            name: expectedName,
            address: expectedAddress,
            phone: expectedPhone.entered,
            phoneNormalForm: expectedPhone.normalForm,
          });
          expect(after?.address).not.toBe("");
          expect(
            (after?.phone === null) === (after?.phoneNormalForm === null),
          ).toBe(true);
          const hadABlankToFill =
            !held.hasName ||
            !held.hasPhone ||
            (!held.hasAddress && fill.address !== undefined);
          expect(first.kind).toBe(
            hadABlankToFill ? "filled" : "nothing-to-fill",
          );
          expect(second).toEqual({ kind: "nothing-to-fill" });
          expect(store.heldProfileOf(accountId)).toEqual(after);

          if (!held.hasAddress && fill.address !== undefined)
            arms.addressOffered += 1;
          if (!held.hasAddress && fill.address === undefined)
            arms.addressWithheld += 1;
          if (held.hasName && held.hasAddress && held.hasPhone)
            arms.nothingBlank += 1;
          if (!held.hasName && !held.hasAddress && !held.hasPhone)
            arms.allBlank += 1;
        },
      ),
      { numRuns: RUNS },
    );

    expect(arms.addressOffered).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(arms.addressWithheld).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(arms.nothingBlank).toBeGreaterThanOrEqual(MIN_PER_ARM);
    expect(arms.allBlank).toBeGreaterThanOrEqual(MIN_PER_ARM);
  });

  it("writes only the account it is handed: every other account is byte-identical afterwards", async () => {
    const { store, accountId } = await aHeldAccount({
      hasName: false,
      hasAddress: false,
      hasPhone: false,
    });
    const other = await store.createUnverified({
      email: "other@example.invalid",
      emailNormalForm: "other@example.invalid",
      phone: undefined,
      locale: "ro",
      privacyNoticeVersion: "2026-10-draft",
      passwordHash: PASSWORD_HASH,
    });
    if (other.kind !== "created") throw new Error("the address was taken");
    const otherBefore = store.heldProfileOf(other.accountId);

    await store.fillProfileBlanks({
      accountId,
      fill: {
        name: "N",
        address: "A",
        phone: { entered: "069 000 111", normalForm: "+37369000111" },
      },
    });

    expect(store.heldProfileOf(other.accountId)).toEqual(otherBefore);
  });
});
