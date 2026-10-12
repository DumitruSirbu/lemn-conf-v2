// What the confirmation may claim, decided from the page's design and revision, what the sent request left in memory and
// what the server read. The property is the rule (8M.6, P8); the examples name the cases a failure of it would be.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { resultToShow, type SentReferenceAnswer } from "@/done/result-to-show";
import type { SentRequest } from "@/done/sent-request-memory";

const PAGE = { designId: "design-on-this-page", revision: "4" };

const HANDED_OVER: SentRequest = {
  designId: PAGE.designId,
  revision: PAGE.revision,
  reference: "HAND-OVER-REFERENCE",
  channel: "whatsapp",
  contactValue: "079 123 456",
};

const SERVER_SENT: SentReferenceAnswer = {
  kind: "sent",
  reference: "SERVER-REFERENCE",
};

describe("resultToShow, by example", () => {
  it("names the channel and the typed value, and the hand-over's reference, for a request this tab sent", () => {
    expect(
      resultToShow({
        page: PAGE,
        handedOver: HANDED_OVER,
        server: SERVER_SENT,
      }),
    ).toEqual({
      kind: "sent",
      reference: "HAND-OVER-REFERENCE",
      channelLine: { channel: "whatsapp", contact: "079 123 456" },
    });
  });

  it("is sent from the hand-over alone when the server's read failed", () => {
    expect(
      resultToShow({
        page: PAGE,
        handedOver: HANDED_OVER,
        server: { kind: "unknown" },
      }).kind,
    ).toBe("sent");
  });

  it("shows the server's reference and no typed value after a load", () => {
    expect(
      resultToShow({ page: PAGE, handedOver: undefined, server: SERVER_SENT }),
    ).toEqual({
      kind: "sent",
      reference: "SERVER-REFERENCE",
      channelLine: undefined,
    });
  });

  it("claims no request when the server knows none and nothing matching was handed over", () => {
    expect(
      resultToShow({
        page: PAGE,
        handedOver: undefined,
        server: { kind: "none" },
      }),
    ).toEqual({ kind: "no-request" });
  });

  it("claims nothing either way when the read failed and nothing matching was handed over", () => {
    expect(
      resultToShow({
        page: PAGE,
        handedOver: undefined,
        server: { kind: "unknown" },
      }),
    ).toEqual({ kind: "not-shown" });
  });

  it.each([
    ["another design", { ...HANDED_OVER, designId: "another-design" }],
    ["another revision", { ...HANDED_OVER, revision: "5" }],
  ])(
    "ignores a hand-over for %s, taking the server's reference and no typed value",
    (_name, handedOver) => {
      expect(
        resultToShow({ page: PAGE, handedOver, server: SERVER_SENT }),
      ).toEqual({
        kind: "sent",
        reference: "SERVER-REFERENCE",
        channelLine: undefined,
      });
    },
  );
});

const DESIGN_IDS = ["design-a", "design-b"] as const;
const REVISIONS = ["1", "2"] as const;

type Arm = "matching" | "other-design" | "other-revision" | "nothing";

function armOf(handedOver: SentRequest | undefined, page: typeof PAGE): Arm {
  if (handedOver === undefined) return "nothing";
  if (handedOver.designId !== page.designId) return "other-design";
  return handedOver.revision === page.revision ? "matching" : "other-revision";
}

const handedOverArbitrary = fc.option(
  fc.record({
    designId: fc.constantFrom(...DESIGN_IDS),
    revision: fc.constantFrom(...REVISIONS),
    reference: fc.uuid().map((id) => `HAND-${id}`),
    channel: fc.constantFrom("phone", "whatsapp", "email"),
    contactValue: fc.string({ minLength: 1 }).map((typed) => `typed:${typed}`),
  }),
  { nil: undefined, freq: 4 },
);

const serverArbitrary = fc.oneof(
  fc
    .uuid()
    .map(
      (id): SentReferenceAnswer => ({ kind: "sent", reference: `SRV-${id}` }),
    ),
  fc.constant<SentReferenceAnswer>({ kind: "none" }),
  fc.constant<SentReferenceAnswer>({ kind: "unknown" }),
);

const MINIMUM_RUNS_PER_ARM = 5;

describe("resultToShow, as a property over every pairing of a hand-over and an answer (P8)", () => {
  it("claims a send iff the hand-over is this page's or the server says sent, shows the typed value only from the hand-over, and never another page's reference", () => {
    const runsByArm = new Map<string, number>();

    fc.assert(
      fc.property(
        fc.constantFrom(...DESIGN_IDS),
        fc.constantFrom(...REVISIONS),
        handedOverArbitrary,
        serverArbitrary,
        (designId, revision, handedOver, server) => {
          const page = { designId, revision };
          const arm = armOf(handedOver, page);
          const armWithAnswer = `${arm}/${server.kind}`;
          runsByArm.set(armWithAnswer, (runsByArm.get(armWithAnswer) ?? 0) + 1);

          const result = resultToShow({ page, handedOver, server });

          const isHandedOverForThePage = arm === "matching";
          expect(result.kind === "sent").toBe(
            isHandedOverForThePage || server.kind === "sent",
          );
          if (result.kind === "sent") {
            expect(result.channelLine !== undefined).toBe(
              isHandedOverForThePage,
            );
            expect(result.reference).toBe(
              isHandedOverForThePage
                ? handedOver?.reference
                : server.kind === "sent"
                  ? server.reference
                  : "unreachable",
            );
            if (handedOver !== undefined && isHandedOverForThePage) {
              expect(result.channelLine).toEqual({
                channel: handedOver.channel,
                contact: handedOver.contactValue,
              });
            }
          } else {
            expect(result.kind).toBe(
              server.kind === "none" ? "no-request" : "not-shown",
            );
          }
          if (!isHandedOverForThePage) {
            expect(JSON.stringify(result)).not.toContain("HAND-");
            expect(JSON.stringify(result)).not.toContain("typed:");
          }
        },
      ),
      { numRuns: 600 },
    );

    const arms = ["matching", "other-design", "other-revision", "nothing"];
    const answers = ["sent", "none", "unknown"];
    for (const arm of arms) {
      for (const answer of answers) {
        expect(
          runsByArm.get(`${arm}/${answer}`) ?? 0,
          `${arm}/${answer}`,
        ).toBeGreaterThanOrEqual(MINIMUM_RUNS_PER_ARM);
      }
    }
  });
});
