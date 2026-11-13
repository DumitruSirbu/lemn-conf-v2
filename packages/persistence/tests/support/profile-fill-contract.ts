import type { ProfileFill } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { AccountStore } from "../../src/account-store.js";
import type { HeldProfileColumns } from "../../src/fake-account-store.js";

/**
 * What `fillProfileBlanks` does, stated once for the in-memory fake and for the database, so the two cannot drift. Every
 * field of every fixture holds a value of its own, so a swapped pair of columns shows.
 */
export interface HeldPhone {
  readonly entered: string;
  readonly normalForm: string;
}

export interface ProfileSeed {
  readonly name: string | null;
  readonly address: string | null;
  readonly phone: HeldPhone | null;
}

export interface ProfileFillWorld {
  readonly store: Pick<AccountStore, "fillProfileBlanks" | "updateProfile">;
  anAccount(seed: ProfileSeed): Promise<string>;
  columnsOf(accountId: string): Promise<HeldProfileColumns>;
}

const BLANK: ProfileSeed = { name: null, address: null, phone: null };
const HELD_PHONE: HeldPhone = {
  entered: "078 111 222",
  normalForm: "+37378111222",
};

export const REQUEST_FILL: ProfileFill = {
  name: "Request Typed Name",
  address: "Request Typed Locality",
  phone: { entered: "069 000 111", normalForm: "+37369000111" },
};

const WITHOUT_LOCALITY: ProfileFill = { ...REQUEST_FILL, address: undefined };

export function describeProfileFillContract(
  suiteName: string,
  makeWorld: () => ProfileFillWorld,
): void {
  describe(suiteName, () => {
    it("fills each blank column from the request, the phone pair in its entered and normal forms", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount(BLANK);

      const outcome = await world.store.fillProfileBlanks({
        accountId,
        fill: REQUEST_FILL,
      });

      expect(outcome).toEqual({ kind: "filled" });
      expect(await world.columnsOf(accountId)).toEqual({
        name: "Request Typed Name",
        address: "Request Typed Locality",
        phone: "069 000 111",
        phoneNormalForm: "+37369000111",
      });
    });

    it("fills only the blanks: a held name stays, a blank address and phone are written", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount({ ...BLANK, name: "Held Name" });

      await world.store.fillProfileBlanks({ accountId, fill: REQUEST_FILL });

      expect(await world.columnsOf(accountId)).toEqual({
        name: "Held Name",
        address: "Request Typed Locality",
        phone: "069 000 111",
        phoneNormalForm: "+37369000111",
      });
    });

    it("leaves every column byte-identical when all are held, and says nothing was filled", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount({
        name: "Held Name",
        address: "Held Address",
        phone: HELD_PHONE,
      });
      const before = await world.columnsOf(accountId);

      const outcome = await world.store.fillProfileBlanks({
        accountId,
        fill: REQUEST_FILL,
      });

      expect(outcome).toEqual({ kind: "nothing-to-fill" });
      expect(await world.columnsOf(accountId)).toEqual(before);
    });

    it("writes neither phone column when a phone is held, while a blank name is still filled", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount({
        name: null,
        address: "Held Address",
        phone: HELD_PHONE,
      });

      const outcome = await world.store.fillProfileBlanks({
        accountId,
        fill: REQUEST_FILL,
      });

      expect(outcome).toEqual({ kind: "filled" });
      expect(await world.columnsOf(accountId)).toEqual({
        name: "Request Typed Name",
        address: "Held Address",
        phone: "078 111 222",
        phoneNormalForm: "+37378111222",
      });
    });

    it("writes both phone columns when the phone is the only blank", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount({
        name: "Held Name",
        address: "Held Address",
        phone: null,
      });

      const outcome = await world.store.fillProfileBlanks({
        accountId,
        fill: REQUEST_FILL,
      });

      expect(outcome).toEqual({ kind: "filled" });
      expect(await world.columnsOf(accountId)).toEqual({
        name: "Held Name",
        address: "Held Address",
        phone: "069 000 111",
        phoneNormalForm: "+37369000111",
      });
    });

    it("an absent locality leaves a blank address null, never an empty string, and a held address as it was", async () => {
      const world = makeWorld();
      const blankAddress = await world.anAccount(BLANK);
      const heldAddress = await world.anAccount({
        ...BLANK,
        address: "Held Address",
      });

      await world.store.fillProfileBlanks({
        accountId: blankAddress,
        fill: WITHOUT_LOCALITY,
      });
      await world.store.fillProfileBlanks({
        accountId: heldAddress,
        fill: WITHOUT_LOCALITY,
      });

      expect((await world.columnsOf(blankAddress)).address).toBeNull();
      expect((await world.columnsOf(heldAddress)).address).toBe("Held Address");
    });

    it("keeps a value another request saved a moment before: a saved profile is not overwritten by the fill", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount(BLANK);
      await world.store.updateProfile({
        accountId,
        changes: {
          name: "Saved In Another Tab",
          phone: { phone: "079 555 666", phoneNormalForm: "+37379555666" },
        },
      });

      await world.store.fillProfileBlanks({ accountId, fill: REQUEST_FILL });

      expect(await world.columnsOf(accountId)).toEqual({
        name: "Saved In Another Tab",
        address: "Request Typed Locality",
        phone: "079 555 666",
        phoneNormalForm: "+37379555666",
      });
    });

    it("writes the same values when repeated: the second answer is nothing to fill", async () => {
      const world = makeWorld();
      const accountId = await world.anAccount(BLANK);
      await world.store.fillProfileBlanks({ accountId, fill: REQUEST_FILL });
      const afterFirst = await world.columnsOf(accountId);

      const second = await world.store.fillProfileBlanks({
        accountId,
        fill: { ...REQUEST_FILL, name: "A Different Name" },
      });

      expect(second).toEqual({ kind: "nothing-to-fill" });
      expect(await world.columnsOf(accountId)).toEqual(afterFirst);
    });

    it("writes only the account it is handed, and leaves a neighbour's blanks blank", async () => {
      const world = makeWorld();
      const filled = await world.anAccount(BLANK);
      const neighbour = await world.anAccount(BLANK);

      await world.store.fillProfileBlanks({
        accountId: filled,
        fill: REQUEST_FILL,
      });

      expect(await world.columnsOf(neighbour)).toEqual({
        name: null,
        address: null,
        phone: null,
        phoneNormalForm: null,
      });
    });

    it("answers nothing to fill for an account that does not exist", async () => {
      const world = makeWorld();

      const outcome = await world.store.fillProfileBlanks({
        accountId: "Z".repeat(21),
        fill: REQUEST_FILL,
      });

      expect(outcome).toEqual({ kind: "nothing-to-fill" });
    });
  });
}
