/**
 * A stand-in for the `neon` driver that answers the price dashboard export's statements the way PostgreSQL would for the
 * three clauses a keyset walk depends on, so a test can walk the production source page by page and compare the result
 * with the table. It reads the statement text, not a hand-written expectation of it, and refuses a shape it cannot
 * interpret rather than guess.
 *
 * What it models, because each is where a keyset walk goes wrong:
 * - `where <alias>.<key> > ?` / `>= ?` compares as a `bigint`, from the bound's digits, so a bound that went through a
 *   JavaScript number loses digits past 2^53 here as it would in the application.
 * - `order by <alias>.<key>` sorts as a `bigint`; a bare `order by <key>` where the select list has `<key>::text as <key>`
 *   binds to that output column and sorts as text, the PostgreSQL rule that puts version 9 after version 10.
 * - `limit ?` takes the last bound value.
 */
export type FakeTableRow = Readonly<Record<string, unknown>>;

const WHERE_BOUND = /\bwhere\s+[a-z]\.([a-z_]+)\s*(>=|>)\s*\?/;
const ORDER_BY = /\border by\s+(?:([a-z])\.)?([a-z_]+)\s+limit\s+\?\s*$/;
const FROM_TABLE = /\bfrom\s+([a-z_]+)\b/;
const TEXT_OUTPUT_COLUMN = /\b[a-z]\.([a-z_]+)::text\s+as\s+([a-z_]+)/g;

export type FakeTables = Readonly<Record<string, readonly FakeTableRow[]>>;

export function answerFromTables(
  tables: FakeTables,
  statementText: string,
  values: readonly unknown[],
): FakeTableRow[] {
  const text = statementText.replace(/\s+/g, " ").trim().toLowerCase();
  const tableName = FROM_TABLE.exec(text)?.[1];
  const order = ORDER_BY.exec(text);
  const rows = tableName === undefined ? undefined : tables[tableName];
  if (rows === undefined || order === null)
    throw new Error(`the fake database cannot interpret: ${text}`);

  const [, qualifier, orderedName] = order;
  const bound = WHERE_BOUND.exec(text);
  const kept =
    bound === null
      ? [...rows]
      : rows.filter(keptBy(bound[1] ?? "", bound[2] ?? ">", values[0]));
  const isTextOrder =
    qualifier === undefined && textOutputColumnsOf(text).has(orderedName ?? "");
  const sorted = kept.sort(compareBy(orderedName ?? "", isTextOrder));
  return sorted.slice(0, Number(values.at(-1)));
}

function keptBy(
  column: string,
  operator: string,
  boundValue: unknown,
): (row: FakeTableRow) => boolean {
  const bound = BigInt(String(boundValue));
  return (row) => {
    const value = BigInt(String(row[column]));
    return operator === ">" ? value > bound : value >= bound;
  };
}

function compareBy(
  column: string,
  isTextOrder: boolean,
): (left: FakeTableRow, right: FakeTableRow) => number {
  return (left, right) => {
    const leftText = String(left[column]);
    const rightText = String(right[column]);
    if (isTextOrder)
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    const difference = BigInt(leftText) - BigInt(rightText);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  };
}

function textOutputColumnsOf(text: string): Set<string> {
  return new Set(
    [...text.matchAll(TEXT_OUTPUT_COLUMN)].map(([, , alias]) => alias ?? ""),
  );
}

/** What a walk read: the statements the source sent, so a test can count round trips and read each bound. */
export const fakeDatabase: {
  tables: FakeTables;
  sent: { text: string; values: readonly unknown[] }[];
} = { tables: {}, sent: [] };

export function resetFakeDatabase(tables: FakeTables = {}): void {
  fakeDatabase.tables = tables;
  fakeDatabase.sent.length = 0;
}

/** `@neondatabase/serverless` with `neon` replaced by the interpreter above, reading `fakeDatabase.tables`. */
export function withFakePriceDashboardDriver<Module extends object>(
  original: Module,
): Module {
  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    return {
      then(
        onFulfilled: (rows: FakeTableRow[]) => unknown,
        onRejected: (reason: unknown) => unknown,
      ) {
        fakeDatabase.sent.push({ text, values });
        return new Promise<FakeTableRow[]>((resolve) => {
          resolve(answerFromTables(fakeDatabase.tables, text, values));
        }).then(onFulfilled, onRejected);
      },
    };
  };
  return { ...original, neon: () => tagged };
}
