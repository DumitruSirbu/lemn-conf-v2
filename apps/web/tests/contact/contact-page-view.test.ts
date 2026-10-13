import { describe, expect, it } from "vitest";

import {
  contactPageViewOf,
  nextContactPageView,
  type ContactPageView,
  type ContactPageViewInput,
} from "@/contact/contact-page-view";
import type { SentReferenceAnswer } from "@/done/result-to-show";

const DESIGN = "design0123456789abcde";
const REVISION = "4";
const SENT: SentReferenceAnswer = { kind: "sent", reference: "LM-2614" };

function inputWith(overrides: {
  readonly server?: SentReferenceAnswer;
  readonly held?: Partial<ContactPageViewInput["held"]>;
}): ContactPageViewInput {
  return {
    server: overrides.server ?? SENT,
    page: { designId: DESIGN, revision: REVISION },
    held: {
      designId: DESIGN,
      revision: REVISION,
      hasUnsavedEdit: false,
      ...overrides.held,
    },
  };
}

const ALREADY_SENT: ContactPageView = {
  kind: "already-sent",
  reference: "LM-2614",
};
const FORM: ContactPageView = { kind: "form" };

describe("contactPageViewOf", () => {
  it("is already sent, with the reference as the server gave it, for the same design clean at the page's revision", () => {
    expect(contactPageViewOf(inputWith({}))).toEqual(ALREADY_SENT);
  });

  it.each([
    ["another design held", { designId: "another0123456789abcd" }],
    ["no design held", { designId: null }],
    ["a newer revision held", { revision: "5" }],
    ["an older revision held", { revision: "3" }],
    ["no revision held", { revision: null }],
    ["an unsaved edit held", { hasUnsavedEdit: true }],
  ])("is the form for %s, though the server said sent", (_name, held) => {
    expect(contactPageViewOf(inputWith({ held }))).toEqual(FORM);
  });

  it.each([
    ["none", { kind: "none" }],
    ["unknown", { kind: "unknown" }],
  ] as const)(
    "is the form for the answer %s with the store held as loaded",
    (_name, server) => {
      expect(contactPageViewOf(inputWith({ server }))).toEqual(FORM);
    },
  );

  it.each([
    "SENT",
    "sent ",
    "already-sent",
    "",
    undefined,
    null,
    7,
    { kind: "sent" },
  ])(
    "is the form for a kind the type does not know, %j, cast past it",
    (kind) => {
      const server = { kind, reference: "LM-2614" } as never;

      expect(contactPageViewOf(inputWith({ server }))).toEqual(FORM);
    },
  );
});

describe("nextContactPageView", () => {
  it("is the pure function's view on the first render", () => {
    expect(nextContactPageView(undefined, inputWith({}))).toEqual(ALREADY_SENT);
    expect(
      nextContactPageView(undefined, inputWith({ held: { revision: "5" } })),
    ).toEqual(FORM);
  });

  it("follows the pure function while the view is already sent", () => {
    expect(nextContactPageView(ALREADY_SENT, inputWith({}))).toEqual(
      ALREADY_SENT,
    );
    expect(
      nextContactPageView(
        ALREADY_SENT,
        inputWith({ held: { hasUnsavedEdit: true } }),
      ),
    ).toEqual(FORM);
  });

  it("stays the form once it is the form, though the input would now say already sent", () => {
    expect(nextContactPageView(FORM, inputWith({}))).toBe(FORM);
  });
});
