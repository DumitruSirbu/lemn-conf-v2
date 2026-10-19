/** One statement the store sent: its text with each interpolation as `?`, and the values in order. */
export interface SentQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** One `sql.transaction([...])` round trip: the statements it carried, in order, and the options it was given. */
export interface SentTransaction {
  readonly statements: readonly SentQuery[];
  readonly options: unknown;
}

/**
 * What a test using the query driver queues and reads. A statement awaited on its own plays one reply and is recorded in
 * `statements`; a transaction is recorded in `transactions` (its statements are never run on their own) and plays one
 * reply, the rows of its last statement, with an empty result for each statement before it.
 */
export const queryDriver: {
  statements: SentQuery[];
  transactions: SentTransaction[];
  replies: (() => unknown)[];
} = { statements: [], transactions: [], replies: [] };

export function resetQueryDriver(): void {
  queryDriver.statements.length = 0;
  queryDriver.transactions.length = 0;
  queryDriver.replies.length = 0;
}

export function answerQueryWith(rows: unknown): void {
  queryDriver.replies.push(() => Promise.resolve(rows));
}

/** One result per statement of the next transaction, for a store that reads a statement other than the last. */
class TransactionResults {
  constructor(readonly results: readonly unknown[]) {}
}

export function answerTransactionWith(results: readonly unknown[]): void {
  queryDriver.replies.push(() =>
    Promise.resolve(new TransactionResults(results)),
  );
}

export function failQueryWith(error: unknown): void {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a driver may reject with anything.
  queryDriver.replies.push(() => Promise.reject(error));
}

/** Every statement the store sent, a lone one or one inside a transaction, in the order it was sent. */
export function everySentQuery(): SentQuery[] {
  return [
    ...queryDriver.statements,
    ...queryDriver.transactions.flatMap(({ statements }) => statements),
  ];
}

interface LazyQuery extends PromiseLike<unknown>, SentQuery {}

function nextReply(): () => unknown {
  const reply = queryDriver.replies.shift();
  if (reply === undefined) throw new Error("the test queued no reply");
  return reply;
}

/** Like Neon's: building a query runs nothing, awaiting it does, and `transaction` takes built queries. */
function lazyQuery(
  strings: TemplateStringsArray,
  values: readonly unknown[],
): LazyQuery {
  const query: SentQuery = { text: strings.join("?"), values };
  return {
    ...query,
    then(onFulfilled, onRejected) {
      queryDriver.statements.push(query);
      return Promise.resolve(nextReply()()).then(onFulfilled, onRejected);
    },
  };
}

function transaction(
  queries: readonly SentQuery[],
  options: unknown,
): Promise<unknown[]> {
  queryDriver.transactions.push({
    statements: queries.map(({ text, values }) => ({ text, values })),
    options,
  });
  return Promise.resolve(nextReply()()).then((rows) =>
    rows instanceof TransactionResults
      ? [...rows.results]
      : [...queries.slice(0, -1).map(() => []), rows],
  );
}

/** `@neondatabase/serverless` with `neon` replaced by the recording driver above. */
export function withMockedQueryDriver<Module extends object>(
  original: Module,
): Module {
  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) =>
    lazyQuery(strings, values);
  return {
    ...original,
    neon: () => Object.assign(tagged, { transaction }),
  };
}
