import type { StatementTag } from "./preset-statements.js";

/**
 * A piece of SQL text with its bound values, which another fragment or statement can contain. A predicate two statements
 * must share is a fragment: `sqlFragment` splices an `instanceof SqlFragment` value in as text and binds any other, and
 * `statementFrom` sends the result as one tagged template. The splice is this module's own, so the same text reaches the
 * driver, a recording tag and the privilege test's tag alike, whatever each does with a nested query.
 */
export class SqlFragment {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];

  constructor(strings: readonly string[], values: readonly unknown[]) {
    this.strings = strings;
    this.values = values;
  }
}

/** The tag that builds a fragment. A fragment interpolated into it is spliced in as text; any other value is bound. */
export function sqlFragment(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SqlFragment {
  const builder = new FragmentBuilder();
  builder.appendText(strings[0] ?? "");
  values.forEach((value, index) => {
    if (value instanceof SqlFragment) builder.appendFragment(value);
    else builder.appendValue(value);
    builder.appendText(strings[index + 1] ?? "");
  });
  return builder.build();
}

/** Sends the fragment as the one tagged template it stands for, as the driver and the recording tags expect it. */
export function statementFrom<Statement>(
  sql: StatementTag<Statement>,
  fragment: SqlFragment,
): Statement {
  const strings = Object.freeze(
    Object.assign([...fragment.strings], { raw: [...fragment.strings] }),
  );
  return sql(strings, ...fragment.values);
}

/** Collects the text between two bound values, so a fragment spliced in joins its first and last pieces to its neighbours. */
class FragmentBuilder {
  private readonly pieces: string[] = [];
  private readonly values: unknown[] = [];
  private openPiece = "";

  appendText(text: string): void {
    this.openPiece += text;
  }

  appendValue(value: unknown): void {
    this.pieces.push(this.openPiece);
    this.openPiece = "";
    this.values.push(value);
  }

  appendFragment(inner: SqlFragment): void {
    inner.values.forEach((value, index) => {
      this.appendText(inner.strings[index] ?? "");
      this.appendValue(value);
    });
    this.appendText(inner.strings[inner.values.length] ?? "");
  }

  build(): SqlFragment {
    return new SqlFragment([...this.pieces, this.openPiece], this.values);
  }
}
