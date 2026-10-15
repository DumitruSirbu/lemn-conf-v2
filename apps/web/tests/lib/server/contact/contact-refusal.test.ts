import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTACT_REFUSAL_CODES,
  type ContactRefusal,
  type ContactRefusalCode,
  type DesignRefusal,
} from "@/lib/server/contact/contact-responses";

const A_REFERENCE = "LM-7K3QWXY2";

/** From a module graph of its own: a refusal's line is once for a process and a code, so a test that counts lines must
 *  start with a process that wrote none. */
async function freshRefusal() {
  vi.resetModules();
  const refusal = await import("@/lib/server/contact/contact-refusal");
  return {
    ...refusal,
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

function refusalOf(code: ContactRefusalCode): ContactRefusal {
  if (code === "CONTACT_INVALID") return { code, issues: [] };
  if (code === "CONTACT_DESIGN_DOES_NOT_FIT") return { code, placementIds: [] };
  return { code };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a refusal's line and its answer, made from its one code", () => {
  it.each(CONTACT_REFUSAL_CODES)(
    "writes %s's line under the code and the status its answer carries",
    async (code) => {
      const { refuseWithLine, warn } = await freshRefusal();

      const answer = refuseWithLine(refusalOf(code));

      expect(((await answer.json()) as { code: string }).code).toBe(code);
      expect(warn.mock.calls).toEqual([
        [
          "[contact]",
          {
            event: "contact-request-refused",
            refusalCode: code,
            status: answer.status,
          },
        ],
      ]);
    },
  );

  it("writes the line once for a process and a code, and answers each time", async () => {
    const { refuseWithLine, warn } = await freshRefusal();

    const answers = [1, 2, 3].map(() =>
      refuseWithLine({ code: "CONTACT_NOT_JSON" }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(answers.map(({ status }) => status)).toEqual([415, 415, 415]);
  });
});

describe("a stored request refused for its design", () => {
  const REFUSALS: readonly DesignRefusal[] = [
    { code: "CONTACT_DESIGN_NOT_CURRENT" },
    { code: "CONTACT_DESIGN_DOES_NOT_FIT", placementIds: ["p1"] },
  ];

  it.each(REFUSALS)(
    "writes $code's line with the reference each time, and answers the same code",
    async (refusal) => {
      const { refuseStoredWithLine, error } = await freshRefusal();

      const answers = [
        refuseStoredWithLine(refusal, A_REFERENCE),
        refuseStoredWithLine(refusal, A_REFERENCE),
      ];

      expect(error.mock.calls.map(([, line]) => line as unknown)).toEqual([
        {
          event: "contact-stored-request-refused",
          refusalCode: refusal.code,
          status: answers[0]?.status,
          reference: A_REFERENCE,
        },
        {
          event: "contact-stored-request-refused",
          refusalCode: refusal.code,
          status: answers[0]?.status,
          reference: A_REFERENCE,
        },
      ]);
      expect(
        ((await answers[0]?.json()) as { code: string } | undefined)?.code,
      ).toBe(refusal.code);
    },
  );

  it("holds the reference in its line and never in its answer", async () => {
    const { refuseStoredWithLine } = await freshRefusal();

    const answer = refuseStoredWithLine(
      { code: "CONTACT_DESIGN_NOT_CURRENT" },
      A_REFERENCE,
    );

    expect(await answer.text()).not.toContain("LM-");
  });
});
