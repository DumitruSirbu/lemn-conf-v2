/** What a promise rejects with, or a failure of the test if it does not reject. */
export async function rejectionOf(
  pending: PromiseLike<unknown>,
): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection, but the promise resolved");
}
