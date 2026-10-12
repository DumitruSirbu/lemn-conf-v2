// @vitest-environment happy-dom
//
// The contact form's memory: one request out at a time, the same id and body for a retry, a new id only after a
// conflict or a changed request, nothing sent for an unsaved design, and the revision the store holds at the press.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONTACT_SUBMISSIONS_ENDPOINT } from "@/contact/send-contact-request";
import {
  CALLBACK_TARGET,
  DESIGN_TARGET,
} from "@/contact/use-contact-submission";
import type { SaveStatus } from "@/persistence/save-coalescer";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  answerWith,
  changeStore,
  DESIGN_ID,
  editWithoutSaving,
  fillValidForm,
  FIRST_REVISION,
  hydrateSavedDesign,
  landSave,
  mountContactForm,
  numberedRequestIds,
  type Answer,
  type MountedContactForm,
} from "./contact-submission-harness";

const SENT = answerWith(200, { status: "sent", reference: "LM-1234" });
const SERVICE_FAILURE = answerWith(503, { code: "CONTACT_UNAVAILABLE" });
const CONFLICT = answerWith(409, { code: "CONTACT_REQUEST_CONFLICT" });
const NETWORK_FAILURE: Answer = { kind: "network-failure" };

const FAILURES_THAT_KEEP_THE_ID: readonly (readonly [string, Answer])[] = [
  ["a network failure", NETWORK_FAILURE],
  ["a 503", SERVICE_FAILURE],
  [
    "a 502 whose notice was not sent",
    answerWith(502, { code: "CONTACT_NOTICE_NOT_SENT_RETRY" }),
  ],
  ["a 400 CONTACT_REJECTED", answerWith(400, { code: "CONTACT_REJECTED" })],
  [
    "a 400 CONTACT_INVALID naming a field",
    answerWith(400, {
      code: "CONTACT_INVALID",
      issues: [{ field: "contact.name", code: "REQUIRED" }],
    }),
  ],
  ["a 200 that is not a sent line", answerWith(200, { unexpected: true })],
  ["a 500", answerWith(500, {})],
];

let form: MountedContactForm;

function mountDesignForm(): MountedContactForm {
  form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
  fillValidForm(form);
  return form;
}

function press(): void {
  form.inOneTask(({ press: pressTheButton }) => {
    pressTheButton();
  });
}

function pressAndAnswer(answer: Answer): Promise<void> {
  press();
  return form.answerOldest(answer);
}

function bodyWithoutTheMeasuredTime(index: number): unknown {
  return withoutKeys(requestAt(index).body, ["elapsedMs"]);
}

function bodyWithoutTheMeasuredTimeAndId(index: number): unknown {
  return withoutKeys(requestAt(index).body, ["elapsedMs", "clientRequestId"]);
}

function withoutKeys(body: object, left: readonly string[]): unknown {
  return Object.fromEntries(
    Object.entries(body).filter(([name]) => !left.includes(name)),
  );
}

function requestAt(index: number) {
  const request = form.fetchControl.requests[index];
  if (request === undefined) throw new Error(`no request at ${String(index)}`);
  return request;
}

beforeEach(() => {
  hydrateSavedDesign();
});

afterEach(() => {
  form.unmount();
});

describe("the one request", () => {
  it("is one POST to the contact endpoint, carrying the store's id and revision and what was typed", () => {
    mountDesignForm();

    press();

    expect(form.fetchControl.requests).toHaveLength(1);
    const request = requestAt(0);
    expect(request.url).toBe(CONTACT_SUBMISSIONS_ENDPOINT);
    expect(request.body).toMatchObject({
      design: { id: DESIGN_ID, revision: FIRST_REVISION },
      contact: { name: "Ana Popescu", phone: "069 123 456" },
      locale: "ro",
      honeypot: "",
    });
    expect(request.body).not.toHaveProperty("intent");
  });

  it("is shown as sending until the answer, then as sent with the reference", async () => {
    mountDesignForm();

    press();
    expect(form.current().phase).toEqual({ kind: "sending" });
    await form.answerOldest(SENT);

    expect(form.current().phase).toEqual({
      kind: "sent",
      reference: "LM-1234",
    });
  });

  it("sends nothing for a second press made in the same task as the first", () => {
    mountDesignForm();

    form.inOneTask(({ press: pressTheButton }) => {
      pressTheButton();
      pressTheButton();
    });

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("sends nothing for presses made later while the request is still out", () => {
    mountDesignForm();

    press();
    form.clock.advance(50);
    press();
    form.clock.advance(60_000);
    press();

    expect(form.fetchControl.requests).toHaveLength(1);
    expect(form.current().phase).toEqual({ kind: "sending" });
  });

  it("passes no signal, so the guard is not ended by anything but the answer", () => {
    mountDesignForm();

    press();

    expect(requestAt(0).init).not.toHaveProperty("signal");
  });

  it("starts the next request only after the previous one has answered", async () => {
    mountDesignForm();

    await pressAndAnswer(SERVICE_FAILURE);
    press();

    expect(form.fetchControl.requests).toHaveLength(2);
    expect(requestAt(1).outstandingBefore).toBe(0);
  });

  it("does not leave the guard set when the id generator makes a bad id and throws", () => {
    let isGeneratorBroken = true;
    const goodIds = numberedRequestIds();
    form = mountContactForm({
      target: DESIGN_TARGET,
      locale: "ro",
      ports: { generateId: () => (isGeneratorBroken ? "bad id" : goodIds()) },
    });
    fillValidForm(form);

    expect(() => {
      press();
    }).toThrow(RangeError);
    isGeneratorBroken = false;
    press();

    expect(form.fetchControl.requests).toHaveLength(1);
  });
});

describe("a retry", () => {
  it.each(FAILURES_THAT_KEEP_THE_ID)(
    "carries the same id and the same body after %s",
    async (_name, answer) => {
      mountDesignForm();

      await pressAndAnswer(answer);
      form.clock.advance(3000);
      press();

      expect(requestAt(1).body.clientRequestId).toBe(
        requestAt(0).body.clientRequestId,
      );
      expect(bodyWithoutTheMeasuredTime(1)).toEqual(
        bodyWithoutTheMeasuredTime(0),
      );
    },
  );

  it("measures the time again, so a send refused as too fast can be sent later under its id", async () => {
    mountDesignForm();

    await pressAndAnswer(answerWith(400, { code: "CONTACT_REJECTED" }));
    form.clock.advance(3000);
    press();

    expect(requestAt(1).body.elapsedMs).toBe(
      requestAt(0).body.elapsedMs + 3000,
    );
  });

  it("measures the time from the first render, not from a first change to a field", () => {
    form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
    form.clock.advance(7000);
    fillValidForm(form);

    press();

    expect(requestAt(0).body.elapsedMs).toBe(7000);
  });

  it("keeps the id when only the honeypot's text changed, since the request is the same", async () => {
    mountDesignForm();
    await pressAndAnswer(SERVICE_FAILURE);

    form.inOneTask(({ edit }) => {
      edit({ type: "honeypot-filled", text: "bot" });
    });
    press();

    expect(requestAt(1).body.clientRequestId).toBe(
      requestAt(0).body.clientRequestId,
    );
    expect(requestAt(1).body.honeypot).toBe("bot");
  });

  it("is a new id when a field the request holds was changed after the failure", async () => {
    mountDesignForm();
    await pressAndAnswer(SERVICE_FAILURE);

    form.inOneTask(({ edit }) => {
      edit({ type: "text-changed", field: "locality", text: "Balti" });
    });
    press();

    expect(requestAt(1).body.clientRequestId).not.toBe(
      requestAt(0).body.clientRequestId,
    );
    expect(requestAt(1).body.contact).toMatchObject({ locality: "Balti" });
  });

  it("is a new id, and the new revision, when the design was saved again after the failure", async () => {
    mountDesignForm();
    await pressAndAnswer(SERVICE_FAILURE);

    landSave("5");
    press();

    expect(requestAt(1).body.clientRequestId).not.toBe(
      requestAt(0).body.clientRequestId,
    );
    expect(requestAt(1).body.design).toEqual({
      id: DESIGN_ID,
      revision: "5",
    });
  });
});

describe("a conflict", () => {
  it("is the one answer after which the next send has a new id", async () => {
    mountDesignForm();

    await pressAndAnswer(CONFLICT);
    press();

    expect(requestAt(1).body.clientRequestId).not.toBe(
      requestAt(0).body.clientRequestId,
    );
    expect(bodyWithoutTheMeasuredTimeAndId(1)).toEqual(
      bodyWithoutTheMeasuredTimeAndId(0),
    );
  });

  it("is followed by sends that keep the new id while later answers are failures", async () => {
    mountDesignForm();
    await pressAndAnswer(CONFLICT);
    await pressAndAnswer(SERVICE_FAILURE);

    press();

    expect(requestAt(2).body.clientRequestId).toBe(
      requestAt(1).body.clientRequestId,
    );
    expect(requestAt(1).body.clientRequestId).not.toBe(
      requestAt(0).body.clientRequestId,
    );
  });

  it("shows no failure that tells a conflict from another, only the class", async () => {
    mountDesignForm();

    await pressAndAnswer(CONFLICT);

    expect(form.current().phase).toEqual({
      kind: "failed",
      outcome: { kind: "conflict" },
      waitsUntilMs: undefined,
    });
  });
});

describe("a request that got no answer", () => {
  it("is told unanswered, and an answered failure is told failed", async () => {
    mountDesignForm();

    await pressAndAnswer(NETWORK_FAILURE);
    const lostAnswer = form.current().phase;
    await pressAndAnswer(SERVICE_FAILURE);
    const answeredFailure = form.current().phase;

    expect(lostAnswer).toEqual({
      kind: "failed",
      outcome: { kind: "unanswered" },
      waitsUntilMs: undefined,
    });
    expect(answeredFailure).toEqual({
      kind: "failed",
      outcome: { kind: "failed" },
      waitsUntilMs: undefined,
    });
  });

  it("is sent again under the same id and the same body but for the time, and is not final", async () => {
    mountDesignForm();
    await pressAndAnswer(NETWORK_FAILURE);

    await pressAndAnswer(NETWORK_FAILURE);

    expect(form.fetchControl.requests).toHaveLength(2);
    expect(requestAt(1).body.clientRequestId).toBe(
      requestAt(0).body.clientRequestId,
    );
    expect(bodyWithoutTheMeasuredTime(1)).toEqual(
      bodyWithoutTheMeasuredTime(0),
    );
  });
});

describe("a send that is not offered again", () => {
  it.each([
    ["sent", SENT],
    [
      "a design that is not current",
      answerWith(409, { code: "CONTACT_DESIGN_NOT_CURRENT" }),
    ],
    [
      "a design that does not fit",
      answerWith(422, {
        code: "CONTACT_DESIGN_DOES_NOT_FIT",
        placementIds: [],
      }),
    ],
  ] as const)("sends nothing after %s", async (_name, answer) => {
    mountDesignForm();

    await pressAndAnswer(answer);
    press();
    form.clock.advance(86_400_000);
    press();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("keeps what the customer typed after it was sent, for the line that names it", async () => {
    mountDesignForm();

    await pressAndAnswer(SENT);

    expect(form.current().form.values).toMatchObject({
      name: "Ana Popescu",
      phone: "069 123 456",
    });
  });
});

describe("a limited send", () => {
  const LIMITED_FOR_90_SECONDS = answerWith(
    429,
    { code: "CONTACT_LIMIT_REACHED" },
    { "retry-after": "90" },
  );

  it("says until when it waits, on the clock the wait was told on", async () => {
    mountDesignForm();
    const answeredAtMs = form.clock.nowMs;

    await pressAndAnswer(LIMITED_FOR_90_SECONDS);

    expect(form.current().phase).toEqual({
      kind: "failed",
      outcome: { kind: "limited", waitSeconds: 90 },
      waitsUntilMs: answeredAtMs + 90_000,
    });
  });

  it("sends nothing before the wait has passed, and sends under the same id once it has", async () => {
    mountDesignForm();
    await pressAndAnswer(LIMITED_FOR_90_SECONDS);

    form.clock.advance(89_999);
    press();
    expect(form.fetchControl.requests).toHaveLength(1);
    form.clock.advance(1);
    press();

    expect(form.fetchControl.requests).toHaveLength(2);
    expect(requestAt(1).body.clientRequestId).toBe(
      requestAt(0).body.clientRequestId,
    );
  });

  it("does not make a second limit of an answer that is not one", async () => {
    mountDesignForm();
    await pressAndAnswer(LIMITED_FOR_90_SECONDS);
    form.clock.advance(90_000);

    await pressAndAnswer(SERVICE_FAILURE);
    press();

    expect(form.fetchControl.requests).toHaveLength(3);
  });
});

describe("a design with an unsaved edit", () => {
  const HELD_STATES: readonly (readonly [SaveStatus, number | undefined])[] = [
    ["idle", undefined],
    ["saving", undefined],
    ["error", undefined],
    ["error", Date.now() + 60_000],
    ["stopped", undefined],
    ["conflict", undefined],
    ["unauthorized", undefined],
  ];

  it.each(HELD_STATES)(
    "sends nothing while the save is %s (held until %s)",
    (status, resumesAtMs) => {
      mountDesignForm();
      editWithoutSaving("edited-and-not-yet-saved");
      act(() => {
        useConfiguratorStore.getState().setSaveStatus(status, resumesAtMs);
      });

      press();

      expect(form.fetchControl.requests).toHaveLength(0);
      expect(form.current().saveWait.kind).toBe("waiting");
    },
  );

  it("sends nothing even for a press made in the same task as the edit, before React renders it", () => {
    mountDesignForm();

    form.inOneTask(({ press: pressTheButton }) => {
      editWithoutSaving("edited-in-this-task");
      pressTheButton();
    });

    expect(form.fetchControl.requests).toHaveLength(0);
  });

  it("judges nothing and asks for no focus while the design is unsaved", () => {
    form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
    editWithoutSaving("edited-and-not-yet-saved");

    press();

    expect(form.current().form.errors).toEqual({});
    expect(form.current().refusedPress).toBeUndefined();
  });

  it("sends once the write is answered, carrying the revision the write answered", () => {
    mountDesignForm();
    editWithoutSaving("edited-and-not-yet-saved");
    press();

    act(() => {
      landSave("5");
    });
    press();

    expect(form.current().saveWait).toEqual({ kind: "saved" });
    expect(form.fetchControl.requests).toHaveLength(1);
    expect(requestAt(0).body.design).toEqual({
      id: DESIGN_ID,
      revision: "5",
    });
  });

  it("reads the revision and the saved state in the same store read as the press", () => {
    mountDesignForm();
    landSave("9");

    press();

    expect(requestAt(0).store).toEqual({
      isSaved: true,
      revision: "9",
      designId: DESIGN_ID,
    });
    expect(requestAt(0).body.design).toEqual({
      id: DESIGN_ID,
      revision: "9",
    });
  });
});

describe("a design that cannot be named", () => {
  it("sends nothing when the store holds no revision yet", () => {
    mountDesignForm();
    changeStore({ revision: null });

    press();

    expect(form.fetchControl.requests).toHaveLength(0);
  });

  it("sends nothing for an id of another shape than the generator's, which the route refuses", () => {
    mountDesignForm();
    changeStore({ designId: "not-a-generated-id" });

    press();

    expect(form.fetchControl.requests).toHaveLength(0);
  });
});

describe("a press the form refuses", () => {
  it("sends nothing and names the first invalid field in the form's order", () => {
    form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
    form.inOneTask(({ edit }) => {
      edit({ type: "text-changed", field: "name", text: "Ana Popescu" });
      edit({ type: "consent-changed", isGiven: true });
    });

    press();

    expect(form.fetchControl.requests).toHaveLength(0);
    expect(form.current().refusedPress).toEqual({
      field: "phone",
      pressNumber: 1,
    });
  });

  it("numbers each refusal, so two refusals of one field both ask for focus", () => {
    form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });

    press();
    press();

    expect(form.current().refusedPress).toEqual({
      field: "name",
      pressNumber: 2,
    });
  });

  it("shows the first invalid field's error and the consent's, and no other", () => {
    form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });

    press();

    expect(Object.keys(form.current().form.errors).sort()).toEqual([
      "consent",
      "name",
    ]);
  });
});

describe("a request with no design", () => {
  it("names the intent and no design, and does not wait for a design to be saved", () => {
    form = mountContactForm({ target: CALLBACK_TARGET, locale: "ru" });
    fillValidForm(form);
    editWithoutSaving("edited-and-not-yet-saved");

    press();

    expect(form.fetchControl.requests).toHaveLength(1);
    expect(requestAt(0).body).toMatchObject({
      intent: "callback",
      locale: "ru",
    });
    expect(requestAt(0).body).not.toHaveProperty("design");
  });
});

describe("the e-mail", () => {
  function typeEmailAndChoose(channel: "phone" | "email"): void {
    form.inOneTask(({ edit }) => {
      edit({ type: "text-changed", field: "email", text: "ana@example.com" });
      edit({ type: "channel-chosen", channel });
    });
  }

  it("is in the body when the customer chose the e-mail channel", () => {
    mountDesignForm();
    typeEmailAndChoose("email");

    press();

    expect(requestAt(0).body.contact).toMatchObject({
      channel: "email",
      email: "ana@example.com",
    });
  });

  it("is not in the body for another channel, though the address stays typed", () => {
    mountDesignForm();
    typeEmailAndChoose("phone");

    press();

    expect(requestAt(0).body.contact).not.toHaveProperty("email");
    expect(form.current().form.values.email).toBe("ana@example.com");
  });
});
