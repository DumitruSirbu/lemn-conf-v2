// H1-c (M10 plan, Lane H): a document without `settings.handle` renders and prices exactly as before.
//
// The expectation is a set of files written by the **base commit's code** (`be4a23bb`, before wave H1;
// vitest reported `Snapshots 20 written` at the first run, before any `src/` edit) and read back here, so
// the comparison is against bytes the old code produced and not against a restatement the new code could
// share a defect with. They cover every reader of a handle: the placement records the scene draws from,
// `describeSelection`, `isPushToOpen`, and the hardware line's push-to-open count.
//
// Only the handle-related projection is compared. The stored files also hold labels, size sets and the
// hinge and drawer counts, which other lanes change on purpose; comparing those would fail this file for
// reasons that are not about handles. The priced design was compared in full, once, at the wave's close
// and is not kept: pricing is another lane's, and its numbers move legitimately when it lands.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  documentsWithNoKitchenHandle,
  handleFactsOf,
  handleProjectionOf,
} from "./handle-document-facts.js";

const GOLDEN_DIRECTORY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "golden",
);

function storedFactsOf(name: string): unknown {
  return JSON.parse(
    readFileSync(path.join(GOLDEN_DIRECTORY, `${name}.json`), "utf8"),
  ) as unknown;
}

describe("a document with no settings.handle reads exactly as it did before the kitchen handle existed", () => {
  const documents = documentsWithNoKitchenHandle();

  it("covers the seeded kitchen, every composed room and the same documents wearing their own handles", () => {
    expect(documents.map((document) => document.name).sort()).toEqual([
      "generated-L-3600x3000",
      "generated-L-3600x3000+own-handles",
      "generated-L-4200x3200",
      "generated-L-4200x3200+own-handles",
      "generated-U-4200x3600",
      "generated-U-4200x3600+own-handles",
      "generated-linear-3200x2400",
      "generated-linear-3200x2400+own-handles",
      "seeded",
      "seeded+own-handles",
    ]);
  });

  for (const document of documents) {
    it(`${document.name}: records, selection handles, latches and the push-to-open count are as the base wrote them`, () => {
      expect(handleProjectionOf(handleFactsOf(document))).toEqual(
        handleProjectionOf(storedFactsOf(document.name)),
      );
    });
  }
});
