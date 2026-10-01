import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { getRepository } from "../../../src/lib/server/repository";

/**
 * M7 wave 7E3b QA, criterion 1's type half: the web singleton's shape must not expose the ungated
 * `load`. The runtime assertion below is the grep; the type alias is the compile-time half — `pnpm
 * typecheck` fails on an unused `@ts-expect-error` the moment `load` becomes reachable again.
 */

type SharedRepository = ReturnType<typeof getRepository>;

// @ts-expect-error -- `load` is omitted from the web singleton (ADR 0114 decision 5, D4).
export type UngatedLoadMustNotExist = SharedRepository["load"];

export type GatedReadExists = SharedRepository["loadOwned"];

const REPOSITORY_MODULE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/lib/server/repository.ts",
);

describe("the web repository singleton (7E3b D4)", () => {
  it("declares its shape as the write port with load omitted, plus the gated read", () => {
    const source = readFileSync(REPOSITORY_MODULE, "utf8");

    expect(source).toMatch(
      /Omit<\s*AuthorizedConfigurationRepository,\s*"load"\s*>/,
    );
    expect(source).toMatch(/OwnedDesignRepository/);
  });
});
