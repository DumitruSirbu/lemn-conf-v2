import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import { FakeAccountKitchenStore } from "../src/fake-account-kitchen-store.js";
import {
  describeAccountKitchenNotesContract,
  type NotesWorld,
  type StaffWriter,
} from "./support/account-kitchen-export-notes-contract.js";

/** `FakeAccountKitchenStore.exportNotes` against the contract `NeonAccountKitchenStore` also passes, live. */
const PROPERTY_RUNS = 200;

function newFakeWorld(): Promise<NotesWorld> {
  const store = new FakeAccountKitchenStore();
  return Promise.resolve({
    store,
    aClient: () => Promise.resolve(nanoid()),
    aStaffWriter(): Promise<StaffWriter> {
      const accountId = nanoid();
      return Promise.resolve({
        accountId,
        email: `staff-${accountId}@staff-shop.example`,
        name: `Staff Name ${accountId}`,
      });
    },
    aKitchen(spec): Promise<DesignId> {
      const id = nanoid();
      const marked = new Date();
      store.seed({
        id,
        accountId: spec.accountId,
        design: KITCHEN_L_DESIGN,
        ...(spec.isHidden === true ? { hiddenAt: marked } : {}),
        ...(spec.isDeletedByClient === true ? { deletedAt: marked } : {}),
      });
      return Promise.resolve(id);
    },
    aNote(spec): Promise<string> {
      const id = spec.id ?? nanoid();
      store.seedNote({
        id,
        designId: spec.designId,
        authorAccountId: spec.author.accountId,
        text: spec.text,
        createdAt: spec.createdAt,
      });
      return Promise.resolve(id);
    },
    someNotes(spec): Promise<void> {
      for (let index = 0; index < spec.count; index += 1) {
        store.seedNote({
          designId: spec.designId,
          authorAccountId: spec.author.accountId,
          text: spec.text ?? `note ${String(index)}`,
          createdAt: new Date(spec.firstAt.getTime() + index * 60_000),
        });
      }
      return Promise.resolve();
    },
  });
}

describeAccountKitchenNotesContract("FakeAccountKitchenStore", newFakeWorld, {
  propertyRuns: PROPERTY_RUNS,
});
