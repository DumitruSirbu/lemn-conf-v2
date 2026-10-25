import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FakeConfigurationRepository } from "../src/fake-configuration-repository.js";
import { FakeAccountKitchenStore } from "../src/fake-account-kitchen-store.js";

/**
 * S4 on the fake (ADR 0172 D9): a design its client hid or deleted answers as an unknown id does, on load and on save,
 * and a save that is refused writes nothing. The marks are the instants `FakeAccountKitchenStore` holds.
 */
const MARKED_AT = new Date("2026-10-19T09:00:00.000Z");

async function repositoryHolding(): Promise<{
  repository: FakeConfigurationRepository;
  id: string;
}> {
  const repository = new FakeConfigurationRepository();
  const id = await repository.save(null, KITCHEN_L_DESIGN);
  return { repository, id };
}

describe("FakeConfigurationRepository.markByClient", () => {
  it.each([
    ["hidden", { hiddenAt: MARKED_AT }],
    ["deleted", { deletedAt: MARKED_AT }],
    ["hidden and deleted", { hiddenAt: MARKED_AT, deletedAt: MARKED_AT }],
  ])(
    "a design the client %s is refused on load with the error an unknown id gets",
    async (_label, marks) => {
      const { repository, id } = await repositoryHolding();
      repository.markByClient(id, marks);

      const failures = await Promise.allSettled([
        repository.load(id),
        repository.load("unknown-id"),
      ]);

      expect(failures.map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      for (const result of failures) {
        expect(
          result.status === "rejected" ? result.reason : undefined,
        ).toBeInstanceOf(DesignNotFoundError);
      }
    },
  );

  it.each([
    ["hidden", { hiddenAt: MARKED_AT }],
    ["deleted", { deletedAt: MARKED_AT }],
  ])(
    "a design the client %s is refused on save, and the save writes nothing",
    async (_label, marks) => {
      const { repository, id } = await repositoryHolding();
      repository.markByClient(id, marks);
      const edited = { ...KITCHEN_L_DESIGN, presetId: "edited-after-the-mark" };

      await expect(repository.save(id, edited)).rejects.toThrow(
        DesignNotFoundError,
      );

      repository.markByClient(id, {});
      expect((await repository.load(id)).presetId).toBe(
        KITCHEN_L_DESIGN.presetId,
      );
    },
  );

  it("a design with no mark is open, and clearing the marks reopens it", async () => {
    const { repository, id } = await repositoryHolding();
    repository.markByClient(id, { hiddenAt: MARKED_AT });

    repository.markByClient(id, {});

    expect(await repository.load(id)).toEqual(KITCHEN_L_DESIGN);
  });

  it("marks only a design the fake holds, so a mark cannot make an unknown id look known", () => {
    const repository = new FakeConfigurationRepository();

    expect(() => {
      repository.markByClient("never-minted", { hiddenAt: MARKED_AT });
    }).toThrow(DesignNotFoundError);
  });

  it("takes the marks of another store as they are held, so one clock-stamped fact serves both", async () => {
    const kitchens = new FakeAccountKitchenStore({ now: () => MARKED_AT });
    const { repository, id } = await repositoryHolding();
    kitchens.seed({
      id,
      accountId: "A".repeat(21),
      design: KITCHEN_L_DESIGN,
      sentAt: MARKED_AT,
    });
    await kitchens.hide({ accountId: "A".repeat(21), designId: id });
    const marks = kitchens.held(id);

    const hiddenAt = marks?.hiddenAt;
    if (hiddenAt === undefined) throw new Error("the kitchen was not hidden");

    repository.markByClient(id, { hiddenAt });

    await expect(repository.load(id)).rejects.toThrow(DesignNotFoundError);
  });
});
