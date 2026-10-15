// The states a design's write can be in when the design is loaded again, each as the events that bring one tab there
// (`qa-8k2-one-tab-two-designs.ts`): shared by the sweep of the order of answers and the sweep of a return that
// changes nothing. No assertion lives here.
import type { SaveMode, TabEvent } from "./qa-8k2-one-tab-two-designs";

const BACKOFF_FIRST_STEP_MS = 500;
const LIMIT_WAIT_MS = 1000;

export const PROBE_NOW: readonly TabEvent[] = [
  { kind: "probe-answered" },
  { kind: "probe-arrives" },
];
export const EDIT: TabEvent = { kind: "edit" };
export const TO_A: TabEvent = { kind: "go", to: "design-a", keptPage: 0 };
export const TO_B: TabEvent = { kind: "go", to: "design-b", keptPage: 0 };
export const A_MOMENT: TabEvent = { kind: "pass", ms: 0 };

export interface HeldState {
  readonly name: string;
  /** The fates of the saves sent before the design is left. */
  readonly modes: readonly SaveMode[];
  /** From design A loaded and writable to design B on screen, with A's write in the named state. */
  readonly untilLeft: readonly TabEvent[];
  /** Whether a save of A is already out when A is returned to, so its first answer needs no time to pass. */
  readonly isSentAlready: boolean;
  /** What must be answered first for A's write to be free to go: design B's request, where it holds the one slot. */
  readonly beforeTheFirstAnswer: readonly TabEvent[];
  /** What the screen says of the write when its design is loaded again. */
  readonly shownOnReturn: {
    saveStatus: string;
    hasATime: boolean;
    isUnsaved: boolean;
  };
}

export const HELD_STATES: readonly HeldState[] = [
  {
    name: "waiting for the limit",
    modes: ["limited-30s"],
    untilLeft: [EDIT, A_MOMENT, TO_B],
    isSentAlready: false,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "error", hasATime: true, isUnsaved: true },
  },
  {
    name: "backing off after a failure",
    modes: ["failed"],
    untilLeft: [EDIT, A_MOMENT, TO_B],
    isSentAlready: false,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "error", hasATime: false, isUnsaved: true },
  },
  {
    name: "sent and not answered",
    modes: ["held"],
    untilLeft: [EDIT, A_MOMENT, TO_B],
    isSentAlready: true,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "saving", hasATime: false, isUnsaved: true },
  },
  {
    name: "sent and not answered, with a later edit behind it",
    modes: ["held"],
    untilLeft: [EDIT, A_MOMENT, EDIT, TO_B],
    isSentAlready: true,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "saving", hasATime: false, isUnsaved: true },
  },
  {
    name: "ready behind the one-second interval",
    modes: ["stored"],
    untilLeft: [EDIT, A_MOMENT, EDIT, TO_B],
    isSentAlready: false,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "idle", hasATime: false, isUnsaved: true },
  },
  {
    name: "ready behind the other design's request",
    modes: ["held"],
    untilLeft: [
      TO_B,
      ...PROBE_NOW,
      EDIT,
      A_MOMENT,
      TO_A,
      ...PROBE_NOW,
      EDIT,
      TO_B,
    ],
    isSentAlready: false,
    beforeTheFirstAnswer: [{ kind: "answer", with: "stored" }],
    shownOnReturn: { saveStatus: "idle", hasATime: false, isUnsaved: true },
  },
  {
    name: "failed, its backoff ended, ready behind the other design's request",
    modes: ["failed", "held"],
    untilLeft: [
      EDIT,
      A_MOMENT,
      TO_B,
      ...PROBE_NOW,
      EDIT,
      A_MOMENT,
      TO_A,
      { kind: "pass", ms: BACKOFF_FIRST_STEP_MS },
      TO_B,
    ],
    isSentAlready: false,
    beforeTheFirstAnswer: [{ kind: "answer", with: "stored" }],
    shownOnReturn: { saveStatus: "error", hasATime: false, isUnsaved: true },
  },
  {
    name: "refused by the limit, its time come, ready behind the other design's request",
    modes: ["limited-1s", "held"],
    untilLeft: [
      EDIT,
      A_MOMENT,
      TO_B,
      ...PROBE_NOW,
      EDIT,
      A_MOMENT,
      TO_A,
      { kind: "pass", ms: LIMIT_WAIT_MS },
      TO_B,
    ],
    isSentAlready: false,
    beforeTheFirstAnswer: [{ kind: "answer", with: "stored" }],
    shownOnReturn: { saveStatus: "error", hasATime: true, isUnsaved: true },
  },
  {
    name: "that was stored: nothing is held and the kept page is the older one",
    modes: ["stored"],
    untilLeft: [EDIT, A_MOMENT, TO_B],
    isSentAlready: false,
    beforeTheFirstAnswer: [],
    shownOnReturn: { saveStatus: "idle", hasATime: false, isUnsaved: false },
  },
];
