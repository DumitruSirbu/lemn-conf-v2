import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vitest";

import type { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import type { ContactScreen } from "@/contact/contact-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import type { readSentReference } from "@/lib/server/contact/sent-reference";

/**
 * What crosses to the client is exactly the answer's type, never a wider one (ADR 0163 A3). `tsc` decides this: vitest
 * only runs the file, so a widened prop turns `pnpm typecheck` red and this file's assertions with it.
 */
describe("the sent-reference prop", () => {
  it("is exactly SentReferenceAnswer on the hydrator, the screen and the read that makes it", () => {
    expectTypeOf<
      ComponentProps<typeof HydrateAndContact>["sentReference"]
    >().toEqualTypeOf<SentReferenceAnswer>();
    expectTypeOf<
      ComponentProps<typeof ContactScreen>["sentReference"]
    >().toEqualTypeOf<SentReferenceAnswer>();
    expectTypeOf<
      Awaited<ReturnType<typeof readSentReference>>
    >().toEqualTypeOf<SentReferenceAnswer>();
  });
});
