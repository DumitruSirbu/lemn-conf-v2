import type { Mock } from "vitest";

/** The first argument of every call a mock received, typed by the caller, who knows what the mock was called with. */
export function firstArgumentsOf<Argument>(mock: Mock): Argument[] {
  return mock.mock.calls.map((call: unknown[]) => call[0] as Argument);
}
