// The one place the publish screens' facts come from: nothing invented can reach a production build, the sample is what it
// exists to show (a bulk row, a new rule's neighbours, the provisional switch, a draft that applies), and the count of waiting
// prices is the draft's.
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { applyChanges } from "@lemnaria/configurator-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UNAVAILABLE_PUBLISH_CLIENT } from "@/price-dashboard/publish-client";
import { readPendingDraft } from "@/price-dashboard/publish-model";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";
import {
  readPendingPriceCount,
  readPublishPage,
  readVersionDetail,
} from "@/price-dashboard/publish-source";

import { filesUnder } from "../support/files-under";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SAMPLE_VERSION = SAMPLE_PUBLISH_PAGE.state.active.versionId;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a production build", () => {
  it("answers unavailable to every read, however often it is asked", async () => {
    vi.stubEnv("NODE_ENV", "production");

    for (let ask = 0; ask < 3; ask += 1) {
      expect(await readPublishPage()).toEqual({ kind: "unavailable" });
      expect(await readVersionDetail(SAMPLE_VERSION)).toEqual({
        kind: "unavailable",
      });
      expect(await readPendingPriceCount()).toBeUndefined();
    }
  });

  it("holds a client that writes nothing and answers failed to every call", async () => {
    const request = { expectedDraftRevision: "1" };

    expect(await UNAVAILABLE_PUBLISH_CLIENT.restore("x", request)).toEqual({
      kind: "failed",
    });
    expect(
      await UNAVAILABLE_PUBLISH_CLIENT.publish({
        ...request,
        expectedActiveSequence: 1,
        expectedAvailabilityRevision: "0",
        label: "x",
        note: "",
      }),
    ).toEqual({ kind: "failed" });
    expect(await UNAVAILABLE_PUBLISH_CLIENT.readState()).toBeUndefined();
  });

  it("asks one predicate in the server-side readers and spells the build mode in no reader of its own", () => {
    for (const name of [
      "price-dashboard/publish-source.ts",
      "price-dashboard/cabinet-list-source.ts",
    ]) {
      const source = readFileSync(join(SOURCE_ROOT, name), "utf8");

      expect(source, name).toMatch(/isProductionBuild\(\)/);
      expect(source, name).not.toMatch(/process\.env/);
    }
    const predicate = readFileSync(
      join(SOURCE_ROOT, "price-dashboard/is-production-build.ts"),
      "utf8",
    );
    expect(predicate).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
  });

  it("decides the browser's client on the literal the bundler replaces, so a production bundle holds no sample", () => {
    const source = readFileSync(
      join(SOURCE_ROOT, "price-dashboard/default-publish-client.ts"),
      "utf8",
    );

    expect(source).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
    expect(source).not.toMatch(/process\.env\[/);
    for (const screen of ["use-publish-desk.ts", "version-detail.tsx"]) {
      const screenSource = readFileSync(
        join(SOURCE_ROOT, "price-dashboard", screen),
        "utf8",
      );
      expect(screenSource, screen).toMatch(/defaultPublishClient\(/);
      expect(screenSource, screen).not.toMatch(
        /process\.env|publish-sample-client/,
      );
    }
  });

  it("reaches the invented prices only through the sources: the sample is imported by its own source and by the cabinet list's sample, which shares its draft", () => {
    const importers = filesUnder(SOURCE_ROOT)
      .filter((path) =>
        /\.\/publish-sample["']/.test(readFileSync(path, "utf8")),
      )
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    expect(importers).toEqual([
      "price-dashboard/cabinet-list-sample.ts",
      "price-dashboard/publish-source.ts",
    ]);
  });
});

describe.each(["development", "test"])("a %s build", (mode) => {
  it("reads the sample page, the sample version and the sample's count", async () => {
    vi.stubEnv("NODE_ENV", mode);

    expect(await readPublishPage()).toEqual({
      kind: "ready",
      input: SAMPLE_PUBLISH_PAGE,
    });
    expect((await readVersionDetail(SAMPLE_VERSION)).kind).toBe("ready");
    expect(await readPendingPriceCount()).toBe(
      SAMPLE_PUBLISH_PAGE.state.draft.changes.length,
    );
  });

  it("answers not-found to a version nobody holds", async () => {
    vi.stubEnv("NODE_ENV", mode);

    expect(await readVersionDetail("nobody-holds-this")).toEqual({
      kind: "not-found",
    });
  });
});

describe("the sample", () => {
  const { state } = SAMPLE_PUBLISH_PAGE;

  it("holds a draft that makes a book, which the sample versions' own books do too", () => {
    expect(applyChanges(state.active.book, state.draft.changes).ok).toBe(true);
  });

  it("shows a bulk action as one row with its percentage, a depth rule, a tier, an accessory and the provisional switch off", () => {
    const reading = readPendingDraft({
      active: state.active.book,
      changes: state.draft.changes,
      cabinetNames: SAMPLE_PUBLISH_PAGE.cabinetNames,
    });

    expect(reading.kind).toBe("ready");
    if (reading.kind !== "ready") return;
    const rows = reading.view.sections.flatMap((section) => section.rows);
    expect(
      rows.some((row) => row.kind === "group" && row.bulk !== undefined),
    ).toBe(true);
    expect(reading.view.sections.map((section) => section.section)).toEqual([
      "cabinets",
      "price-rules",
      "materials",
      "hardware",
      "accessories",
      "provisional",
    ]);
    expect(reading.view.holdsProvisionalOff).toBe(true);
    expect(reading.view.canPublish).toBe(true);
  });

  it("lists its versions newest first with exactly the last one active, and one page of them", () => {
    const { versions } = SAMPLE_PUBLISH_PAGE;

    expect(versions.versions.map((version) => version.state)).toEqual([
      "active",
      "archived",
      "archived",
      "archived",
    ]);
    expect(versions.versions[0]?.versionId).toBe(SAMPLE_VERSION);
    expect(versions.total).toBe(versions.versions.length);
  });
});
