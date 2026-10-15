import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

function readWebManifest(): PackageManifest {
  const text = readFileSync(
    join(import.meta.dirname, "../../../../package.json"),
    "utf8",
  );
  return JSON.parse(text) as PackageManifest;
}

describe("the web package's mail dependency", () => {
  it("names nodemailer at one exact version under dependencies, because the server imports it at run time", () => {
    const manifest = readWebManifest();

    expect(manifest.dependencies?.nodemailer).toMatch(EXACT_VERSION);
    expect(manifest.devDependencies ?? {}).not.toHaveProperty("nodemailer");
  });

  it("adds no separate types package, because nodemailer ships its own declarations", () => {
    const manifest = readWebManifest();
    const everyName = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });

    expect(everyName).not.toContain("@types/nodemailer");
  });
});
