// The sent request's one place of memory: one entry, bounded to five fields and one typed value, replaced by the next
// sent request, handed out only to the page of the design and revision it names, and cleared on request.
import { afterEach, describe, expect, it } from "vitest";

import {
  INITIAL_CONTACT_FORM,
  prepareSubmission,
  type ContactFormValues,
} from "@/contact/contact-form-model";
import {
  forgetSentRequest,
  recallSentRequest,
  rememberSentRequest,
  sentRequestFrom,
  type SentRequest,
} from "@/done/sent-request-memory";

const DESIGN_ID = "design0123456789abcde";
const OTHER_DESIGN_ID = "design0123456789abcdf";

const FILLED_VALUES: ContactFormValues = {
  ...INITIAL_CONTACT_FORM.values,
  name: "  Ana Popescu  ",
  phone: " 069 123 456 ",
  locality: "Chisinau",
  email: " ana@example.com ",
  consent: true,
};

function requestFor(
  values: ContactFormValues,
  target: Parameters<typeof prepareSubmission>[0]["target"] = {
    kind: "design",
    design: { id: DESIGN_ID, revision: "4" },
  },
) {
  const prepared = prepareSubmission({
    values,
    target,
    locale: "ro",
    clientRequestId: "request-id-00000001",
    elapsedMs: 5000,
  });
  if (!prepared.ok) throw new Error("the fixture request was refused");
  return prepared.request;
}

const REMEMBERED: SentRequest = {
  designId: DESIGN_ID,
  revision: "4",
  reference: "LM-1",
  channel: "phone",
  contactValue: "069 123 456",
};

afterEach(() => {
  forgetSentRequest();
});

describe("what a sent design request leaves", () => {
  it.each([
    ["phone", "069 123 456"],
    ["whatsapp", "069 123 456"],
    ["email", "ana@example.com"],
  ] as const)(
    "for the %s channel is the design, the revision, the reference, the channel and the one value, trimmed",
    (channel, contactValue) => {
      const request = requestFor({ ...FILLED_VALUES, channel });

      expect(sentRequestFrom(request, "LM-9")).toEqual({
        designId: DESIGN_ID,
        revision: "4",
        reference: "LM-9",
        channel,
        contactValue,
      });
    },
  );

  it("holds neither the name nor the locality, nor the e-mail of a phone request", () => {
    const entry = sentRequestFrom(requestFor(FILLED_VALUES), "LM-9");

    expect(JSON.stringify(entry)).not.toMatch(/Ana|Popescu|Chisinau|example/);
  });

  it("is nothing for a request with no design, which has no page to be shown on", () => {
    const callback = requestFor(FILLED_VALUES, {
      kind: "intent",
      intent: "callback",
    });

    expect(sentRequestFrom(callback, "LM-9")).toBeUndefined();
  });
});

describe("the one entry", () => {
  it("is handed to the page of the design and revision it names", () => {
    rememberSentRequest(REMEMBERED);

    expect(recallSentRequest({ designId: DESIGN_ID, revision: "4" })).toEqual({
      kind: "remembered",
      request: REMEMBERED,
    });
  });

  it("is not handed to another design's page, nor to another revision's", () => {
    rememberSentRequest(REMEMBERED);

    expect(
      recallSentRequest({ designId: OTHER_DESIGN_ID, revision: "4" }),
    ).toEqual({ kind: "none" });
    expect(recallSentRequest({ designId: DESIGN_ID, revision: "5" })).toEqual({
      kind: "none",
    });
  });

  it("is none, and not null, before anything was sent", () => {
    expect(recallSentRequest({ designId: DESIGN_ID, revision: "4" })).toEqual({
      kind: "none",
    });
  });

  it("is not cleared by being read, so a second read shows the same entry", () => {
    rememberSentRequest(REMEMBERED);
    const key = { designId: DESIGN_ID, revision: "4" };

    expect(recallSentRequest(key)).toEqual(recallSentRequest(key));
    expect(recallSentRequest(key).kind).toBe("remembered");
  });

  it("is replaced by the next sent request, so at most one is held", () => {
    rememberSentRequest(REMEMBERED);
    rememberSentRequest({
      ...REMEMBERED,
      designId: OTHER_DESIGN_ID,
      reference: "LM-2",
    });

    expect(recallSentRequest({ designId: DESIGN_ID, revision: "4" }).kind).toBe(
      "none",
    );
    expect(
      recallSentRequest({ designId: OTHER_DESIGN_ID, revision: "4" }),
    ).toMatchObject({ request: { reference: "LM-2" } });
  });

  it("keeps the five fields and no other, even from an object that carries more", () => {
    const wider = { ...REMEMBERED, name: "Ana Popescu", locality: "Chisinau" };

    rememberSentRequest(wider);

    const recalled = recallSentRequest({ designId: DESIGN_ID, revision: "4" });
    expect(
      recalled.kind === "remembered" && Object.keys(recalled.request).sort(),
    ).toEqual(["channel", "contactValue", "designId", "reference", "revision"]);
  });

  it("is gone once forgotten", () => {
    rememberSentRequest(REMEMBERED);

    forgetSentRequest();

    expect(recallSentRequest({ designId: DESIGN_ID, revision: "4" })).toEqual({
      kind: "none",
    });
  });
});
