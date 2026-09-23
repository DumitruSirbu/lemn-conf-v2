import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * D10's wiring, the strongest guard `global-settings.tsx`'s own store-connected sheet allows
 * (`qa-w2-locked-surface-reach.adversarial.test.ts` states the same reason for `editability`):
 * nothing in a `node` test runtime opens the sheet, so no rendering test exercises the real mount.
 * A source-text assertion is what catches the mount being silently dropped by a later edit.
 */
describe("<ShareDesign> is mounted in the settings surface (M7 wave 7E3c D10)", () => {
  it("is imported and rendered exactly once, inside the choosing step's body", () => {
    const source = readFileSync(
      new URL("../../src/settings/global-settings.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { ShareDesign } from "@/share/share-design";',
    );
    expect(source.match(/shareControl=\{<ShareDesign\s*\/>\}/g)).toHaveLength(
      1,
    );
  });
});
