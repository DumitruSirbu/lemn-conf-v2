// Wave 8M2 QA: criteria 1 to 5 and 21 attacked from the outside of the developer's own pins. What may become a `tel:`
// or `wa.me/` address, where the launch gate is wired and where it must not be, and that the number reaches a sentence
// only by interpolation. Reads files; runs nothing.
import { matchesGlob } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isLaunchReadyShopPhone,
  SHOP_PHONE_E164,
  SHOP_PHONE_PLACEHOLDER_E164,
  shopPhoneDisplay,
} from "@/shop/shop-phone";

import { catalogueLeaves, CATALOGUES } from "../support/catalogues";

const WEB_ROOT = join(import.meta.dirname, "../..");
const REPOSITORY_ROOT = join(WEB_ROOT, "../..");
const SOURCE_ROOT = join(WEB_ROOT, "src");

function readFromRepository(path: string): string {
  return readFileSync(join(REPOSITORY_ROOT, path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css|json)$/.test(entry) ? [path] : [];
  });
}

const PLACEHOLDER_DIGITS = SHOP_PHONE_PLACEHOLDER_E164.slice(1);

describe("criterion 3, attacked: whatever the predicate accepts is safe to put after `tel:` and `wa.me/`", () => {
  const hostileAlphabet = fc.constantFrom(
    ..."+0123456789 -()./\n\t ​‮０３٣abc?#&%".split(""),
  );

  const nearlyANumber = fc
    .tuple(
      fc.stringMatching(/^\+[0-9]{6,16}$/),
      fc.nat(18),
      fc.option(hostileAlphabet, { nil: undefined }),
    )
    .map(([number, at, injected]) =>
      injected === undefined
        ? number
        : `${number.slice(0, at)}${injected}${number.slice(at)}`,
    );

  it("accepts only a plus sign and 7 to 15 digits (the phone rule's own bounds), none of them a look-alike, whatever is entered, and does accept some (control)", () => {
    let accepted = 0;
    fc.assert(
      fc.property(
        fc.oneof(
          fc.array(hostileAlphabet, { maxLength: 24 }).map((c) => c.join("")),
          nearlyANumber,
        ),
        (entered) => {
          if (!isLaunchReadyShopPhone(entered)) return;
          accepted += 1;
          expect(entered).toMatch(/^\+[1-9][0-9]{6,14}$/);
        },
      ),
      { numRuns: 3000 },
    );
    expect(accepted, "the property saw accepted numbers").toBeGreaterThan(50);
  });

  it("refuses the placeholder with any padding or a trailing line break that a loosened comparison would let through", () => {
    for (const padded of [
      ` ${SHOP_PHONE_PLACEHOLDER_E164}`,
      `${SHOP_PHONE_PLACEHOLDER_E164} `,
      `${SHOP_PHONE_PLACEHOLDER_E164}\n`,
      "+373 00 000 000",
      "0037300000000",
      "+373-00-000-000",
    ]) {
      expect(isLaunchReadyShopPhone(padded), JSON.stringify(padded)).toBe(
        false,
      );
    }
  });
});

describe("criterion 1, attacked: no other way to reach the shop's number is written in the application", () => {
  const files = sourceFiles(SOURCE_ROOT).map((path) => ({
    path: path.slice(SOURCE_ROOT.length + 1),
    text: readFileSync(path, "utf8"),
  }));

  it.each([
    ["whatsapp://", /whatsapp:\/\//i],
    ["api.whatsapp.com", /api\.whatsapp\.com/i],
    [
      "wa.me written with a scheme-relative or other recipient form",
      /wa\.me\/\+?\d/,
    ],
    ["sms:", /\bsms:/i],
    ["a callto: or facetime: link", /\b(?:callto|facetime|skype):/i],
    ["a mailto: link (the shop is reached by phone only)", /\bmailto:/i],
  ])("holds no %s anywhere in apps/web/src", (_label, pattern) => {
    expect(
      files.filter(({ text }) => pattern.test(text)).map(({ path }) => path),
    ).toEqual([]);
  });

  it("holds the placeholder's digits only in the module that derives the addresses", () => {
    expect(
      files
        .filter(({ text }) => text.includes(PLACEHOLDER_DIGITS))
        .map(({ path }) => path),
    ).toEqual(["shop/shop-phone.ts"]);
  });

  it("calls each address derivation from one place: the tel address from the call link, the WhatsApp digits from the anchor", () => {
    const callersOf = (name: string) =>
      files
        .filter(({ path }) => path !== "shop/shop-phone.ts")
        .filter(({ text }) => new RegExp(`\\b${name}\\(`).test(text))
        .map(({ path }) => path);

    expect(callersOf("shopTelAddress")).toEqual(["shop/call-shop-link.tsx"]);
    expect(callersOf("shopWhatsAppDigits")).toEqual([
      "done/send-on-whatsapp.tsx",
    ]);
  });
});

describe("criterion 21, attacked: the number reaches a sentence only by {phone}", () => {
  const display = shopPhoneDisplay(SHOP_PHONE_E164);

  it.each(CATALOGUES)(
    "names the shop's number in exactly one %s leaf, by {phone}, and holds no digit of it",
    (_locale, messages) => {
      const leaves = catalogueLeaves(messages);
      expect(
        leaves.filter(([, text]) => text.includes("{phone}")).map(([k]) => k),
      ).toEqual(["submissionResult.alreadySentAdvice"]);
      for (const [key, text] of leaves) {
        expect(text, key).not.toContain(display);
        expect(text, key).not.toContain(PLACEHOLDER_DIGITS);
        expect(text, key).not.toContain("00 000 000");
      }
    },
  );

  it.each(CATALOGUES)(
    "has no leaf of the call link or the advice that carries a href, a digit run or markup in %s",
    (_locale, messages) => {
      for (const key of [
        "submissionResult.callShop",
        "submissionResult.alreadySentAdvice",
        "submissionResult.alreadySentChangedKitchen",
        "submissionResult.alreadySentHeading",
      ]) {
        const text =
          catalogueLeaves(messages).find(([k]) => k === key)?.[1] ?? "";
        expect(text, key).not.toBe("");
        expect(text, key).not.toMatch(/[<>]|tel:|https?:|\d{3,}/);
      }
    },
  );
});

describe("criterion 4, attacked: the launch check is collected by nothing that runs on a push", () => {
  const launchFile = "tests/launch/shop-phone.launch-check.ts";
  const defaultInclude = ["tests/**/*.test.ts"];

  it("lies outside the default suite's include pattern and inside the launch config's, and no other file is in the launch config's", () => {
    const launchConfig = readFileSync(
      join(WEB_ROOT, "vitest.launch.config.ts"),
      "utf8",
    );
    const defaultConfig = readFileSync(
      join(WEB_ROOT, "vitest.config.ts"),
      "utf8",
    );
    expect(defaultConfig).toContain(`include: ["tests/**/*.test.ts"]`);
    expect(defaultInclude.some((glob) => matchesGlob(launchFile, glob))).toBe(
      false,
    );
    expect(launchConfig).toContain(
      `include: ["tests/launch/**/*.launch-check.ts"]`,
    );
    expect(matchesGlob(launchFile, "tests/launch/**/*.launch-check.ts")).toBe(
      true,
    );
    expect(
      readdirSync(join(WEB_ROOT, "tests/launch")).filter((name) =>
        name.endsWith(".test.ts"),
      ),
      "a .test.ts file in tests/launch would be collected by the default suite",
    ).toEqual([]);
  });

  it("is named by no push gate: not by the root check or ci:local scripts, local-ci.sh, ci.yml, the web test script or a hook", () => {
    const root = JSON.parse(readFromRepository("package.json")) as {
      scripts: Record<string, string>;
    };
    const web = JSON.parse(
      readFileSync(join(WEB_ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const named = (text: string) => /launch/i.test(text);

    const textOf = (scripts: Record<string, string>, names: string[]) =>
      names.map((name) => scripts[name] ?? "").join("\n");
    expect(named(textOf(root.scripts, ["check", "ci:local", "test"]))).toBe(
      false,
    );
    expect(named(textOf(web.scripts, ["test", "test:e2e"]))).toBe(false);
    expect(named(readFromRepository("scripts/local-ci.sh"))).toBe(false);
    expect(named(readFromRepository(".github/workflows/ci.yml"))).toBe(false);
    for (const hook of readdirSync(join(REPOSITORY_ROOT, ".githooks"))) {
      expect(named(readFromRepository(`.githooks/${hook}`)), hook).toBe(false);
    }
  });

  it("is one command, which builds its dependencies first and runs the launch config and nothing else", () => {
    const root = JSON.parse(readFromRepository("package.json")) as {
      scripts: Record<string, string>;
    };
    const web = JSON.parse(
      readFileSync(join(WEB_ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(root.scripts["gate:launch-placeholders"]).toBe(
      "pnpm --filter @lemnaria/web run gate:launch-placeholders",
    );
    expect(web.scripts["gate:launch-placeholders"]).toBe(
      "pnpm run build:deps && vitest run --config vitest.launch.config.ts",
    );
  });
});

describe("criterion 5, attacked: deploy.yml refuses the placeholder for production and only there, before any database is opened", () => {
  const workflow = readFromRepository(".github/workflows/deploy.yml")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const steps = workflow
    .split(/^ {6}- name: /m)
    .slice(1)
    .map((block) => ({
      name: block.split("\n")[0] ?? "",
      body: block,
    }));
  const gate = steps.find(({ body }) =>
    body.includes("gate:launch-placeholders"),
  );

  it("has exactly one step that runs the launch gate, and it runs `pnpm gate:launch-placeholders`", () => {
    expect(
      steps.filter(({ body }) => body.includes("gate:launch-placeholders")),
    ).toHaveLength(1);
    expect(gate?.body).toMatch(/^ {8}run: pnpm gate:launch-placeholders$/m);
  });

  it("is conditioned on the production environment alone, with no continue-on-error that would let a red through", () => {
    expect(gate?.body).toMatch(
      /^ {8}if: inputs\.environment == 'production'$/m,
    );
    expect(gate?.body).not.toMatch(/continue-on-error/);
    expect(gate?.body).not.toMatch(/\|\|\s*true/);
  });

  it("comes after the install and before every step that opens a database", () => {
    const names = steps.map(({ name }) => name);
    const at = names.indexOf(gate?.name ?? "");
    expect(at).toBeGreaterThan(names.findIndex((n) => n.startsWith("Install")));
    for (const database of [
      /^Assert the migration credential/,
      /^Refuse a migration/,
      /^Read the schema back before/,
      /^Migrate$/,
      /^Verify by reading the schema/,
    ]) {
      const index = names.findIndex((n) => database.test(n));
      expect(index, String(database)).toBeGreaterThan(at);
    }
  });

  it("leaves the workflow as inert as it was: manual dispatch only, no push, schedule or pull_request trigger", () => {
    const triggers = /^on:\n([\s\S]*?)^[a-z]/m.exec(workflow)?.[1] ?? "";
    expect(triggers).toContain("workflow_dispatch:");
    for (const forbidden of [
      "push:",
      "pull_request",
      "schedule:",
      "workflow_run",
    ]) {
      expect(triggers, forbidden).not.toContain(forbidden);
    }
  });
});
