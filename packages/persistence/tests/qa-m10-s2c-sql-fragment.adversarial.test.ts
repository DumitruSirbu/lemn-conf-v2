import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SqlFragment,
  sqlFragment,
  statementFrom,
} from "../src/sql-fragment.js";

// A fragment built from any nesting of texts and values reads as the flat statement the nesting stands for: the same text,
// and the same values in the same order, with a slot where a value was bound and never where a text merely looks like one.

interface Node {
  readonly texts: readonly string[];
  readonly parts: readonly Part[];
}

type Part =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "fragment"; readonly node: Node };

const textArbitrary = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.constantFrom("$1", "?", "${x}", "`", "'", "\\", "::int", "\n", ""),
);

const valueArbitrary = fc.oneof(
  fc.integer(),
  fc.string({ maxLength: 8 }),
  fc.constantFrom("$1", "'; drop table designs; --", "${x}", null, undefined),
  fc.constant({ strings: ["drop"], values: [] }),
);

const nodeArbitrary: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>((tie) => ({
  node: fc
    .array(
      fc.oneof(
        {
          arbitrary: valueArbitrary.map((value) => ({
            kind: "value" as const,
            value,
          })),
          weight: 3,
        },
        {
          arbitrary: tie("node").map((node) => ({
            kind: "fragment" as const,
            node,
          })),
          weight: 1,
          depthSize: "small",
        },
      ),
      { maxLength: 4 },
    )
    .chain((parts) =>
      fc
        .array(textArbitrary, {
          minLength: parts.length + 1,
          maxLength: parts.length + 1,
        })
        .map((texts) => ({ texts, parts })),
    ),
})).node;

function built(node: Node): SqlFragment {
  const strings = Object.assign([...node.texts], { raw: [...node.texts] });
  const values = node.parts.map((part) =>
    part.kind === "value" ? part.value : built(part.node),
  );
  return sqlFragment(strings as unknown as TemplateStringsArray, ...values);
}

function flattened(node: Node): { text: string; values: unknown[] } {
  let text = node.texts[0] ?? "";
  const values: unknown[] = [];
  node.parts.forEach((part, index) => {
    if (part.kind === "value") {
      text += "\u0000SLOT";
      values.push(part.value);
    } else {
      const inner = flattened(part.node);
      text += inner.text;
      values.push(...inner.values);
    }
    text += node.texts[index + 1] ?? "";
  });
  return { text, values };
}

function recording(strings: TemplateStringsArray, ...values: unknown[]) {
  return { text: strings.join("\u0000SLOT"), values };
}

describe("a SQL fragment built from any nesting", () => {
  it("is sent as the flat text and the flat values the nesting stands for", () => {
    fc.assert(
      fc.property(nodeArbitrary, (node) => {
        expect(statementFrom(recording, built(node))).toEqual(flattened(node));
      }),
      { numRuns: 1_000 },
    );
  });

  it("keeps one more piece of text than it has values, whatever was spliced", () => {
    fc.assert(
      fc.property(nodeArbitrary, (node) => {
        const fragment = built(node);

        expect(fragment.strings.length).toBe(fragment.values.length + 1);
      }),
      { numRuns: 1_000 },
    );
  });

  it("never reads a value that is a fragment's lookalike as text", () => {
    fc.assert(
      fc.property(valueArbitrary, (value) => {
        const sent = statementFrom(recording, sqlFragment`a ${value} b`);

        expect(sent).toEqual({ text: "a \u0000SLOT b", values: [value] });
      }),
      { numRuns: 200 },
    );
  });

  it("does not change a fragment when it is spliced, so one fragment serves two statements alike", () => {
    fc.assert(
      fc.property(nodeArbitrary, (node) => {
        const shared = built(node);
        const before = statementFrom(recording, shared);

        statementFrom(recording, sqlFragment`x ${shared} y ${shared}`);

        expect(statementFrom(recording, shared)).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it("is a SqlFragment instance, so only what this module built is ever spliced", () => {
    expect(sqlFragment`a`).toBeInstanceOf(SqlFragment);
  });
});

describe("the one definition of a counted design", () => {
  it("is spliced the same into a count and into a statement that reads it per row", async () => {
    const { designChoosesTier, designPlacesBodies } = await import(
      "../src/kitchen-usage-statements.js"
    );
    const operands = {
      settingKey: sqlFragment`${"materialTierId"}`,
      tierId: sqlFragment`${"t"}`,
      isFallback: sqlFragment`${false}`,
    };
    const perRow = designChoosesTier({
      settingKey: sqlFragment`row.key`,
      tierId: sqlFragment`row.id`,
      isFallback: sqlFragment`row.fallback`,
    });

    const bound = statementFrom(recording, designChoosesTier(operands));
    const column = statementFrom(recording, perRow);

    expect(bound.values).toEqual(["materialTierId", false, "t", "t"]);
    expect(column.values).toEqual([]);
    expect(column.text).toContain("d.deleted_by_client_at is null");
    expect(bound.text).toContain("d.deleted_by_client_at is null");
    expect(
      statementFrom(recording, designPlacesBodies(sqlFragment`${["a"]}`)).text,
    ).toContain("d.deleted_by_client_at is null");
  });
});
