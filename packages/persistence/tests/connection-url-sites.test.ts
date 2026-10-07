import { afterEach, describe, expect, it, vi } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import {
  ACCEPTED_VALUES,
  REFUSED_VALUES,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

interface RuntimeSite {
  readonly name: string;
  readonly open: () => unknown;
}

const RUNTIME_SITES: readonly RuntimeSite[] = [
  {
    name: "NeonConfigurationRepository",
    open: () => new NeonConfigurationRepository(),
  },
  {
    name: "NeonShareLinkRepository",
    open: () => new NeonShareLinkRepository(),
  },
  {
    name: "createNeonDesignRowSource",
    open: () =>
      createNeonDesignRowSource().fetchDesignPage({
        pageSize: 1,
      }),
  },
];

async function errorRaisedBy(open: () => unknown): Promise<unknown> {
  try {
    await open();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(RUNTIME_SITES)("$name", ({ open }) => {
  describe.each(REFUSED_VALUES)(
    "with DATABASE_URL set to a $label",
    ({ value }) => {
      it("throws the domain error naming DATABASE_URL, with no marker on any surface", async () => {
        vi.stubEnv("DATABASE_URL", value);

        const error = await errorRaisedBy(open);

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          "DATABASE_URL",
        );
        expect(markersFoundOn(error)).toEqual([]);
        expect(error).not.toHaveProperty("cause");
      });

      it("does not fall back to another connection variable (ADR 0008)", async () => {
        vi.stubEnv("DATABASE_URL", value);
        vi.stubEnv("MIGRATION_DATABASE_URL", WELL_FORMED_UNREACHABLE_VALUE);
        vi.stubEnv("TEST_DATABASE_URL", WELL_FORMED_UNREACHABLE_VALUE);

        const error = await errorRaisedBy(open);

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
      });
    },
  );

  it("still names DATABASE_URL as unset, not as malformed, when it is empty", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MIGRATION_DATABASE_URL", WELL_FORMED_UNREACHABLE_VALUE);

    const error = await errorRaisedBy(open);

    expect(error).not.toBeInstanceOf(InvalidConnectionUrlError);
    expect((error as Error).message).toMatch(
      /DATABASE_URL environment variable is not set/,
    );
  });
});

describe.each(ACCEPTED_VALUES)(
  "with DATABASE_URL set to a well-formed $label",
  ({ value }) => {
    it.each(RUNTIME_SITES.slice(0, 2))(
      "$name constructs without raising",
      async ({ open }) => {
        vi.stubEnv("DATABASE_URL", value);

        expect(await errorRaisedBy(open)).toBeUndefined();
      },
    );

    it("the row source's failed query is the driver's own error, carrying no marker", async () => {
      vi.stubEnv("DATABASE_URL", value);

      const error = await errorRaisedBy(RUNTIME_SITES[2]?.open ?? neverFound);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(InvalidConnectionUrlError);
      expect(markersFoundOn(error)).toEqual([]);
    });
  },
);

function neverFound(): never {
  throw new Error("the row-source site is missing from RUNTIME_SITES");
}
