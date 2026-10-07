import { describe, expect, it } from "vitest";

import {
  applyMigrations,
  describeMigrationFailure,
  runMigrations,
} from "../src/migrate.js";
import {
  describeStatusFailure,
  readDeployedSchema,
} from "../src/migrate-status.js";
import { MigrationExecutionError } from "../src/migration-errors.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import {
  ACCEPTED_VALUES,
  FAKE_PASSWORD,
  FAKE_USER,
  REFUSED_VALUES,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import type { FakeConnectionValue } from "./support/leaked-connection-markers.js";

const SETTLE_BOUND_MS = 10_000;

const REFUSED_LOCAL_PORT_VALUE: FakeConnectionValue = {
  label: "well-formed, refused local port",
  value: `postgres://${FAKE_USER}:${FAKE_PASSWORD}@127.0.0.1:1/lemn-fake-db`,
};

const UNREACHABLE_VALUES: readonly FakeConnectionValue[] = [
  ...ACCEPTED_VALUES,
  REFUSED_LOCAL_PORT_VALUE,
];

type Outcome =
  | { readonly kind: "rejected"; readonly error: unknown }
  | { readonly kind: "resolved" }
  | { readonly kind: "did-not-settle" };

async function outcomeWithinBound(
  run: () => Promise<unknown>,
): Promise<Outcome> {
  const timeout = new Promise<Outcome>((resolve) =>
    setTimeout(() => {
      resolve({ kind: "did-not-settle" });
    }, SETTLE_BOUND_MS),
  );
  const settled = run().then(
    (): Outcome => ({ kind: "resolved" }),
    (error: unknown): Outcome => ({ kind: "rejected", error }),
  );
  return Promise.race([settled, timeout]);
}

function rejectionOf(outcome: Outcome): unknown {
  if (outcome.kind !== "rejected")
    throw new Error(`expected a rejection, got: ${outcome.kind}`);
  return outcome.error;
}

const ENTRY_POINTS: readonly [
  string,
  (value: string, readFrom?: "MIGRATION_DATABASE_URL") => Promise<unknown>,
][] = [
  [
    "applyMigrations",
    (value, readFrom) => applyMigrations(value, [], readFrom),
  ],
  ["runMigrations", (value, readFrom) => runMigrations(value, readFrom)],
  [
    "readDeployedSchema",
    (value, readFrom) => readDeployedSchema(value, readFrom),
  ],
];

describe.each(REFUSED_VALUES)("a connection string of $label", ({ value }) => {
  describe.each(ENTRY_POINTS)("through %s", (_site, enter) => {
    describe("when its caller says it read the value from MIGRATION_DATABASE_URL", () => {
      const run = (): Promise<unknown> =>
        enter(value, "MIGRATION_DATABASE_URL");

      it("is refused at once with the opener's error naming the variable", async () => {
        const error = rejectionOf(await outcomeWithinBound(run));

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          "MIGRATION_DATABASE_URL",
        );
      });

      it("carries no marker on message, stack, any own property, the cause chain or util.inspect", async () => {
        const error = rejectionOf(await outcomeWithinBound(run));

        expect(markersFoundOn(error)).toEqual([]);
        expect(error).not.toHaveProperty("cause");
      });

      it("prints a CLI line that names the variable and carries no marker", async () => {
        const error = rejectionOf(await outcomeWithinBound(run));

        for (const line of [
          describeMigrationFailure(error),
          describeStatusFailure(error),
        ]) {
          expect(line).toContain("MIGRATION_DATABASE_URL");
          expect(markersFoundOn(line)).toEqual([]);
        }
      });
    });

    describe("when its caller handed the value in", () => {
      it("is refused as handed in: no variable named, no marker, no cause", async () => {
        const error = rejectionOf(await outcomeWithinBound(() => enter(value)));

        expect(error).toBeInstanceOf(InvalidConnectionUrlError);
        expect((error as InvalidConnectionUrlError).variableName).toBe(
          undefined,
        );
        expect((error as Error).message).not.toContain("DATABASE_URL");
        expect(markersFoundOn(error)).toEqual([]);
        expect(error).not.toHaveProperty("cause");
      });
    });
  });
});

describe.each(UNREACHABLE_VALUES)("a well-formed $label", ({ value }) => {
  it("makes applyMigrations settle within the bound, with a connect error that carries no marker", async () => {
    const outcome = await outcomeWithinBound(() => applyMigrations(value, []));

    const error = rejectionOf(outcome);
    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(markersFoundOn(error)).toEqual([]);
    expect(markersFoundOn(describeMigrationFailure(error))).toEqual([]);
  });

  it("makes readDeployedSchema settle within the bound, with an error that carries no marker", async () => {
    const outcome = await outcomeWithinBound(() => readDeployedSchema(value));

    const error = rejectionOf(outcome);
    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(markersFoundOn(error)).toEqual([]);
    expect(markersFoundOn(describeStatusFailure(error))).toEqual([]);
  });
});
