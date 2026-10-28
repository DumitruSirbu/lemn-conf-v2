/** What `action` throws, or a failure if it throws nothing: lets a test assert on the error's own fields. */
export function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}
