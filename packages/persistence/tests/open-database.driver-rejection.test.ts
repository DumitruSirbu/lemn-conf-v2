import { describe, expect, it, vi } from "vitest";

import {
  FAKE_HOST,
  FAKE_PASSWORD,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

const WELL_FORMED_VALUE = `postgres://fakeuser_8B:${FAKE_PASSWORD}@${FAKE_HOST}/lemn-fake-db`;

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    throw new Error(`the driver echoes its input: ${WELL_FORMED_VALUE}`, {
      cause: new TypeError(WELL_FORMED_VALUE),
    });
  },
}));

describe("openDatabase when the driver itself throws on a shape the check let through", () => {
  it("replaces the driver's error with the domain error and keeps none of it", async () => {
    const { InvalidConnectionUrlError, openDatabase } = await import(
      "../src/open-database.js"
    );

    const thrown = (() => {
      try {
        openDatabase(WELL_FORMED_VALUE, "MIGRATION_DATABASE_URL");
      } catch (error) {
        return error;
      }
      throw new Error("the opener did not throw");
    })();

    expect(thrown).toBeInstanceOf(InvalidConnectionUrlError);
    expect(markersFoundOn(thrown)).toEqual([]);
    expect(thrown).not.toHaveProperty("cause");
    expect((thrown as Error).message).toContain("MIGRATION_DATABASE_URL");
  });
});
