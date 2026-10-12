// @vitest-environment happy-dom
//
// The automatic retry and the hand-over (8M S2). The one trigger is the browser's `online` event after a send that got
// no answer; it presses for the customer, so it keeps the id and the body and the one-in-flight guard. The hand-over is
// the one entry a sent design request leaves for the confirmation page.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CALLBACK_TARGET,
  DESIGN_TARGET,
} from "@/contact/use-contact-submission";
import {
  forgetSentRequest,
  recallSentRequest,
  rememberSentRequest,
} from "@/done/sent-request-memory";

import { FakeConnection } from "./fake-connection";
import {
  answerWith,
  DESIGN_ID,
  editWithoutSaving,
  fillValidForm,
  FIRST_REVISION,
  hydrateSavedDesign,
  landSave,
  mountContactForm,
  VALID_FIELDS,
  type Answer,
  type MountedContactForm,
} from "./contact-submission-harness";

const SENT = answerWith(200, { status: "sent", reference: "LM-1234" });
const NO_ANSWER: Answer = { kind: "network-failure" };
const THE_PAGES_KEY = { designId: DESIGN_ID, revision: FIRST_REVISION };

const ANSWERED_FAILURES: readonly (readonly [string, Answer])[] = [
  ["a 503", answerWith(503, { code: "CONTACT_UNAVAILABLE" })],
  [
    "a 502 whose notice was not sent",
    answerWith(502, { code: "CONTACT_NOTICE_NOT_SENT" }),
  ],
  [
    "a 502 whose notice may be sent again",
    answerWith(502, { code: "CONTACT_NOTICE_NOT_SENT_RETRY" }),
  ],
  ["a 400 CONTACT_REJECTED", answerWith(400, { code: "CONTACT_REJECTED" })],
  ["a 500", answerWith(500, {})],
  [
    "a 429",
    answerWith(429, { code: "CONTACT_LIMIT_REACHED" }, { "retry-after": "30" }),
  ],
  ["a conflict", answerWith(409, { code: "CONTACT_REQUEST_CONFLICT" })],
];

let form: MountedContactForm;
let connection: FakeConnection;

function mountDesignForm(
  connectionOptions: ConstructorParameters<typeof FakeConnection>[0] = {},
): void {
  connection = new FakeConnection(connectionOptions);
  form = mountContactForm({
    target: DESIGN_TARGET,
    locale: "ro",
    ports: { connection },
  });
  fillValidForm(form);
}

function press(): void {
  form.inOneTask(({ press: pressTheButton }) => {
    pressTheButton();
  });
}

function connectionReturns(timesInOneTask = 1): void {
  act(() => {
    Array.from({ length: timesInOneTask }).forEach(() => {
      connection.fire("online");
    });
  });
}

async function pressAndAnswer(answer: Answer): Promise<void> {
  press();
  await form.answerOldest(answer);
}

function bodyAt(index: number) {
  const request = form.fetchControl.requests[index];
  if (request === undefined) throw new Error(`no request at ${String(index)}`);
  return request.body;
}

beforeEach(() => {
  hydrateSavedDesign();
  forgetSentRequest();
});

afterEach(() => {
  form.unmount();
  forgetSentRequest();
});

describe("the connection's return after a send that got no answer", () => {
  it("sends the same request once more, under the same id, with the measured time read again", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    form.clock.advance(7000);

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(2);
    const { elapsedMs: firstTime, ...first } = bodyAt(0);
    const { elapsedMs: secondTime, ...second } = bodyAt(1);
    expect(second).toEqual(first);
    expect(secondTime).toBeGreaterThan(firstTime);
    expect(form.current().phase.kind).toBe("sending");
  });

  it("is one send for two events in one task, since the first leaves a request out", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);

    connectionReturns(2);

    expect(form.fetchControl.requests).toHaveLength(2);
    expect(form.fetchControl.outstanding).toBe(1);
  });

  it("sends once more for each return while the sends keep getting no answer", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    connectionReturns();
    await form.answerOldest(NO_ANSWER);

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(3);
    expect(bodyAt(2).clientRequestId).toBe(bodyAt(0).clientRequestId);
  });

  it("ends in the sent state when the retry is answered, and then sends nothing on a later return", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    connectionReturns();
    await form.answerOldest(SENT);

    connectionReturns();

    expect(form.current().phase).toEqual({
      kind: "sent",
      reference: "LM-1234",
    });
    expect(form.fetchControl.requests).toHaveLength(2);
  });

  it("is still sent after a blur of a field, which changes nothing that was typed", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    form.inOneTask(({ edit }) => {
      edit({ type: "field-left", field: "name" });
    });

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(2);
  });
});

describe("no send comes from the connection's return in any other state", () => {
  it("before anything was sent", () => {
    mountDesignForm();

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(0);
  });

  it("while the first request is out", () => {
    mountDesignForm();
    press();

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("after the request was sent", async () => {
    mountDesignForm();
    await pressAndAnswer(SENT);

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it.each(ANSWERED_FAILURES)("after %s", async (_name, answer) => {
    mountDesignForm();
    await pressAndAnswer(answer);

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("while the design on screen is not the one the server holds", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    editWithoutSaving("unsaved");

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("after a field was typed, which is the customer's to send by pressing", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    form.inOneTask(({ edit }) => {
      edit({ type: "text-changed", field: "name", text: "Ion Rusu" });
    });

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(1);
  });

  it("while a listener outlives the unanswered state, as one does between an answer and the page drawing it", async () => {
    mountDesignForm({ keepsLeftListeners: true });
    await pressAndAnswer(NO_ANSWER);
    press();
    await form.answerOldest(answerWith(503, { code: "CONTACT_UNAVAILABLE" }));
    expect(connection.listenerCount("online")).toBe(1);

    connectionReturns();

    expect(form.fetchControl.requests).toHaveLength(2);
  });
});

describe("what listens for the connection", () => {
  it("is subscribed to `online` only while the last send is unanswered", async () => {
    mountDesignForm();
    expect(connection.listenerCount("online")).toBe(0);

    press();
    expect(connection.listenerCount("online")).toBe(0);

    await form.answerOldest(NO_ANSWER);
    expect(connection.listenerCount("online")).toBe(1);

    connectionReturns();
    expect(connection.listenerCount("online")).toBe(0);
  });

  it("is let go when the page unmounts while waiting", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    expect(connection.listenerCount("online")).toBe(1);

    form.unmount();

    expect(connection.listenerCount("online")).toBe(0);
    mountDesignForm();
  });
});

describe("the hand-over", () => {
  it("holds the design, revision, reference, channel and the phone after a design request is sent", async () => {
    mountDesignForm();

    await pressAndAnswer(SENT);

    expect(recallSentRequest(THE_PAGES_KEY)).toEqual({
      kind: "remembered",
      request: {
        designId: DESIGN_ID,
        revision: FIRST_REVISION,
        reference: "LM-1234",
        channel: "phone",
        contactValue: VALID_FIELDS.phone,
      },
    });
  });

  it("is for the revision the press sent, even when a save lands before the answer", async () => {
    mountDesignForm();
    press();
    landSave("5");

    await form.answerOldest(SENT);

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("remembered");
    expect(recallSentRequest({ ...THE_PAGES_KEY, revision: "5" }).kind).toBe(
      "none",
    );
  });

  it("holds the e-mail address, and not the phone, when the channel is e-mail", async () => {
    mountDesignForm();
    form.inOneTask(({ edit }) => {
      edit({ type: "channel-chosen", channel: "email" });
      edit({ type: "text-changed", field: "email", text: VALID_FIELDS.email });
    });

    await pressAndAnswer(SENT);

    expect(recallSentRequest(THE_PAGES_KEY)).toMatchObject({
      request: { channel: "email", contactValue: VALID_FIELDS.email },
    });
  });

  it("is made again by the answer of a retried send, once, with that answer's reference", async () => {
    mountDesignForm();
    await pressAndAnswer(NO_ANSWER);
    connectionReturns();

    await form.answerOldest(
      answerWith(200, { status: "sent", reference: "LM-77" }),
    );

    expect(recallSentRequest(THE_PAGES_KEY)).toMatchObject({
      request: { reference: "LM-77" },
    });
  });

  it.each([
    ["a failure", answerWith(503, { code: "CONTACT_UNAVAILABLE" })],
    ["no answer", NO_ANSWER],
  ])("is not made by %s", async (_name, answer) => {
    mountDesignForm();

    await pressAndAnswer(answer);

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("none");
  });

  it("is not made by a callback request, which has no page of its own", async () => {
    connection = new FakeConnection();
    form = mountContactForm({
      target: CALLBACK_TARGET,
      locale: "ro",
      ports: { connection },
    });
    fillValidForm(form);

    await pressAndAnswer(SENT);

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("none");
  });

  it("is cleared when a design contact form mounts", () => {
    rememberSentRequest({
      ...{ ...THE_PAGES_KEY, reference: "LM-OLD" },
      channel: "phone",
      contactValue: VALID_FIELDS.phone,
    });

    mountDesignForm();

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("none");
  });

  it("is kept when the callback form mounts, which is not a design's form", () => {
    rememberSentRequest({
      ...{ ...THE_PAGES_KEY, reference: "LM-OLD" },
      channel: "phone",
      contactValue: VALID_FIELDS.phone,
    });

    connection = new FakeConnection();
    form = mountContactForm({
      target: CALLBACK_TARGET,
      locale: "ro",
      ports: { connection },
    });

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("remembered");
  });
});
