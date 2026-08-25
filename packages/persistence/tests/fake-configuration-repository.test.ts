import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { FakeConfigurationRepository } from "../src/fake-configuration-repository.js";

describe("FakeConfigurationRepository", () => {
  it("mints a new id on save(null, design) and loads the same design back", async () => {
    const repository = new FakeConfigurationRepository();

    const id = await repository.save(null, KITCHEN_L_DESIGN);
    const loaded = await repository.load(id);

    expect(id).toBeTruthy();
    expect(loaded).toEqual(KITCHEN_L_DESIGN);
  });

  it("mints different ids across repeated saves of null", async () => {
    const repository = new FakeConfigurationRepository();

    const firstId = await repository.save(null, KITCHEN_L_DESIGN);
    const secondId = await repository.save(null, KITCHEN_L_DESIGN);

    expect(firstId).not.toBe(secondId);
  });

  it("overwrites the existing row when save is called with an existing id", async () => {
    const repository = new FakeConfigurationRepository();
    const id = await repository.save(null, KITCHEN_L_DESIGN);
    const updated = { ...KITCHEN_L_DESIGN, presetId: "updated-preset" };

    const returnedId = await repository.save(id, updated);
    const loaded = await repository.load(id);

    expect(returnedId).toBe(id);
    expect(loaded).toEqual(updated);
  });

  it("throws DesignNotFoundError when loading a missing id", async () => {
    const repository = new FakeConfigurationRepository();

    await expect(repository.load("missing-id")).rejects.toThrow(
      DesignNotFoundError,
    );
  });

  it("throws DesignNotFoundError when saving to an id that was never minted", async () => {
    const repository = new FakeConfigurationRepository();

    await expect(
      repository.save("never-minted", KITCHEN_L_DESIGN),
    ).rejects.toThrow(DesignNotFoundError);
  });

  it("persists nothing when a save to an unknown id is rejected", async () => {
    const repository = new FakeConfigurationRepository();

    await expect(
      repository.save("never-minted", KITCHEN_L_DESIGN),
    ).rejects.toThrow(DesignNotFoundError);
    await expect(repository.load("never-minted")).rejects.toThrow(
      DesignNotFoundError,
    );
  });
});
