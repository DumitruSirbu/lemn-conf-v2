/** What a promise rejected with, as a value to assert on. A promise that resolved fails the test that awaited a
 *  rejection, so a call that wrongly succeeds is never read as its own failure. */
export async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (rejection) {
    return rejection;
  }
  throw new Error("the call resolved where a rejection was expected");
}
