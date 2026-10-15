import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  nextContactPageView,
  type ContactPageView,
  type ContactPageViewInput,
} from "@/contact/contact-page-view";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

/**
 * The view over a mount, as the screen computes it: `nextContactPageView` fed the previous view and what the store
 * holds, once on arrival and after every event. The store is the real one and its real actions are driven; the oracles
 * read the store's fields directly and never go through `contactPageViewOf`.
 */

const THIS_DESIGN = "design0123456789abcde" as DesignId;
const ANOTHER_DESIGN = "another0123456789abcd" as DesignId;
const PAGE_REVISION = "4";
const NEWER_REVISION = "9";
const REFERENCE = "LM-2614";
const NUM_RUNS = 800;
/** Floors per arm, so the sweep cannot pass by landing only where the rule was not changed. */
const FLOOR_PER_EVENT = 50;
const FLOOR_RELOADS_AFTER_THE_FORM = 10;
const FLOOR_STARTED_ALREADY_SENT = 10;

type ServerKind = SentReferenceAnswer["kind"];
type Arrival = "clean-at-r" | "unsaved-at-r" | "newer-clean" | "another-design";
type Event =
  | "edit"
  | "save-answered"
  | "save-held"
  | "save-refused"
  | "conflict"
  | "overwrite"
  | "conflict-reload"
  | "stored-copy-taken"
  | "another-design-loaded";

const SERVER_KINDS: readonly ServerKind[] = ["sent", "none", "unknown"];
const ARRIVALS: readonly Arrival[] = [
  "clean-at-r",
  "unsaved-at-r",
  "newer-clean",
  "another-design",
];
const EVENTS: readonly Event[] = [
  "edit",
  "save-answered",
  "save-held",
  "save-refused",
  "conflict",
  "overwrite",
  "conflict-reload",
  "stored-copy-taken",
  "another-design-loaded",
];

function serverAnswerOf(kind: ServerKind): SentReferenceAnswer {
  return kind === "sent" ? { kind, reference: REFERENCE } : { kind };
}

function designLabelled(label: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId: label };
}

function newStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
  });
}

type Store = ReturnType<typeof newStore>;

function loadInto(
  store: Store,
  load: { designId: DesignId; revision: string; label: string },
): void {
  store.getState().hydrate({
    design: designLabelled(load.label),
    designId: load.designId,
    revision: load.revision,
    canWrite: "checking",
  });
}

function arrive(store: Store, arrival: Arrival): void {
  switch (arrival) {
    case "clean-at-r":
      loadInto(store, {
        designId: THIS_DESIGN,
        revision: PAGE_REVISION,
        label: "stored",
      });
      return;
    case "unsaved-at-r":
      loadInto(store, {
        designId: THIS_DESIGN,
        revision: PAGE_REVISION,
        label: "stored",
      });
      store.setState({ design: designLabelled("edited-before-arrival") });
      return;
    case "newer-clean":
      loadInto(store, {
        designId: THIS_DESIGN,
        revision: NEWER_REVISION,
        label: "newer",
      });
      return;
    case "another-design":
      loadInto(store, {
        designId: ANOTHER_DESIGN,
        revision: PAGE_REVISION,
        label: "another",
      });
      return;
  }
}

function nextRevision(state: ConfiguratorState): string {
  return String(Number(state.revision ?? PAGE_REVISION) + 1);
}

function applyEvent(store: Store, event: Event, step: number): void {
  const state = store.getState();
  switch (event) {
    case "edit":
      store.setState({ design: designLabelled(`edit-${String(step)}`) });
      return;
    case "overwrite":
      state.overwriteConflict();
      state.applySaved({
        id: state.designId ?? THIS_DESIGN,
        revision: nextRevision(state),
        savedDesign: state.design,
      });
      return;
    case "save-answered":
      state.applySaved({
        id: state.designId ?? THIS_DESIGN,
        revision: nextRevision(state),
        savedDesign: state.design,
      });
      return;
    case "save-held":
      state.setSaveStatus("saving");
      return;
    case "save-refused":
      state.setSaveStatus("error", 1000);
      return;
    case "conflict":
      state.setSaveStatus("conflict");
      return;
    case "conflict-reload":
      loadInto(store, {
        designId: THIS_DESIGN,
        revision: PAGE_REVISION,
        label: `reloaded-${String(step)}`,
      });
      return;
    case "stored-copy-taken":
      state.applyWriteAccess({
        designId: THIS_DESIGN,
        canWrite: true,
        stored: {
          design: designLabelled(`stored-${String(step)}`),
          revision: String(Number(state.revision ?? PAGE_REVISION) + 2),
        },
      });
      return;
    case "another-design-loaded":
      loadInto(store, {
        designId: ANOTHER_DESIGN,
        revision: PAGE_REVISION,
        label: `another-${String(step)}`,
      });
      return;
  }
}

/** The oracle: the three conditions of 8M2.6 read straight off the store's fields. */
function isHeldAsLoaded(state: ConfiguratorState): boolean {
  return (
    state.designId === THIS_DESIGN &&
    state.revision === PAGE_REVISION &&
    state.design === state.savedDesign
  );
}

function inputFor(
  server: SentReferenceAnswer,
  state: ConfiguratorState,
): ContactPageViewInput {
  return {
    server,
    page: { designId: THIS_DESIGN, revision: PAGE_REVISION },
    held: {
      designId: state.designId,
      revision: state.revision,
      hasUnsavedEdit: state.design !== state.savedDesign,
    },
  };
}

interface Step {
  readonly event: Event | "arrival";
  readonly view: ContactPageView;
  readonly isHeldAsLoaded: boolean;
}

function fold(
  server: SentReferenceAnswer,
  arrival: Arrival,
  events: readonly Event[],
): Step[] {
  const store = newStore();
  arrive(store, arrival);
  const steps: Step[] = [];
  let previous: ContactPageView | undefined;
  const record = (event: Step["event"]): void => {
    const state = store.getState();
    previous = nextContactPageView(previous, inputFor(server, state));
    steps.push({
      event,
      view: previous,
      isHeldAsLoaded: isHeldAsLoaded(state),
    });
  };
  record("arrival");
  events.forEach((event, index) => {
    applyEvent(store, event, index);
    record(event);
  });
  return steps;
}

interface Tally {
  reloadsToSentRevisionAfterTheForm: number;
  startedAlreadySent: number;
  readonly eventsSeen: Map<Event, number>;
}

function newTally(): Tally {
  return {
    reloadsToSentRevisionAfterTheForm: 0,
    startedAlreadySent: 0,
    eventsSeen: new Map<Event, number>(),
  };
}

function tallyOf(tally: Tally, steps: readonly Step[]): void {
  for (const { event } of steps) {
    if (event !== "arrival") {
      tally.eventsSeen.set(event, (tally.eventsSeen.get(event) ?? 0) + 1);
    }
  }
  if (steps[0]?.view.kind === "already-sent") tally.startedAlreadySent += 1;
  const firstForm = steps.findIndex(({ view }) => view.kind === "form");
  tally.reloadsToSentRevisionAfterTheForm += steps.filter(
    ({ event, isHeldAsLoaded: held }, index) =>
      firstForm !== -1 &&
      index > firstForm &&
      event === "conflict-reload" &&
      held,
  ).length;
}

const scenario = fc.record({
  server: fc.constantFrom(...SERVER_KINDS),
  arrival: fc.constantFrom(...ARRIVALS),
  events: fc.array(fc.constantFrom(...EVENTS), { maxLength: 14 }),
});

describe("the contact page's view over a mount", () => {
  it("has the shape already-sent* then form*, whatever the store does, a reload to the sent revision included", () => {
    const tally = newTally();

    fc.assert(
      fc.property(scenario, ({ server, arrival, events }) => {
        const steps = fold(serverAnswerOf(server), arrival, events);
        tallyOf(tally, steps);

        const kinds = steps.map(({ view }) => view.kind);
        const firstForm = kinds.indexOf("form");
        expect(
          firstForm === -1 || !kinds.slice(firstForm).includes("already-sent"),
        ).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );

    for (const event of EVENTS) {
      expect(tally.eventsSeen.get(event) ?? 0).toBeGreaterThan(FLOOR_PER_EVENT);
    }
    expect(tally.reloadsToSentRevisionAfterTheForm).toBeGreaterThan(
      FLOOR_RELOADS_AFTER_THE_FORM,
    );
    expect(tally.startedAlreadySent).toBeGreaterThan(
      FLOOR_STARTED_ALREADY_SENT,
    );
  });

  it("starts as the pure rule says, read off the store's fields: already sent only for a sent answer held clean at the page's revision", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SERVER_KINDS),
        fc.constantFrom(...ARRIVALS),
        (server, arrival) => {
          const [first] = fold(serverAnswerOf(server), arrival, []);

          expect(first?.view.kind === "already-sent").toBe(
            server === "sent" && first?.isHeldAsLoaded === true,
          );
        },
      ),
    );
  });

  it("is already sent at a step only when the answer is sent and the store holds this design clean at the page's revision at that step", () => {
    fc.assert(
      fc.property(scenario, ({ server, arrival, events }) => {
        const steps = fold(serverAnswerOf(server), arrival, events);

        for (const { view, isHeldAsLoaded: held } of steps) {
          if (view.kind === "already-sent") {
            expect(server).toBe("sent");
            expect(held).toBe(true);
            expect(view.reference).toBe(REFERENCE);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is the form at every step for an answer of none or unknown", () => {
    fc.assert(
      fc.property(
        fc.record({
          server: fc.constantFrom<ServerKind>("none", "unknown"),
          arrival: fc.constantFrom(...ARRIVALS),
          events: fc.array(fc.constantFrom(...EVENTS), { maxLength: 14 }),
        }),
        ({ server, arrival, events }) => {
          const steps = fold(serverAnswerOf(server), arrival, events);

          expect(steps.map(({ view }) => view.kind)).not.toContain(
            "already-sent",
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
