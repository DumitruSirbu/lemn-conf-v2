import { describe, expect, it } from "vitest";

import { FakeContactSubmissionStore } from "../src/fake-contact-submission-store.js";
import {
  DIGEST_A,
  FAKE_NAME,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import { describeContactSubmissionStoreContract } from "./support/contact-submission-store-contract.js";

let idCounter = 0;
function newClientRequestId(): string {
  idCounter += 1;
  return `fake-store-test-${String(idCounter).padStart(8, "0")}`;
}

describe("FakeContactSubmissionStore", () => {
  describeContactSubmissionStoreContract({
    createStore: (options) => new FakeContactSubmissionStore(options),
    newClientRequestId,
  });

  describe("beyond the contract, what only the fake can show", () => {
    it("holds one row for a request however often it is recorded", async () => {
      const store = new FakeContactSubmissionStore();
      const id = newClientRequestId();

      await store.record(aDesignSubmission(id));
      await store.record(aDesignSubmission(id));

      expect(store.heldSubmissions()).toHaveLength(1);
    });

    it("keeps the first instant a request was marked, by the database's clock", async () => {
      const instants = [
        new Date(Date.UTC(2001, 0, 1)),
        new Date(Date.UTC(2002, 0, 1)),
      ];
      const store = new FakeContactSubmissionStore({
        now: () => instants.shift() ?? new Date(0),
      });
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));

      await store.markNotified(id);
      await store.markNotified(id);

      const [held] = store.heldSubmissions();
      expect(held?.notifiedAt).toEqual(new Date(Date.UTC(2002, 0, 1)));
    });

    it("holds the contact the request carried, which no operation answers", async () => {
      const store = new FakeContactSubmissionStore();
      await store.record(aDesignSubmission(newClientRequestId()));

      const [held] = store.heldSubmissions();

      expect(held?.submission.contact.name).toBe(FAKE_NAME);
    });

    it("hands out copies, so a test cannot change what the store holds", async () => {
      const store = new FakeContactSubmissionStore();
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));
      const [held] = store.heldSubmissions();
      if (held === undefined) throw new Error("the store holds no row");

      (held.submission.contact as { name: string }).name = "changed";

      expect(store.heldSubmissions()[0]?.submission.contact.name).toBe(
        FAKE_NAME,
      );
    });

    it("refuses a proposal that is not a reference's shape, and stores nothing", async () => {
      const store = new FakeContactSubmissionStore({
        proposeReference: () => "lowercase",
      });
      const id = newClientRequestId();

      await expect(store.record(aDesignSubmission(id))).rejects.toThrow(
        /reference must be/,
      );

      expect(
        await store.lookUp({ clientRequestId: id, payloadDigest: DIGEST_A }),
      ).toEqual({ kind: "absent" });
    });

    it("holds nothing after a look-up, which writes nothing", async () => {
      const store = new FakeContactSubmissionStore();
      const request = {
        clientRequestId: newClientRequestId(),
        payloadDigest: DIGEST_A,
      };

      await store.lookUp(request);
      await store.lookUp(request);

      expect(store.heldSubmissions()).toEqual([]);
    });
  });
});
