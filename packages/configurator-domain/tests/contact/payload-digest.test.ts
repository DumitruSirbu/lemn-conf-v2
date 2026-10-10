import { describe, expect, it } from "vitest";

import {
  BOOK_TREATMENT,
  CONSENT_TEXT_VERSIONS,
  CONTACT_TREATMENT,
  PAYLOAD_DIGEST_FIELDS,
  payloadDigestFields,
  PayloadDigestBookError,
  REQUEST_TREATMENT,
  TARGET_TREATMENT,
  validateContactSubmission,
  type ContactSubmissionRequest,
  type DigestTreatment,
  type PayloadDigestField,
} from "../../src/contact/index.js";

const SERVED_LOCALES = ["ro", "ru"];
const BOOK_VERSION = "book-2026-10";

const CONTACT = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Calarasi",
  channel: "phone",
  consent: true,
  consentTextVersion: CONSENT_TEXT_VERSIONS[0],
};

const DESIGN_REQUEST = {
  contact: CONTACT,
  design: { id: "abcdefghijklmnopqrstu", revision: "7" },
  clientRequestId: "0123456789abcdef",
  locale: "ro",
  honeypot: "",
  elapsedMs: 12_000,
};

const CALLBACK_REQUEST = {
  contact: { ...CONTACT, channel: "email", email: "Ana@Example.com" },
  intent: "callback",
  clientRequestId: "0123456789abcdef",
  locale: "ru",
  elapsedMs: 12_000,
};

function validated(input: unknown): ContactSubmissionRequest {
  const result = validateContactSubmission(input, SERVED_LOCALES);
  if (!result.ok) throw new Error("the sample request must validate");
  return result.request;
}

const DESIGN = validated(DESIGN_REQUEST);
const CALLBACK = validated(CALLBACK_REQUEST);

function treatmentsOf(): readonly DigestTreatment[] {
  return [
    BOOK_TREATMENT,
    ...Object.values(REQUEST_TREATMENT),
    ...Object.values(CONTACT_TREATMENT),
    ...Object.values(TARGET_TREATMENT.design),
    ...Object.values(TARGET_TREATMENT.intent),
  ];
}

function namesCovered(): readonly string[] {
  return treatmentsOf().flatMap((treatment) =>
    "covers" in treatment ? treatment.covers : [],
  );
}

/** The keys a validated request holds that no treatment names, as dotted paths: what the coverage test is for. */
function untreatedKeysOf(request: ContactSubmissionRequest): string[] {
  const topLevel = Object.keys(request).filter(
    (key) => key !== "contact" && key !== "target",
  );
  const known: readonly [string, readonly string[]][] = [
    ["", Object.keys(REQUEST_TREATMENT)],
    ["contact.", Object.keys(CONTACT_TREATMENT)],
    ["target.", Object.keys(TARGET_TREATMENT[request.target.kind])],
  ];
  const held: readonly [string, readonly string[]][] = [
    ["", topLevel],
    ["contact.", Object.keys(request.contact)],
    ["target.", Object.keys(request.target)],
  ];
  return held.flatMap(([prefix, keys], index) =>
    keys
      .filter((key) => !(known[index]?.[1] ?? []).includes(key))
      .map((key) => `${prefix}${key}`),
  );
}

describe("what a payload's digest covers", () => {
  it("names a treatment for every key a validated request holds, of either kind of target", () => {
    expect(untreatedKeysOf(DESIGN)).toEqual([]);
    expect(untreatedKeysOf(CALLBACK)).toEqual([]);
  });

  it("finds a key the request gains that is neither covered nor left out", () => {
    const grown = { ...DESIGN, shape: "L" } as ContactSubmissionRequest;
    const contactGrown = {
      ...CALLBACK,
      contact: { ...CALLBACK.contact, nickname: "x" },
    } as ContactSubmissionRequest;

    expect(untreatedKeysOf(grown)).toEqual(["shape"]);
    expect(untreatedKeysOf(contactGrown)).toEqual(["contact.nickname"]);
  });

  it("holds exactly the keys a treatment names, so a treatment for a field no request has is found too", () => {
    expect(Object.keys(DESIGN).sort()).toEqual(
      [...Object.keys(REQUEST_TREATMENT), "contact", "target"].sort(),
    );
    expect(Object.keys(DESIGN.contact).sort()).toEqual(
      Object.keys(CONTACT_TREATMENT).sort(),
    );
    expect(Object.keys(DESIGN.target).sort()).toEqual(
      Object.keys(TARGET_TREATMENT.design).sort(),
    );
    expect(Object.keys(CALLBACK.target).sort()).toEqual(
      Object.keys(TARGET_TREATMENT.intent).sort(),
    );
  });

  it("covers every written field at least once and names no field that is not written", () => {
    expect(new Set(namesCovered())).toEqual(new Set(PAYLOAD_DIGEST_FIELDS));
    expect(
      namesCovered().filter(
        (name) => !PAYLOAD_DIGEST_FIELDS.includes(name as PayloadDigestField),
      ),
    ).toEqual([]);
  });

  it("leaves out the elapsed time and the honeypot's answer, each with its reason, and nothing else", () => {
    const leftOut = treatmentsOf().flatMap((treatment) =>
      "leavesOut" in treatment ? [treatment.leavesOut] : [],
    );

    expect(
      Object.keys(REQUEST_TREATMENT).filter(
        (key) =>
          "leavesOut" in
          REQUEST_TREATMENT[key as keyof typeof REQUEST_TREATMENT],
      ),
    ).toEqual(["isHoneypotFilled", "elapsedMs"]);
    expect(leftOut).toHaveLength(2);
    expect(leftOut.every((reason) => reason.length > 0)).toBe(true);
  });
});

describe("payloadDigestFields", () => {
  it("writes the fields in the order the list gives, whatever order the request's keys were built in", () => {
    expect(Object.keys(payloadDigestFields(DESIGN, BOOK_VERSION))).toEqual([
      ...PAYLOAD_DIGEST_FIELDS,
    ]);
    expect(Object.keys(payloadDigestFields(CALLBACK, undefined))).toEqual([
      ...PAYLOAD_DIGEST_FIELDS,
    ]);
  });

  it("holds every stored and mailed value of a design request, and the book's version", () => {
    expect(payloadDigestFields(DESIGN, BOOK_VERSION)).toEqual({
      clientRequestId: "0123456789abcdef",
      locale: "ro",
      targetKind: "design",
      designId: "abcdefghijklmnopqrstu",
      designRevision: "7",
      intent: "",
      name: "Andrei Munteanu",
      phone: "079 123 456",
      phoneNormalForm: "+37379123456",
      locality: "Calarasi",
      channel: "phone",
      email: "",
      consentTextVersion: "placeholder",
      bookVersion: BOOK_VERSION,
    });
  });

  it("holds an address as it was typed, and no version for a callback", () => {
    const fields = payloadDigestFields(CALLBACK, undefined);

    expect(fields.email).toBe("Ana@Example.com");
    expect(fields.intent).toBe("callback");
    expect(fields.designId).toBe("");
    expect(fields.bookVersion).toBe("");
  });

  it.each([
    [
      "the client's request id",
      (r: unknown) => ({
        ...(r as object),
        clientRequestId: "fedcba9876543210",
      }),
      "clientRequestId",
    ],
    [
      "the locale",
      (r: unknown) => ({ ...(r as object), locale: "ru" }),
      "locale",
    ],
    [
      "the design's revision",
      (r: unknown) => ({
        ...(r as object),
        design: { id: "abcdefghijklmnopqrstu", revision: "8" },
      }),
      "designRevision",
    ],
    [
      "the design's id",
      (r: unknown) => ({
        ...(r as object),
        design: { id: "abcdefghijklmnopqrstv", revision: "7" },
      }),
      "designId",
    ],
    [
      "the name",
      (r: unknown) => ({
        ...(r as object),
        contact: { ...CONTACT, name: "Andrei Munteanu " + "B" },
      }),
      "name",
    ],
    [
      "the phone as typed",
      (r: unknown) => ({
        ...(r as object),
        contact: { ...CONTACT, phone: "+373 79 123 456" },
      }),
      "phone",
    ],
    [
      "the locality",
      (r: unknown) => ({
        ...(r as object),
        contact: { ...CONTACT, locality: "" },
      }),
      "locality",
    ],
    [
      "the channel",
      (r: unknown) => ({
        ...(r as object),
        contact: { ...CONTACT, channel: "whatsapp" },
      }),
      "channel",
    ],
  ])("changes with %s", (_label, change, field) => {
    const before = payloadDigestFields(DESIGN, BOOK_VERSION);
    const after = payloadDigestFields(
      validated(change(DESIGN_REQUEST)),
      BOOK_VERSION,
    );

    expect(after[field as PayloadDigestField]).not.toBe(
      before[field as PayloadDigestField],
    );
  });

  it("changes with the address, the way the target is stated, and the book's version", () => {
    const other = validated({
      ...CALLBACK_REQUEST,
      contact: { ...CALLBACK_REQUEST.contact, email: "ana@example.com" },
    });

    expect(payloadDigestFields(other, undefined).email).not.toBe(
      payloadDigestFields(CALLBACK, undefined).email,
    );
    expect(payloadDigestFields(DESIGN, "book-2026-11").bookVersion).not.toBe(
      payloadDigestFields(DESIGN, BOOK_VERSION).bookVersion,
    );
    expect(payloadDigestFields(DESIGN, BOOK_VERSION).targetKind).not.toBe(
      payloadDigestFields(CALLBACK, undefined).targetKind,
    );
  });

  it("does not change with the elapsed time or the honeypot's answer", () => {
    const slower = validated({ ...DESIGN_REQUEST, elapsedMs: 900_000 });
    const filled = validated({ ...DESIGN_REQUEST, honeypot: "x" });

    expect(payloadDigestFields(slower, BOOK_VERSION)).toEqual(
      payloadDigestFields(DESIGN, BOOK_VERSION),
    );
    expect(payloadDigestFields(filled, BOOK_VERSION)).toEqual(
      payloadDigestFields(DESIGN, BOOK_VERSION),
    );
  });

  it("refuses a design with no book's version, and a callback with one", () => {
    expect(() => payloadDigestFields(DESIGN, undefined)).toThrow(
      PayloadDigestBookError,
    );
    expect(() => payloadDigestFields(CALLBACK, BOOK_VERSION)).toThrow(
      PayloadDigestBookError,
    );
  });
});
