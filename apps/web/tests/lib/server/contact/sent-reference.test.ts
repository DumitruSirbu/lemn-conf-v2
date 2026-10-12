import { ContactSubmissionStoreError } from "@lemnaria/persistence";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findSentReference = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({ findSentReference }),
}));

import { readSentReference } from "@/lib/server/contact/sent-reference";

const REQUEST = { designId: "design0123456789abcde", revision: "4" } as const;

beforeEach(() => {
  findSentReference.mockReset();
});

describe("readSentReference", () => {
  it("asks the store for the design at the revision it was given, and nothing more", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    await readSentReference(REQUEST);

    expect(findSentReference.mock.calls).toEqual([[REQUEST]]);
  });

  it("answers the reference of a notified request as the kind and the string", async () => {
    findSentReference.mockResolvedValue({ kind: "sent", reference: "LM-2614" });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "sent",
      reference: "LM-2614",
    });
  });

  it("answers none for a design with no notified request", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "none",
    });
  });

  it("hands on the reference and the kind and no other field the store answered with", async () => {
    findSentReference.mockResolvedValue({
      kind: "sent",
      reference: "LM-2614",
      phone: "069 123 456",
      designRevision: "4",
    });

    const answer = await readSentReference(REQUEST);

    expect(Object.keys(answer).sort()).toEqual(["kind", "reference"]);
    expect(JSON.stringify(answer)).not.toContain("069");
  });

  it.each([
    [
      "the store's own error",
      new ContactSubmissionStoreError("find a sent reference"),
    ],
    ["a driver's error carrying a value", new Error("password=hunter2")],
    ["a thrown string", "connection reset"],
  ])(
    "answers unknown, with nothing of it, when the read fails with %s",
    async (_name, failure) => {
      findSentReference.mockRejectedValue(failure);

      const answer = await readSentReference(REQUEST);

      expect(answer).toEqual({ kind: "unknown" });
    },
  );

  it("answers unknown when the instance cannot be made, as a read that threw", async () => {
    findSentReference.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "unknown",
    });
  });
});
