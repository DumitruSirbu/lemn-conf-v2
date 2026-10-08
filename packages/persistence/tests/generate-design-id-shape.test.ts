import { isDesignId } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";

const SAMPLE_SIZE = 10_000;

describe("generateDesignId against the domain's isDesignId", () => {
  it("makes only ids the domain's predicate accepts", () => {
    const rejected = Array.from(
      { length: SAMPLE_SIZE },
      generateDesignId,
    ).filter((id) => !isDesignId(id));

    expect(rejected).toEqual([]);
  });
});
