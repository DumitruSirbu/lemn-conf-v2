// @vitest-environment happy-dom
//
// 8L's P1 to P4 and 8M S1's class property, run again with the connection in the alphabet (plan, QA's Reading): the same
// sequences of typing, presses, answers of every class, a network failure, time, an edit of the design and the write that
// saves it, with `online`, two `online` in one task and `offline` events among them. The retry the connection's return
// causes is a send like another: at most one request is out; none for an unsaved design; the revision is the store's;
// a retry keeps its send's id, and an id is renewed exactly when the request changed or a conflict came between; a typed
// value is nowhere but the hook's memory, the one request body and the one entry the confirmation reads; and an answer
// is told as its class however the request was started. What each `online` may start is P5 and P6's, which
// `use-contact-submission.online-retry.properties.dom.test.ts` owns; this file asks only that nothing the retry starts
// breaks the four.
import { fc } from "@fast-check/vitest";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactOutcome } from "@/contact/contact-answer";
import type { ContactTextField } from "@/contact/contact-form-model";
import { CONTACT_SUBMISSIONS_ENDPOINT } from "@/contact/send-contact-request";
import { DESIGN_TARGET } from "@/contact/use-contact-submission";
import { forgetSentRequest } from "@/done/sent-request-memory";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  answerWith,
  coveredPartOf,
  DESIGN_ID,
  editWithoutSaving,
  fillValidForm,
  hydrateSavedDesign,
  landSave,
  mountContactForm,
  type Answer,
  type MountedContactForm,
  type RecordedRequest,
} from "./contact-submission-harness";
import { FakeConnection } from "./fake-connection";

type AnswerClass =
  | "failure"
  | "rejected"
  | "invalid"
  | "malformed"
  | "conflict"
  | "limited"
  | "limited-unreadable"
  | "sent"
  | "design-not-current"
  | "does-not-fit";

const ANSWERS: Readonly<Record<AnswerClass, Answer>> = {
  failure: { kind: "network-failure" },
  rejected: answerWith(400, { code: "CONTACT_REJECTED" }),
  invalid: answerWith(400, {
    code: "CONTACT_INVALID",
    issues: [{ field: "contact.name", code: "REQUIRED" }],
  }),
  malformed: answerWith(200, { unexpected: true }),
  conflict: answerWith(409, { code: "CONTACT_REQUEST_CONFLICT" }),
  limited: answerWith(
    429,
    { code: "CONTACT_LIMIT_REACHED" },
    { "retry-after": "30" },
  ),
  "limited-unreadable": answerWith(429, { code: "CONTACT_LIMIT_REACHED" }),
  sent: answerWith(200, { status: "sent", reference: "LM-1" }),
  "design-not-current": answerWith(409, { code: "CONTACT_DESIGN_NOT_CURRENT" }),
  "does-not-fit": answerWith(422, {
    code: "CONTACT_DESIGN_DOES_NOT_FIT",
    placementIds: [],
  }),
};

/** The answers after which a retry follows; a limit is listed twice, since it is the arm a wait is judged on. */
const RETRYABLE_ANSWER_CLASSES: readonly AnswerClass[] = [
  "failure",
  "failure",
  "rejected",
  "invalid",
  "malformed",
  "conflict",
  "conflict",
  "limited",
  "limited",
  "limited-unreadable",
];

/** A final answer ends a sequence, so the three are listed once each among the retryable ones. */
const ANSWER_CLASSES_BY_WEIGHT: readonly AnswerClass[] = [
  ...RETRYABLE_ANSWER_CLASSES,
  "sent",
  "design-not-current",
  "does-not-fit",
];

/** The class of outcome each answer is told as; only a network failure, which is no answer, is `unanswered`. */
const OUTCOME_KIND_OF_ANSWER: Readonly<
  Record<AnswerClass, ContactOutcome["kind"]>
> = {
  failure: "unanswered",
  rejected: "failed",
  invalid: "refused",
  malformed: "failed",
  conflict: "conflict",
  limited: "limited",
  "limited-unreadable": "limited",
  sent: "sent",
  "design-not-current": "design-not-current",
  "does-not-fit": "does-not-fit",
};

const TEXT_FIELDS: readonly ContactTextField[] = [
  "name",
  "phone",
  "locality",
  "email",
];

type Command =
  | {
      readonly kind: "type";
      readonly field: ContactTextField;
      readonly variant: number;
    }
  | { readonly kind: "leave"; readonly field: ContactTextField }
  | { readonly kind: "consent"; readonly isGiven: boolean }
  | { readonly kind: "channel"; readonly channel: "phone" | "email" }
  | { readonly kind: "honeypot"; readonly variant: number }
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
    weight: 7,
    arbitrary: fc
      .constantFrom(...ANSWER_CLASSES_BY_WEIGHT)
      .map((answerClass): Command => ({ kind: "answer", answerClass })),
  },
  {
    weight: 3,
    arbitrary: fc
      .record({
        field: fc.constantFrom(...TEXT_FIELDS),
        variant: fc.integer({ min: 0, max: 2 }),
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
      .boolean()
      .map((isGiven): Command => ({ kind: "consent", isGiven })),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom("phone" as const, "email" as const)
      .map((channel): Command => ({ kind: "channel", channel })),
  },
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: 0, max: 1 })
      .map((variant): Command => ({ kind: "honeypot", variant })),
  },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom(50, 1_000, 30_000, 100_000)
      .map((milliseconds): Command => ({ kind: "advance", milliseconds })),
  },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "edit-design" }) },
  { weight: 2, arbitrary: fc.constant<Command>({ kind: "save-lands" }) },
  { weight: 5, arbitrary: fc.constant<Command>({ kind: "online" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "online-twice" }) },
  { weight: 2, arbitrary: fc.constant<Command>({ kind: "offline" }) },
);

const COMMAND_SEQUENCES = fc.array(commandArbitrary, {
  minLength: 1,
  maxLength: 40,
  size: "max",
});

/** Only what an id's fate depends on, and only valid texts, so the arms of the id rule are reached far more often than by chance. */
const idRuleCommandArbitrary: fc.Arbitrary<Command> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<Command>({ kind: "press" }) },
  {
    weight: 8,
    arbitrary: fc
      .constantFrom(...RETRYABLE_ANSWER_CLASSES)
      .map((answerClass): Command => ({ kind: "answer", answerClass })),
  },
  {
    weight: 12,
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
      .integer({ min: 0, max: 1 })
      .map((variant): Command => ({ kind: "honeypot", variant })),
  },
  { weight: 2, arbitrary: fc.constant<Command>({ kind: "save-lands" }) },
  {
    weight: 3,
    arbitrary: fc
      .constantFrom(50, 30_000, 100_000)
      .map((milliseconds): Command => ({ kind: "advance", milliseconds })),
  },
  { weight: 6, arbitrary: fc.constant<Command>({ kind: "online" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "online-twice" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ kind: "offline" }) },
);

const ID_RULE_SEQUENCES = fc.array(idRuleCommandArbitrary, {
  minLength: 1,
  maxLength: 40,
  size: "max",
});

type TypedField = ContactTextField | "honeypot";

type TextFor = (field: TypedField, variant: number) => string;

const HONEYPOT_TEXTS = ["", "bot"] as const;

/** Texts that differ in what the request holds, some valid and some not, none with a space at its edge. */
const POOL: Readonly<Record<ContactTextField, readonly string[]>> = {
  name: ["Ana Popescu", "Ion Rusu", ""],
  phone: ["069 123 456", "079 654 321", "12"],
  locality: ["Chisinau", "Balti", ""],
  email: ["ana@example.com", "ion@example.com", "not-an-address"],
};

const textFromPool: TextFor = (field, variant) => {
  const texts = field === "honeypot" ? HONEYPOT_TEXTS : POOL[field];
  return texts[variant % texts.length] ?? "";
};

/** What a floor needs to see, per arm of what the sequences branch on, summed over the runs of one property.
 *  Each floor sits at least 5 standard deviations under the arm's measured mean, so chance does not fail it. */
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

function isUnsaved(): boolean {
  const state = useConfiguratorStore.getState();
  return state.design !== state.savedDesign;
}

interface Run {
  readonly form: MountedContactForm;
  readonly connection: FakeConnection;
  /** The indexes of the requests an `online` event started, read from the fake `fetch` and not from the hook. */
  readonly startedByTheConnection: Set<number>;
  /** The class of the answer each request got, by the request's index. */
  readonly answers: Map<number, AnswerClass>;
  nextRevision: number;
  editCount: number;
}

interface Step {
  readonly run: Run;
  readonly command: Command;
  readonly requestsBefore: number;
  readonly wasRequestOut: boolean;
  readonly reasonToIgnorePress: string | undefined;
}

interface Checks {
  readonly afterStep?: (step: Step) => void;
  readonly atEnd?: (run: Run) => void;
}

async function runSequence(
  commands: readonly Command[],
  textFor: TextFor,
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
    startedByTheConnection: new Set(),
    answers: new Map(),
    nextRevision: 4,
    editCount: 0,
  };
  try {
    form.inOneTask(({ edit }) => {
      TEXT_FIELDS.forEach((field) => {
        edit({ type: "text-changed", field, text: textFor(field, 0) });
      });
      edit({ type: "consent-changed", isGiven: true });
    });
    for (const command of commands) {
      const requestsBefore = form.fetchControl.requests.length;
      const wasRequestOut = form.fetchControl.outstanding > 0;
      const reasonToIgnorePress = reasonAPressIsIgnored(run);
      await apply(run, command, textFor);
      if (command.kind === "online" || command.kind === "online-twice") {
        form.fetchControl.requests
          .slice(requestsBefore)
          .forEach((_, offset) => {
            run.startedByTheConnection.add(requestsBefore + offset);
          });
      }
      checks.afterStep?.({
        run,
        command,
        requestsBefore,
        wasRequestOut,
        reasonToIgnorePress,
      });
    }
    checks.atEnd?.(run);
  } finally {
    form.unmount();
    forgetSentRequest();
  }
}

async function apply(
  run: Run,
  command: Command,
  textFor: TextFor,
): Promise<void> {
  const { form } = run;
  switch (command.kind) {
    case "type":
      form.inOneTask(({ edit }) => {
        edit({
          type: "text-changed",
          field: command.field,
          text: textFor(command.field, command.variant),
        });
      });
      return;
    case "leave":
      form.inOneTask(({ edit }) => {
        edit({ type: "field-left", field: command.field });
      });
      return;
    case "consent":
      form.inOneTask(({ edit }) => {
        edit({ type: "consent-changed", isGiven: command.isGiven });
      });
      return;
    case "channel":
      form.inOneTask(({ edit }) => {
        edit({ type: "channel-chosen", channel: command.channel });
      });
      return;
    case "honeypot":
      form.inOneTask(({ edit }) => {
        edit({
          type: "honeypot-filled",
          text: textFor("honeypot", command.variant),
        });
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
  countArm(`answered ${answerClass}`);
}

/** Why a press made now must send nothing, read from the store, the fake and the clock and not from the hook. */
function reasonAPressIsIgnored(run: Run): string | undefined {
  if (run.form.fetchControl.outstanding > 0) return "request out";
  if (isUnsaved()) return "design unsaved";
  const { phase } = run.form.current();
  if (isWaitingOutALimit(run)) return "limit not passed";
  if (phase.kind === "sent" || isDesignRefusal(phase)) return "send is final";
  return undefined;
}

function isWaitingOutALimit(run: Run): boolean {
  const { phase } = run.form.current();
  return (
    phase.kind === "failed" &&
    phase.waitsUntilMs !== undefined &&
    run.form.clock.nowMs < phase.waitsUntilMs
  );
}

function isDesignRefusal(
  phase: ReturnType<MountedContactForm["current"]>["phase"],
): boolean {
  return (
    phase.kind === "failed" &&
    (phase.outcome.kind === "design-not-current" ||
      phase.outcome.kind === "does-not-fit")
  );
}

/** P1 and P3, read after each step: what the step started, and what the hook says it is doing. */
function assertOneOutAndOnlyForASavedDesign(step: Step): void {
  const { form } = step.run;
  const started = form.fetchControl.requests.slice(step.requestsBefore);
  if (step.command.kind === "press" || step.command.kind === "press-twice") {
    assertPressStartedAtMostOne(started.length, step.reasonToIgnorePress);
  } else if (
    step.command.kind === "online" ||
    step.command.kind === "online-twice"
  ) {
    // The connection's return may start a retry, never more than one, and never while one is out.
    expect(started.length).toBeLessThanOrEqual(1);
    if (started.length === 1) countArm("online started a request");
  } else {
    expect(started).toHaveLength(0);
  }
  started.forEach(assertStartedAfterTheLastAnswerFromASavedDesign);
  expect(form.fetchControl.outstanding).toBeLessThanOrEqual(1);
  expect(form.current().phase.kind === "sending").toBe(
    form.fetchControl.outstanding === 1,
  );
}

function assertPressStartedAtMostOne(
  started: number,
  reasonToIgnorePress: string | undefined,
): void {
  expect(started).toBeLessThanOrEqual(1);
  if (reasonToIgnorePress !== undefined) {
    expect(started).toBe(0);
    countArm(`press ignored: ${reasonToIgnorePress}`);
  }
  if (started === 1) countArm("press started a request");
}

function assertStartedAfterTheLastAnswerFromASavedDesign(
  request: RecordedRequest,
): void {
  expect(request.outstandingBefore).toBe(0);
  expect(request.store.isSaved).toBe(true);
  expect(request.body.design).toEqual({
    id: DESIGN_ID,
    revision: request.store.revision,
  });
}

/** P2, read at the end: each send's id against the send before it. */
function assertIdsFollowTheRule(run: Run): void {
  const { requests } = run.form.fetchControl;
  requests.forEach((request, index) => {
    const previous = requests[index - 1];
    if (previous === undefined) return;
    const isSameRequest = coveredPartOf(previous) === coveredPartOf(request);
    const hadConflict = run.answers.get(index - 1) === "conflict";
    const isSameId =
      previous.body.clientRequestId === request.body.clientRequestId;
    expect(isSameId).toBe(isSameRequest && !hadConflict);
    countArm(armOfIdRule(isSameRequest, hadConflict));
    if (run.startedByTheConnection.has(index)) {
      // A retry the connection caused is the unanswered send again: the same id, the same covered request.
      expect(isSameId, "an online retry changed the id").toBe(true);
      expect(isSameRequest, "an online retry changed the request").toBe(true);
      expect(run.answers.get(index - 1)).toBe("failure");
      countArm("an online retry kept its id and its request");
    }
  });
}

/** P-class, read after each answer: the phase says the class the answer had, and `unanswered` only for no answer. */
function assertAnswerIsToldAsItsClass(step: Step): void {
  if (step.command.kind !== "answer" || !step.wasRequestOut) return;
  const { phase } = step.run.form.current();
  const expectedKind = OUTCOME_KIND_OF_ANSWER[step.command.answerClass];
  const shownKind = phase.kind === "failed" ? phase.outcome.kind : phase.kind;
  expect(shownKind).toBe(expectedKind);
  countArm(
    expectedKind === "unanswered"
      ? "told as unanswered"
      : `told as ${expectedKind}`,
  );
}

function armOfIdRule(isSameRequest: boolean, hadConflict: boolean): string {
  if (hadConflict) return "id after a conflict";
  return isSameRequest
    ? "id kept for the same request"
    : "id renewed for a changed request";
}

beforeEach(() => {
  arms.clear();
});

describe("P1 and P3: one request out, and only for a saved design at the store's revision", () => {
  it("holds over any order of typing, presses, answers, failures, waits and saves", async () => {
    await fc.assert(
      fc.asyncProperty(COMMAND_SEQUENCES, async (commands) => {
        await runSequence(commands, textFromPool, {
          afterStep: assertOneOutAndOnlyForASavedDesign,
        });
      }),
      { numRuns: 500 },
    );

    expectFloor("press started a request", 300);
    expectFloor("press ignored: request out", 250);
    expectFloor("press ignored: design unsaved", 250);
    expectFloor("press ignored: limit not passed", 100);
    expectFloor("press ignored: send is final", 150);
    expectFloor("online started a request", 4);
  });
});

describe("P-class: a request that got no answer is told unanswered, and no answer the browser received is", () => {
  it("holds over any order of presses, answers, failures, waits and saves", async () => {
    await fc.assert(
      fc.asyncProperty(COMMAND_SEQUENCES, async (commands) => {
        await runSequence(commands, textFromPool, {
          afterStep: assertAnswerIsToldAsItsClass,
        });
      }),
      { numRuns: 1000 },
    );

    expectFloor("told as unanswered", 100);
    expectFloor("told as failed", 60);
    expectFloor("told as refused", 40);
    expectFloor("told as conflict", 90);
    expectFloor("told as limited", 150);
  });
});

describe("P2: an id is kept for the same request, renewed for a changed one and after a conflict", () => {
  it("holds over any order of edits, presses, failures and saves, and each arm of the rule is reached", async () => {
    await fc.assert(
      fc.asyncProperty(ID_RULE_SEQUENCES, async (commands) => {
        await runSequence(commands, textFromPool, {
          atEnd: assertIdsFollowTheRule,
        });
      }),
      { numRuns: 500 },
    );

    expectFloor("id kept for the same request", 50);
    expectFloor("id renewed for a changed request", 100);
    expectFloor("id after a conflict", 50);
    expectFloor("an online retry kept its id and its request", 10);
  });
});

describe("P4: a typed value is nowhere but the hook's memory and the one request body", () => {
  const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
  let runNumber = 0;

  /** Values no other test types and no store, URL or header could hold by chance; the phone's are digits. */
  function tokensOfRun(number: number): Readonly<Record<TypedField, string>> {
    const suffix = String(number).padStart(6, "0");
    return {
      name: `Tokname${suffix}`,
      phone: `069${suffix}`,
      locality: `Toklocality${suffix}`,
      email: `tokmail${suffix}@example.com`,
      honeypot: `Tokhoney${suffix}`,
    };
  }

  function contentsOf(storage: Storage): [string, string | null][] {
    return Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index) ?? "";
      return [key, storage.getItem(key)];
    });
  }

  /** Everything outside the hook and the request's body that a typed value could have been written to. */
  function outsideTheMemory(
    requests: readonly RecordedRequest[],
    shown: unknown,
  ): string {
    return JSON.stringify({
      store: useConfiguratorStore.getState(),
      cookie: document.cookie,
      local: contentsOf(window.localStorage),
      session: contentsOf(window.sessionStorage),
      address: window.location.href,
      historyState: window.history.state as unknown,
      historyLength: window.history.length,
      consoleCalls: CONSOLE_METHODS.map(
        (method) => vi.mocked(console[method]).mock.calls,
      ),
      requestLines: requests.map(({ url, init }) => ({
        url,
        method: init.method,
        headers: init.headers,
        keys: Object.keys(init).filter((key) => key !== "body"),
      })),
      shown,
    });
  }

  function leakedFrom(
    tokens: Readonly<Record<TypedField, string>>,
    outside: string,
  ): string[] {
    return Object.values(tokens).filter((token) => outside.includes(token));
  }

  beforeEach(() => {
    CONSOLE_METHODS.forEach((method) => {
      vi.spyOn(console, method).mockImplementation(() => undefined);
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("finds a value planted in storage, and none that was never typed (control)", () => {
    const tokens = tokensOfRun(999_999);

    expect(leakedFrom(tokens, outsideTheMemory([], {}))).toEqual([]);
    window.localStorage.setItem("draft", tokens.name);
    expect(leakedFrom(tokens, outsideTheMemory([], {}))).toEqual([tokens.name]);
  });

  it("holds over any order of typing, presses, answers and saves", async () => {
    await fc.assert(
      fc.asyncProperty(COMMAND_SEQUENCES, async (commands) => {
        runNumber += 1;
        const tokens = tokensOfRun(runNumber);
        await runSequence(commands, (field) => tokens[field], {
          afterStep: ({ run }) => {
            const { phase, saveWait, refusedPress } = run.form.current();
            const outside = outsideTheMemory(run.form.fetchControl.requests, {
              phase,
              saveWait,
              refusedPress,
            });
            expect(leakedFrom(tokens, outside)).toEqual([]);
          },
          atEnd: ({ form }) => {
            form.fetchControl.requests.forEach(({ url, body }) => {
              expect(url).toBe(CONTACT_SUBMISSIONS_ENDPOINT);
              expect(JSON.stringify(body)).toContain(tokens.name);
              countArm("a body carried the typed values");
            });
          },
        });
      }),
      { numRuns: 100 },
    );

    expectFloor("a body carried the typed values", 50);
  });

  it("keeps the typed values in the hook's own memory while the page lives", () => {
    const tokens = tokensOfRun(888_888);
    hydrateSavedDesign();
    const form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
    fillValidForm(form);
    form.inOneTask(({ edit }) => {
      edit({ type: "text-changed", field: "name", text: tokens.name });
      edit({ type: "honeypot-filled", text: tokens.honeypot });
    });

    expect(form.current().form.values).toMatchObject({
      name: tokens.name,
      honeypot: tokens.honeypot,
    });
    form.unmount();
  });
});
