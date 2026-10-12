// @vitest-environment happy-dom
//
// The automatic retry and the hand-over as properties of the hook (8M S2), over any order of what a customer, the
// network and the browser's connection can do: a field typed or left, a press (or two in one task), an answer of every
// class or none, time passing, an edit of the design and the write that saves it, and `online` and `offline` events (one,
// or two in one task). The model below is read from the fake `fetch`, the store, the clock and the answers the test
// gave, never from the hook.
// P5: a POST no press caused follows an `online` event, is the only one that event caused, comes after a send that got
// no answer and with none since, and carries that send's id and covered body.
// P6: no POST follows an `online` event after a sent request, after any answered failure, while a request is out,
// or while the design is unsaved; and none that would carry another id, since the request changed.
// P7: the hand-over holds at most one entry; after a sent answer it is that request's design, revision, the answer's
// reference, the channel and the one value, and nothing else; before one it is empty.
import { fc } from "@fast-check/vitest";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { ContactTextField } from "@/contact/contact-form-model";
import { DESIGN_TARGET } from "@/contact/use-contact-submission";
import {
  forgetSentRequest,
  recallSentRequest,
} from "@/done/sent-request-memory";
import { useConfiguratorStore } from "@/store/configurator-store";

import { FakeConnection } from "./fake-connection";
import {
  answerWith,
  coveredPartOf,
  DESIGN_ID,
  editWithoutSaving,
  hydrateSavedDesign,
  landSave,
  mountContactForm,
  type Answer,
  type MountedContactForm,
  type RecordedRequest,
} from "./contact-submission-harness";

type AnswerClass =
  | "no-answer"
  | "unavailable"
  | "notice-not-sent"
  | "rejected"
  | "conflict"
  | "limited"
  | "sent";

const SENT_REFERENCE = "LM-7";

const ANSWERS: Readonly<Record<AnswerClass, Answer>> = {
  "no-answer": { kind: "network-failure" },
  unavailable: answerWith(503, { code: "CONTACT_UNAVAILABLE" }),
  "notice-not-sent": answerWith(502, { code: "CONTACT_NOTICE_NOT_SENT_RETRY" }),
  rejected: answerWith(400, { code: "CONTACT_REJECTED" }),
  conflict: answerWith(409, { code: "CONTACT_REQUEST_CONFLICT" }),
  limited: answerWith(
    429,
    { code: "CONTACT_LIMIT_REACHED" },
    { "retry-after": "30" },
  ),
  sent: answerWith(200, { status: "sent", reference: SENT_REFERENCE }),
};

const ANSWER_CLASSES_BY_WEIGHT: readonly AnswerClass[] = [
  "no-answer",
  "no-answer",
  "no-answer",
  "no-answer",
  "unavailable",
  "notice-not-sent",
  "rejected",
  "conflict",
  "limited",
  "sent",
];

const TEXT_FIELDS: readonly ContactTextField[] = [
  "name",
  "phone",
  "locality",
  "email",
];

/** Valid texts only: a refused press would start nothing, and the sequences are about what follows a send. */
const VALID_TEXTS: Readonly<Record<ContactTextField, readonly string[]>> = {
  name: ["Ana Popescu", "Ion Rusu"],
  phone: ["069 123 456", "079 654 321"],
  locality: ["Chisinau", "Balti"],
  email: ["ana@example.com", "ion@example.com"],
};

type Command =
  | {
      readonly kind: "type";
      readonly field: ContactTextField;
      readonly variant: number;
    }
  | { readonly kind: "leave"; readonly field: ContactTextField }
  | { readonly kind: "channel"; readonly channel: "phone" | "email" }
  | { readonly kind: "press" }
  | { readonly kind: "press-twice" }
  | { readonly kind: "answer"; readonly answerClass: AnswerClass }
  | { readonly kind: "advance"; readonly milliseconds: number }
  | { readonly kind: "edit-design" }
  | { readonly kind: "save-lands" }
  | { readonly kind: "online" }
  | { readonly kind: "online-twice" }
  | { readonly kind: "offline" };

const commandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<Command>({ kind: "press" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "press-twice" }) },
  {
    weight: 9,
    arbitrary: fc
      .constantFrom(...ANSWER_CLASSES_BY_WEIGHT)
      .map((answerClass): Command => ({ kind: "answer", answerClass })),
  },
  { weight: 8, arbitrary: fc.constant<Command>({ kind: "online" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "online-twice" }) },
  { weight: 2, arbitrary: fc.constant<Command>({ kind: "offline" }) },
  {
    weight: 2,
    arbitrary: fc
      .record({
        field: fc.constantFrom(...TEXT_FIELDS),
        variant: fc.integer({ min: 0, max: 1 }),
      })
      .map(({ field, variant }): Command => ({ kind: "type", field, variant })),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom(...TEXT_FIELDS)
      .map((field): Command => ({ kind: "leave", field })),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom("phone" as const, "email" as const)
      .map((channel): Command => ({ kind: "channel", channel })),
  },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom(50, 30_000, 100_000)
      .map((milliseconds): Command => ({ kind: "advance", milliseconds })),
  },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "edit-design" }) },
  { weight: 2, arbitrary: fc.constant<Command>({ kind: "save-lands" }) },
);

const COMMAND_SEQUENCES = fc.array(commandArbitrary, {
  minLength: 1,
  maxLength: 40,
  size: "max",
});

/** What each floor needs to see, summed over the runs of one property. Each sits under half of the smallest count seen
 *  in four runs of 500 sequences, so chance does not fail it (the e-mail arm, which varies most, at a fifth). */
const arms = new Map<string, number>();

function countArm(arm: string): void {
  arms.set(arm, (arms.get(arm) ?? 0) + 1);
}

function expectFloor(arm: string, floor: number): void {
  expect(
    arms.get(arm) ?? 0,
    `arm "${arm}" was swept too rarely`,
  ).toBeGreaterThanOrEqual(floor);
}

interface Run {
  readonly form: MountedContactForm;
  readonly connection: FakeConnection;
  /** The class of the answer each request got, by the request's index. */
  readonly answers: Map<number, AnswerClass>;
  nextRevision: number;
  editCount: number;
  /** Whether anything was typed since the last request started. */
  isTypedSinceLastSend: boolean;
}

interface Step {
  readonly run: Run;
  readonly command: Command;
  readonly requestsBefore: number;
  readonly wasRequestOut: boolean;
  readonly wasDesignUnsaved: boolean;
  readonly wasTypedSinceLastSend: boolean;
  /** The answer class of the request before this step, when it had been answered. */
  readonly lastAnswer: AnswerClass | undefined;
}

interface Checks {
  readonly afterStep?: (step: Step) => void;
}

function isUnsaved(): boolean {
  const state = useConfiguratorStore.getState();
  return state.design !== state.savedDesign;
}

async function runSequence(
  commands: readonly Command[],
  checks: Checks,
): Promise<void> {
  hydrateSavedDesign();
  forgetSentRequest();
  const connection = new FakeConnection();
  const form = mountContactForm({
    target: DESIGN_TARGET,
    locale: "ro",
    ports: { connection },
  });
  const run: Run = {
    form,
    connection,
    answers: new Map(),
    nextRevision: 4,
    editCount: 0,
    isTypedSinceLastSend: false,
  };
  try {
    form.inOneTask(({ edit }) => {
      TEXT_FIELDS.forEach((field) => {
        edit({
          type: "text-changed",
          field,
          text: VALID_TEXTS[field][0] ?? "",
        });
      });
      edit({ type: "consent-changed", isGiven: true });
    });
    for (const command of commands) {
      const step = beforeStep(run, command);
      await apply(run, command);
      markSendsStarted(run, step.requestsBefore);
      checks.afterStep?.(step);
    }
  } finally {
    form.unmount();
    forgetSentRequest();
  }
}

function beforeStep(run: Run, command: Command): Step {
  const { fetchControl } = run.form;
  const requestsBefore = fetchControl.requests.length;
  return {
    run,
    command,
    requestsBefore,
    wasRequestOut: fetchControl.outstanding > 0,
    wasDesignUnsaved: isUnsaved(),
    wasTypedSinceLastSend: run.isTypedSinceLastSend,
    lastAnswer: run.answers.get(requestsBefore - 1),
  };
}

function markSendsStarted(run: Run, requestsBefore: number): void {
  if (run.form.fetchControl.requests.length > requestsBefore) {
    run.isTypedSinceLastSend = false;
  }
}

async function apply(run: Run, command: Command): Promise<void> {
  const { form } = run;
  switch (command.kind) {
    case "type":
      run.isTypedSinceLastSend = true;
      form.inOneTask(({ edit }) => {
        edit({
          type: "text-changed",
          field: command.field,
          text: VALID_TEXTS[command.field][command.variant] ?? "",
        });
      });
      return;
    case "leave":
      form.inOneTask(({ edit }) => {
        edit({ type: "field-left", field: command.field });
      });
      return;
    case "channel":
      run.isTypedSinceLastSend = true;
      form.inOneTask(({ edit }) => {
        edit({ type: "channel-chosen", channel: command.channel });
      });
      return;
    case "press":
      form.inOneTask(({ press }) => {
        press();
      });
      return;
    case "press-twice":
      form.inOneTask(({ press }) => {
        press();
        press();
      });
      return;
    case "answer":
      await answerOldest(run, command.answerClass);
      return;
    case "advance":
      form.clock.advance(command.milliseconds);
      return;
    case "edit-design":
      run.editCount += 1;
      editWithoutSaving(`edit-${String(run.editCount)}`);
      return;
    case "save-lands":
      run.nextRevision += 1;
      landSave(String(run.nextRevision));
      return;
    case "online":
      fireInOneTask(run, ["online"]);
      return;
    case "online-twice":
      fireInOneTask(run, ["online", "online"]);
      return;
    case "offline":
      fireInOneTask(run, ["offline"]);
      return;
  }
}

function fireInOneTask(run: Run, events: readonly ("online" | "offline")[]) {
  act(() => {
    events.forEach((event) => {
      run.connection.fire(event);
    });
  });
}

async function answerOldest(run: Run, answerClass: AnswerClass): Promise<void> {
  const { fetchControl } = run.form;
  if (fetchControl.outstanding === 0) return;
  const answeredIndex = fetchControl.requests.length - 1;
  await run.form.answerOldest(ANSWERS[answerClass]);
  run.answers.set(answeredIndex, answerClass);
}

function isOnlineStep(command: Command): boolean {
  return command.kind === "online" || command.kind === "online-twice";
}

function startedBy(step: Step): readonly RecordedRequest[] {
  return step.run.form.fetchControl.requests.slice(step.requestsBefore);
}

/** The one reason, read from the model, that an `online` event must send nothing; none when a retry is allowed. */
function reasonOnlineMustSendNothing(step: Step): string | undefined {
  if (step.requestsBefore === 0) return "nothing sent yet";
  if (step.wasRequestOut) return "request out";
  if (step.lastAnswer === "sent") return "after sent";
  if (step.lastAnswer !== "no-answer") return "after an answered failure";
  if (step.wasDesignUnsaved) return "design unsaved";
  return undefined;
}

/** Whether the request as it now stands may differ from the unanswered one, so a retry is allowed but not owed. */
function mayHaveChanged(step: Step): boolean {
  const previous = step.run.form.fetchControl.requests[step.requestsBefore - 1];
  const isRevisionMoved =
    previous?.store.revision !== useConfiguratorStore.getState().revision;
  return step.wasTypedSinceLastSend || isRevisionMoved;
}

/** P5 and P6, read after each step. */
function assertOnlyAnUnansweredSendIsRetried(step: Step): void {
  if (!isOnlineStep(step.command)) return;
  const started = startedBy(step);
  const reason = reasonOnlineMustSendNothing(step);
  expect(started.length).toBeLessThanOrEqual(1);
  if (reason !== undefined) {
    expect(started, `an online event ${reason} sent`).toHaveLength(0);
    countArm(`online ignored: ${reason}`);
    return;
  }
  if (started.length === 0) {
    expect(mayHaveChanged(step), "an unchanged request was not retried").toBe(
      true,
    );
    countArm("online ignored: the request changed since the send");
    return;
  }
  countArm("online retried");
  assertSameRequestAsBefore(step, started[0]);
}

function assertSameRequestAsBefore(
  step: Step,
  retry: RecordedRequest | undefined,
): void {
  const previous = step.run.form.fetchControl.requests[step.requestsBefore - 1];
  if (retry === undefined || previous === undefined) {
    throw new Error("a retry and the send before it were expected");
  }
  expect(retry.body.clientRequestId).toBe(previous.body.clientRequestId);
  expect(coveredPartOf(retry)).toBe(coveredPartOf(previous));
  expect(retry.outstandingBefore).toBe(0);
}

/** Everything the hand-over may hold, asked for every revision the run could have sent. */
function remembersOf(
  run: Run,
): readonly ReturnType<typeof recallSentRequest>[] {
  const revisions = Array.from(
    { length: run.nextRevision + 1 },
    (_, revision) => String(revision),
  );
  return revisions
    .map((revision) => recallSentRequest({ designId: DESIGN_ID, revision }))
    .filter((recalled) => recalled.kind === "remembered");
}

/** P7, read after each step. */
function assertHandOverFollowsTheSentAnswer(step: Step): void {
  const { run } = step;
  const { requests } = run.form.fetchControl;
  const sentIndex = [...run.answers].find(
    ([, answerClass]) => answerClass === "sent",
  )?.[0];
  const remembered = remembersOf(run);
  expect(remembered.length).toBeLessThanOrEqual(1);
  if (sentIndex === undefined) {
    expect(remembered).toEqual([]);
    countArm("no hand-over before a sent answer");
    return;
  }
  const sent = requests[sentIndex];
  if (sent === undefined) throw new Error("the sent request was not recorded");
  const { channel } = sent.body.contact;
  expect(remembered).toEqual([
    {
      kind: "remembered",
      request: {
        designId: DESIGN_ID,
        revision: sent.body.design?.revision,
        reference: SENT_REFERENCE,
        channel,
        contactValue:
          sent.body.contact[channel === "email" ? "email" : "phone"],
      },
    },
  ]);
  countArm(`hand-over after a sent answer by ${String(channel)}`);
}

beforeEach(() => {
  arms.clear();
});

describe("P5 and P6: only an online event after an unanswered send retries, and only that send", () => {
  it("holds over any order of typing, presses, answers or none, saves and connection events", async () => {
    await fc.assert(
      fc.asyncProperty(COMMAND_SEQUENCES, async (commands) => {
        await runSequence(commands, {
          afterStep: assertOnlyAnUnansweredSendIsRetried,
        });
      }),
      { numRuns: 500 },
    );

    expectFloor("online retried", 25);
    expectFloor("online ignored: nothing sent yet", 400);
    expectFloor("online ignored: request out", 400);
    expectFloor("online ignored: after sent", 80);
    expectFloor("online ignored: after an answered failure", 350);
    expectFloor("online ignored: design unsaved", 15);
    expectFloor("online ignored: the request changed since the send", 30);
  });
});

describe("P7: the hand-over is one entry, the sent request's, and empty before one", () => {
  it("holds over any order of typing, presses, answers, saves and connection events", async () => {
    await fc.assert(
      fc.asyncProperty(COMMAND_SEQUENCES, async (commands) => {
        await runSequence(commands, {
          afterStep: assertHandOverFollowsTheSentAnswer,
        });
      }),
      { numRuns: 500 },
    );

    expectFloor("no hand-over before a sent answer", 5000);
    expectFloor("hand-over after a sent answer by phone", 400);
    expectFloor("hand-over after a sent answer by email", 5);
  });
});
