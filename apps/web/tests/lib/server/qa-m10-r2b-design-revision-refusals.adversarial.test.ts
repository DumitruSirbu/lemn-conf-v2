import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readPresetSaveBody } from "@/lib/server/preset/preset-save-body";

import { DESIGN_ID, aHarness, bodyOf } from "./contact/submit-contact-harness";

/**
 * A design revision above a `bigint`'s range, or `0`, is refused where the request enters, as every other malformed
 * revision is: the same answer as a revision with a leading zero, and nothing downstream asked.
 */

const WIDEST_REVISION = "9223372036854775807";

const NEVER_A_DESIGN_REVISION: readonly (readonly [string, string])[] = [
  ["zero", "0"],
  ["one past the widest bigint", "9223372036854775808"],
  ["nineteen nines", "9".repeat(19)],
  ["twenty digits", "1".repeat(20)],
];

const MALFORMED_REFERENCE = "01";

const saveAuthorized = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ saveAuthorized }),
}));

const { PUT } = await import("../../../src/app/api/designs/[id]/route");

async function wireOf(response: Response): Promise<string> {
  return JSON.stringify({
    status: response.status,
    body: await response.text(),
  });
}

describe("the contact request's design revision", () => {
  async function submitAt(revision: string) {
    const harness = aHarness();
    const answer = await harness.submit(
      bodyOf({ design: { id: DESIGN_ID, revision } }),
    );
    return { harness, answer };
  }

  it.each(NEVER_A_DESIGN_REVISION)(
    "%s is a 400 CONTACT_INVALID on design.revision, equal on the wire to a malformed revision, and nothing is loaded or stored",
    async (_name, revision) => {
      const malformed = await submitAt(MALFORMED_REFERENCE);

      const { harness, answer } = await submitAt(revision);

      expect(answer.status).toBe(400);
      const body = (await answer.clone().json()) as {
        code: string;
        issues: { field: string }[];
      };
      expect(body.code).toBe("CONTACT_INVALID");
      expect(body.issues.map(({ field }) => field)).toEqual([
        "design.revision",
      ]);
      expect(await wireOf(answer)).toBe(await wireOf(malformed.answer));
      expect(harness.calls).not.toContain("load");
      expect(harness.calls).not.toContain("record");
      expect(harness.store.heldSubmissions()).toHaveLength(0);
    },
  );

  it("the widest bigint is a revision: a design held at it is sent", async () => {
    const harness = aHarness({
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: KITCHEN_L_DESIGN,
          revision: WIDEST_REVISION,
        }),
    });

    const answer = await harness.submit(
      bodyOf({ design: { id: DESIGN_ID, revision: WIDEST_REVISION } }),
    );

    expect(answer.status).toBe(200);
  });
});

describe("the preset save's revision", () => {
  function presetRequest(revision: unknown): NextRequest {
    return new NextRequest("https://example.test/api/designs/x/preset", {
      method: "POST",
      body: JSON.stringify({
        revision,
        imageType: "image/png",
        image: "AAAA",
      }),
    });
  }

  it.each(NEVER_A_DESIGN_REVISION)(
    "%s is refused as the request is invalid, equal on the wire to a malformed revision",
    async (_name, revision) => {
      const malformed = await readPresetSaveBody(
        presetRequest(MALFORMED_REFERENCE),
      );
      const refused = await readPresetSaveBody(presetRequest(revision));

      expect(malformed.ok).toBe(false);
      expect(refused.ok).toBe(false);
      if (refused.ok || malformed.ok) return;
      expect(refused.response.status).toBe(400);
      expect(await wireOf(refused.response)).toBe(
        await wireOf(malformed.response),
      );
    },
  );

  it.each([["1"], [WIDEST_REVISION]])(
    "the revision %s is read",
    async (revision) => {
      const read = await readPresetSaveBody(presetRequest(revision));

      expect(read.ok && read.body.revision).toBe(revision);
    },
  );
});

describe("the design save's expected revision header", () => {
  const WRITE_COOKIE = `lemnaria_write_token_${DESIGN_ID}=sweep-token`;

  beforeEach(() => {
    saveAuthorized.mockReset();
    saveAuthorized.mockResolvedValue({
      id: DESIGN_ID,
      revision: "2",
      ownsVisitor: false,
    });
  });

  function saveAt(revision: string): Promise<Response> {
    return PUT(
      new NextRequest(`https://example.test/api/designs/${DESIGN_ID}`, {
        method: "PUT",
        headers: {
          cookie: WRITE_COOKIE,
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify(KITCHEN_L_DESIGN),
      }),
      { params: Promise.resolve({ id: DESIGN_ID }) },
    );
  }

  it.each(NEVER_A_DESIGN_REVISION)(
    "%s is a 400 revision-required, equal on the wire to a malformed revision, and the repository is never asked",
    async (_name, revision) => {
      const malformed = await saveAt(MALFORMED_REFERENCE);

      const answer = await saveAt(revision);

      expect(answer.status).toBe(400);
      expect(await wireOf(answer)).toBe(await wireOf(malformed));
      expect(saveAuthorized).not.toHaveBeenCalled();
    },
  );

  it.each([["1"], [WIDEST_REVISION]])(
    "the revision %s reaches the repository as text, unchanged",
    async (revision) => {
      const answer = await saveAt(revision);

      expect(answer.status).toBe(200);
      expect(saveAuthorized).toHaveBeenCalledTimes(1);
      expect(saveAuthorized.mock.calls[0]?.[0]).toMatchObject({
        expectedRevision: revision,
      });
    },
  );
});
