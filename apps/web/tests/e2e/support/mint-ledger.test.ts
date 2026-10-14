import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mintLedgerOfTheRun } from "./mint-ledger";

const SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const OTHER_SECRET =
  "ff0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "mint-ledger-test-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("mintLedgerOfTheRun", () => {
  it("counts zero for a run whose workers recorded nothing, which has no file", () => {
    expect(mintLedgerOfTheRun(SECRET, directory).takeCount()).toBe(0);
  });

  it("sums what several writers recorded, and removes the file it read", () => {
    mintLedgerOfTheRun(SECRET, directory).record(2);
    mintLedgerOfTheRun(SECRET, directory).record(3);

    expect(mintLedgerOfTheRun(SECRET, directory).takeCount()).toBe(5);
    expect(readdirSync(directory)).toEqual([]);
    expect(mintLedgerOfTheRun(SECRET, directory).takeCount()).toBe(0);
  });

  it("keeps each run's designs apart by the run's secret", () => {
    mintLedgerOfTheRun(SECRET, directory).record(4);
    mintLedgerOfTheRun(OTHER_SECRET, directory).record(1);

    expect(mintLedgerOfTheRun(SECRET, directory).takeCount()).toBe(4);
    expect(mintLedgerOfTheRun(OTHER_SECRET, directory).takeCount()).toBe(1);
  });

  it("names its file without the secret", () => {
    mintLedgerOfTheRun(SECRET, directory).record(1);

    const [name] = readdirSync(directory);

    expect(name).toBeDefined();
    expect(name).not.toContain(SECRET);
  });
});
