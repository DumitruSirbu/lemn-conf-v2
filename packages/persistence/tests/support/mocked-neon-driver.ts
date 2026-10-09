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

/** `@neondatabase/serverless` with `neon` replaced by a tagged template that records the statement and plays the next
 *  queued reply. */
export function withMockedDriver<Module extends object>(
  original: Module,
): Module {
  return {
    ...original,
    neon:
      () =>
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        driver.statements.push({ text: strings.join("?"), values });
        const reply = driver.replies.shift();
        if (reply === undefined) throw new Error("the test queued no reply");
        return reply();
      },
  };
}
