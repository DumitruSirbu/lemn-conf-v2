// The hook reads the draft as it is at the moment an answer arrives, so a host that gives it no reading cannot be
// judged against the book it last rendered: the reading is a required input, and leaving it out is a type error. The
// proof is made by the type checker (`tsc --noEmit`, which covers the tests); the runtime part only keeps the cases from being dead code.
import { describe, expect, expectTypeOf, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import type {
  DraftFactsNow,
  ItemAvailabilityInput,
} from "@/price-dashboard/use-item-availability";

import { draftMovingOnEveryRead } from "../support/draft-facts-now";

const NOTHING_OFF = { revision: "1", disabled: [] };

const WITHOUT_DRAFT_READER = {
  observed: NOTHING_OFF,
  book: SAMPLE_PRICE_BOOK,
  defaults: {},
  client: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
  deleteFromDraft: () => Promise.resolve({ kind: "failed" } as const),
  isDraftOnly: () => false,
} satisfies Omit<ItemAvailabilityInput, "readDraftNow">;

describe("the input of the availability hook", () => {
  it("takes the reading of the draft as a required input, never as an optional one", () => {
    expectTypeOf<ItemAvailabilityInput["readDraftNow"]>().toEqualTypeOf<
      () => DraftFactsNow
    >();
  });

  it("is a type error to give it without the reading, and complete once the reading is added", () => {
    // @ts-expect-error `readDraftNow` is required: a host with no draft reader of its own no longer type-checks
    const incomplete: ItemAvailabilityInput = WITHOUT_DRAFT_READER;
    const complete: ItemAvailabilityInput = {
      ...WITHOUT_DRAFT_READER,
      readDraftNow: draftMovingOnEveryRead(),
    };

    expect("readDraftNow" in incomplete).toBe(false);
    expect(complete.readDraftNow().book).toBe(SAMPLE_PRICE_BOOK);
  });
});
