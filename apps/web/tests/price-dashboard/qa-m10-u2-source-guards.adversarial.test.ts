// Adversarial QA of M10 wave U2, the guards on what reaches a browser and who reads the dashboard's server side. The
// developer moved `cabinet-list-source.ts` out of the production-build predicate, into the R-d allow-list, and rewrote
// the U1 guards around it. These checks hold the new arrangement to what the old one did: the source is server-only and
// is read by one page; no module a browser loads (the editor, the draft hook, the client, every module they import) is,
// or imports, a module marked `server-only`; no module outside the allow-list mentions the source in code, in any
// spelling an import can take; and the allow-list's entry is as narrow as the file it names.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import {
  codeOf,
  codeWithoutComments,
  importClosureOf,
} from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SOURCE_FILE = "price-dashboard/cabinet-list-source.ts";
const PAGE = "app/[locale]/staff/catalog/cabinets/page.tsx";
const SERVER_ONLY_IMPORT = /^import\s+["']server-only["'];?\s*$/m;

const allSources = filesUnder(SOURCE_ROOT).map((path) =>
  relative(SOURCE_ROOT, path),
);

describe("the list's source", () => {
  it("opens with the server-only import, before any other import can run", () => {
    const text = readFileSync(join(SOURCE_ROOT, SOURCE_FILE), "utf8");

    const firstImport = /^import\s.*$/m.exec(text)?.[0];

    expect(firstImport).toBe('import "server-only";');
  });

  it("is named in code by the staff cabinets page alone, in whatever form the name is written", () => {
    const mentions = allSources.filter(
      (path) =>
        path !== SOURCE_FILE && codeOf(path).includes("cabinet-list-source"),
    );

    expect(mentions).toEqual([PAGE]);
  });

  it("is named in code, by its words broken in two or built, by nobody (a dynamic import the closure cannot follow)", () => {
    const BUILT_NAME =
      /cabinet-list-(?:["'`]|\$\{)|["'`]cabinet-list["'`]\s*\+/;

    const builders = allSources.filter((path) => BUILT_NAME.test(codeOf(path)));

    expect(builders).toEqual([]);
  });

  it("imports nothing a browser ships under that name: no client module and no module that has a 'use client' line", () => {
    const importers = allSources.filter(
      (path) =>
        /^\s*["']use client["']/m.test(
          readFileSync(join(SOURCE_ROOT, path), "utf8").slice(0, 400),
        ) && importClosureOf(path).includes(SOURCE_FILE),
    );

    expect(importers).toEqual([]);
  });
});

describe("what a browser loads of the list", () => {
  const ENTRIES = [
    "price-dashboard/cabinet-list-editor.tsx",
    "price-dashboard/cabinet-list-inline-edit.tsx",
    "price-dashboard/depth-rule-card.tsx",
    "price-dashboard/bulk-change-dialog.tsx",
    "price-dashboard/use-price-draft.ts",
    "price-dashboard/price-draft-client.ts",
    "price-dashboard/bulk-preview.ts",
    "price-dashboard/price-input-words.ts",
    "price-dashboard/price-field-input.ts",
  ] as const;

  it.each(ENTRIES)(
    "is, through everything %s imports, free of any module that says server-only and of the server's directory",
    (entry) => {
      const closure = importClosureOf(entry);

      const serverOnly = closure.filter((path) =>
        SERVER_ONLY_IMPORT.test(readFileSync(join(SOURCE_ROOT, path), "utf8")),
      );
      const fromTheServer = closure.filter((path) =>
        path.startsWith("lib/server/"),
      );

      expect(serverOnly).toEqual([]);
      expect(fromTheServer).toEqual([]);
      expect(closure).not.toContain(SOURCE_FILE);
    },
  );

  it.each(ENTRIES)(
    "reaches no module that names a price book's sample, or the test seed, from %s",
    (entry) => {
      const closure = importClosureOf(entry);
      const sampleOrSeed = closure.filter((path) =>
        /sample|test-seed/i.test(path),
      );

      expect(sampleOrSeed).toEqual([]);
    },
  );

  it("reads no environment variable in any module the wave wrote (the choice of stores is the server's, in one place)", () => {
    const wave = [
      ...ENTRIES,
      SOURCE_FILE,
      "price-dashboard/cabinet-list-facts.ts",
      "price-dashboard/price-dashboard-catalogue.ts",
      "price-dashboard/price-unit-field.tsx",
    ];

    const readers = wave.filter((path) => codeOf(path).includes("process.env"));

    expect(readers).toEqual([]);
  });
});

describe("the allow-list entry the developer added to the R-d guard", () => {
  const ENTRY = /^price-dashboard\/cabinet-list-source\.ts$/;
  const READS_DRAFT_OR_ARCHIVE =
    /\.(?:readVersion|listVersions|readDraft|writeDraft)\b|\bversion-wire\b|\breadVersionBook\b|\bpriceBook\.publish\b|lib\/server\/price-dashboard\//;

  it("names one file and no file beside it, however the path is spelled", () => {
    const admitted = allSources.filter((path) => ENTRY.test(path));

    expect(admitted).toEqual([SOURCE_FILE]);
    for (const neighbour of [
      "price-dashboard/cabinet-list-source.tsx",
      "price-dashboard/cabinet-list-source.ts.bak",
      "price-dashboard/sub/cabinet-list-source.ts",
      "price-dashboard/cabinet-list-sources.ts",
      "x/price-dashboard/cabinet-list-source.ts",
    ]) {
      expect(ENTRY.test(neighbour), neighbour).toBe(false);
    }
  });

  it("is needed by that file and by no other file of the dashboard's client side: every file under price-dashboard that reads the server's side is that one (or the publish source)", () => {
    const readers = allSources
      .filter((path) => path.startsWith("price-dashboard/"))
      .filter((path) => READS_DRAFT_OR_ARCHIVE.test(codeOf(path)));

    expect(readers.filter((path) => path !== SOURCE_FILE)).toEqual([]);
  });

  it("does not admit the client-side file that would write through it: no price-dashboard module with a use-client line reads the server directory", () => {
    const clientReaders = allSources
      .filter((path) => path.startsWith("price-dashboard/"))
      .filter(
        (path) =>
          /^\s*["']use client["']/m.test(
            readFileSync(join(SOURCE_ROOT, path), "utf8").slice(0, 400),
          ) &&
          codeWithoutComments(
            path,
            readFileSync(join(SOURCE_ROOT, path), "utf8"),
          ).includes("lib/server/"),
      );

    expect(clientReaders).toEqual([]);
  });
});
