/** One statement the store sent: its text with each interpolation as `?`, and the values in order. */
export interface SentStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** What a test using the mocked driver queues and reads. Shared by every test file that mocks `neon`. */
export const driver: {
  statements: SentStatement[];
  replies: (() => unknown)[];
} = { statements: [], replies: [] };

export function resetDriver(): void {
  driver.statements.length = 0;
  driver.replies.length = 0;
}

export function answerWith(rows: unknown): void {
  driver.replies.push(() => Promise.resolve(rows));
}

export function failWith(error: unknown): void {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a driver may reject with anything.
  driver.replies.push(() => Promise.reject(error));
}

export function throwSynchronously(error: unknown): void {
  driver.replies.push(() => {
    throw error;
  });
}

type RecordingTemplate = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => SentStatement;

/**
 * `@neondatabase/serverless` with `neon` replaced by a tagged template that records the statement and plays the next
 * queued reply. Its `transaction(build)` is one round trip: `build` is handed a template that only records, and the
 * trip is recorded as one statement (the texts joined by `; `, the values in order) and plays one reply, which becomes
 * the last statement's result after an empty result for each statement before it.
 */
export function withMockedDriver<Module extends object>(
  original: Module,
): Module {
  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) => {
    driver.statements.push({ text: strings.join("?"), values });
    const reply = driver.replies.shift();
    if (reply === undefined) throw new Error("the test queued no reply");
    return reply();
  };
  const transaction = (build: (template: RecordingTemplate) => unknown[]) => {
    const queries: SentStatement[] = [];
    build((strings, ...values) => {
      const query = { text: strings.join("?"), values };
      queries.push(query);
      return query;
    });
    driver.statements.push({
      text: queries.map(({ text }) => text).join("; "),
      values: queries.flatMap(({ values }) => values),
    });
    const reply = driver.replies.shift();
    if (reply === undefined) throw new Error("the test queued no reply");
    return Promise.resolve(reply()).then((rows) => [
      ...queries.slice(0, -1).map(() => []),
      rows,
    ]);
  };
  return { ...original, neon: () => Object.assign(tagged, { transaction }) };
}
