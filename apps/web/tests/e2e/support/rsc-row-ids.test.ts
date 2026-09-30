import { describe, expect, it } from "vitest";

import { canonicaliseRowIds } from "./rsc-row-ids";

/** The shape of an inlined flight payload, with `firstDebugRow` standing for the dev-only shift. */
function flightBody(firstDebugRow: number, shape = "L"): string {
  const hex = (offset: number): string => (firstDebugRow + offset).toString(16);
  return [
    `<script>self.__next_f.push([1,"1:I[\\"chunk.js\\",[],\\"Default\\"]\\n`,
    `33:D\\"$${hex(0)}\\"\\n33:D\\"$${hex(2)}\\"\\n`,
    `33:[[\\"$\\",\\"$L${hex(6)}\\",null,{\\"shape\\":\\"${shape}\\"}],\\"$${hex(4)}\\",1]\\n`,
    `${hex(6)}:I[\\"view.js\\",[],\\"View\\"]\\n"])</script>`,
  ].join("");
}

describe("canonicaliseRowIds", () => {
  it("treats the same payload numbered from a different debug row as equal", () => {
    expect(canonicaliseRowIds(flightBody(0x89))).toBe(
      canonicaliseRowIds(flightBody(0x8b)),
    );
  });

  it("still tells apart two payloads whose values differ", () => {
    expect(canonicaliseRowIds(flightBody(0x89, "L"))).not.toBe(
      canonicaliseRowIds(flightBody(0x89, "U")),
    );
  });

  it("still tells apart a reference that points at a different row", () => {
    const original = flightBody(0x89);
    const repointed = original.replace('\\"$L8f\\"', '\\"$L89\\"');

    expect(repointed).not.toBe(original);
    expect(canonicaliseRowIds(repointed)).not.toBe(
      canonicaliseRowIds(original),
    );
  });

  it("still tells apart a payload that lost a row", () => {
    const original = flightBody(0x89);
    const withoutRow = original.replace('33:D\\"$8b\\"\\n', "");

    expect(withoutRow).not.toBe(original);
    expect(canonicaliseRowIds(withoutRow)).not.toBe(
      canonicaliseRowIds(original),
    );
  });

  it("leaves a body with no row ids untouched", () => {
    expect(canonicaliseRowIds("<html>no flight payload</html>")).toBe(
      "<html>no flight payload</html>",
    );
  });
});
