import { describe, expect, it } from "vitest";

import { sqlFragment, statementFrom } from "../src/sql-fragment.js";

/** A tag that records what it was sent, as the mocked driver does: the text with each value as `?`, and the values. */
function recording(strings: TemplateStringsArray, ...values: unknown[]) {
  return { text: strings.join("?"), values, raw: [...strings.raw] };
}

describe("a SQL fragment", () => {
  it("is sent as one tagged template: the text with each bound value as a slot, in order", () => {
    const fragment = sqlFragment`select ${1}::int, ${"two"}::text`;

    expect(statementFrom(recording, fragment)).toEqual({
      text: "select ?::int, ?::text",
      values: [1, "two"],
      raw: ["select ", "::int, ", "::text"],
    });
  });

  it("is spliced into another as text, its own values bound where it stands", () => {
    const inner = sqlFragment`a = ${"x"} or b = ${"y"}`;
    const outer = sqlFragment`where ${1}::int = 1 and (${inner}) and c = ${"z"}`;

    expect(statementFrom(recording, outer)).toMatchObject({
      text: "where ?::int = 1 and (a = ? or b = ?) and c = ?",
      values: [1, "x", "y", "z"],
    });
  });

  it("splices a fragment with no value, at either end of a statement and beside another", () => {
    const column = sqlFragment`t.id`;
    const both = sqlFragment`${column}${column}`;

    expect(statementFrom(recording, sqlFragment`${both}`)).toMatchObject({
      text: "t.idt.id",
      values: [],
    });
  });

  it("splices a fragment inside a fragment inside a fragment", () => {
    const innermost = sqlFragment`${"v"}`;
    const middle = sqlFragment`(${innermost}, ${2})`;

    expect(
      statementFrom(recording, sqlFragment`f${middle}g${middle}h`),
    ).toMatchObject({ text: "f(?, ?)g(?, ?)h", values: ["v", 2, "v", 2] });
  });

  it("binds a value that only looks like a fragment, never splicing it as text", () => {
    const lookalike = { strings: ["drop table x"], values: [] };

    expect(
      statementFrom(recording, sqlFragment`select ${lookalike}`),
    ).toMatchObject({ text: "select ?", values: [lookalike] });
  });

  it("is sent with a `raw` array, which the driver requires of a tagged template", () => {
    let received: TemplateStringsArray | undefined;
    statementFrom((strings) => (received = strings), sqlFragment`a${1}b`);

    expect(Array.isArray(received)).toBe(true);
    expect(Array.isArray(received?.raw)).toBe(true);
    expect(Object.isFrozen(received)).toBe(true);
  });
});
