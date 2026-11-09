// @vitest-environment happy-dom
//
// The flow after the last choice: the page waits for the choice's save, asks the notice again, says the prices sentence and
// any accessory it was not already showing, and acknowledges the displayed pair. Covered here: a save that is refused or
// dropped, a second answer that fails in each way the route can fail, a second answer for another pair, version or arm, an
// unrelated edit queued behind the choice, a double press, a first answer that arrives late or never, and a server that
// remembers the marker so that "reopening shows neither the sheet nor the notice" is observed.
//
// Both halves of the save-landed predicate (`hasReplacementSaveLanded`) are pinned: `design === savedDesign` and
// `revision !== revisionAtChoice`. No ordinary flow makes the design equal the saved one with the revision unmoved, so the
// revision half is pinned by a test marked SIMULATED that calls `applySaved`, the coalescer's own hook, with the unmoved
// revision and the design on screen.
import { createTranslator } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  accessoryName,
  beginTest,
  byTestId,
  advanceClock,
  chooseTier,
  currentDesignId,
  driveEveryTimerFromTheTest,
  recoverTheSaveQueue,
  endTest,
  hydrate,
  mountEditor,
  notice,
  OFF_PAIR,
  press,
  reopenEditor,
  required,
  requestsOf,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  ROOT_WITH_MDF_OFF,
  serveWorld,
  settle,
  SWITCHED_OFF_HARDWARE,
  SWITCHED_OFF_MATERIAL,
  type Editor,
  type NoticeAnswer,
  type SentRequest,
  carryingMdf,
  MELAMINE_NAME,
} from "../support/replacement-sheet-world";
import { kitchenCarrying, tierName } from "../support/tier-offer-world";

const SENTENCE = roMessages.customerPriceNotice.alsoUpdated;
const OTHER_PAIR = { ...OFF_PAIR, availabilityRevision: "2" };
const OTHER_VERSION = { ...OFF_PAIR, versionId: "another-version" };
const STILL_OWED = [
  { item: { kind: "material", tierId: "material.veneer" }, remaining: [] },
];

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

async function openAndChoose(
  notices: readonly NoticeAnswer[],
  postStatus = 200,
): Promise<{
  readonly editor: Editor;
  readonly world: ReturnType<typeof serveWorld>;
}> {
  const world = serveWorld({ notices, postStatus });
  hydrate(carryingMdf());
  const editor = await mountEditor();
  await chooseTier(editor, MELAMINE_NAME);
  return { editor, world };
}

function confirmationText(editor: Editor): string {
  return byTestId(editor, "replacement-confirmation")?.textContent ?? "";
}

describe("a choice whose save does not land", () => {
  // The save queue is the page's, one for the whole file: a refused save is let recover at the end of its test so the next
  // one starts from an idle queue, and that recovery (which does ask) happens after the assertions.
  it.each([409, 500, 429, 503])(
    "a save answered %i sends no GET and no POST, and says nothing was changed",
    async (status) => {
      driveEveryTimerFromTheTest();
      const { editor, world } = await openAndChoose([
        notice(),
        notice({ pricesChanged: true }),
      ]);

      await world.refuseSave(status);
      await advanceClock(500);

      expect(requestsOf(world, "GET")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toEqual([]);
      expect(byTestId(editor, "replacement-confirmation")).toBeNull();
      expect(byTestId(editor, "price-notice")).toBeNull();
      await recoverTheSaveQueue(world);
    },
  );

  it("a save the network drops sends no GET and no POST", async () => {
    driveEveryTimerFromTheTest();
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);

    await world.dropSave();
    await advanceClock(500);

    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "replacement-confirmation")).toBeNull();
    await recoverTheSaveQueue(world);
  });

  it("a save that fails and then succeeds on its retry asks once, after the retry", async () => {
    driveEveryTimerFromTheTest();
    const { world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);

    await world.refuseSave(500);
    expect(requestsOf(world, "GET")).toHaveLength(1);
    await advanceClock(120_000);
    expect(world.savesWaiting()).toBe(1);
    await world.landSave("2");

    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });
});

describe("the save-landed predicate, both halves", () => {
  it("SIMULATED: a design equal to the saved one with the revision unmoved sends no GET (the revision half)", async () => {
    const { world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);
    const state = useConfiguratorStore.getState();
    expect(state.design).not.toBe(state.savedDesign);

    act(() => {
      useConfiguratorStore.getState().applySaved({
        id: state.designId as never,
        revision: state.revision as never,
        savedDesign: state.design,
      });
    });
    await settle();

    expect(useConfiguratorStore.getState().design).toBe(
      useConfiguratorStore.getState().savedDesign,
    );
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it("SIMULATED: ...and the same state with the revision moved asks at once, so the test above is not a stuck flow", async () => {
    const { world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);
    const state = useConfiguratorStore.getState();

    act(() => {
      useConfiguratorStore.getState().applySaved({
        id: state.designId as never,
        revision: "2" as never,
        savedDesign: state.design,
      });
    });
    await settle();

    expect(requestsOf(world, "GET")).toHaveLength(2);
  });

  it("a revision that moved while the design on screen is not the saved one sends no GET (the design half)", async () => {
    const { world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);
    const state = useConfiguratorStore.getState();

    act(() => {
      useConfiguratorStore.getState().applySaved({
        id: state.designId as never,
        revision: "2" as never,
      });
    });
    await settle();

    expect(useConfiguratorStore.getState().design).not.toBe(
      useConfiguratorStore.getState().savedDesign,
    );
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it("an unrelated edit made while the choice's save is in flight holds the GET until the edit's own save has landed", async () => {
    driveEveryTimerFromTheTest();
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ pricesChanged: true }),
    ]);
    act(() => {
      useConfiguratorStore.getState().applyWholeKitchenSettings({
        handle: "black",
        availableMaterialTierIds: [],
        availableHardwareTierIds: [],
      });
    });
    expect(useConfiguratorStore.getState().design.settings?.handle).toBe(
      "black",
    );

    await world.landSave("2");

    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "replacement-confirmation")).toBeNull();

    await advanceClock(1_000);
    expect(requestsOf(world, "PUT")).toHaveLength(2);
    expect(requestsOf(world, "GET")).toHaveLength(1);
    await world.landSave("3");
    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("pressed twice in one breath, the apply control saves once, says the change once and acknowledges once", async () => {
    const world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    press(required(editor, "replacement-choose"));
    const option = [
      ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
    ].find((candidate) => candidate.textContent.includes(MELAMINE_NAME));
    press(option as HTMLElement);
    const apply = required(editor, "replacement-apply");

    act(() => {
      apply.click();
      apply.click();
    });
    await settle();
    await world.landSave("2");

    expect(requestsOf(world, "PUT")).toHaveLength(1);
    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
    expect(
      editor.container.querySelectorAll(
        '[data-testid="replacement-confirmation"] span',
      ),
    ).toHaveLength(2);
  });
});

describe("the second answer, in every way it can come", () => {
  const failures: readonly { name: string; answer: NoticeAnswer }[] = [
    { name: "a 429", answer: 429 },
    { name: "a 500", answer: 500 },
    { name: "a 503", answer: 503 },
    { name: "a 404", answer: 404 },
    { name: "a dropped network", answer: "network-down" },
    {
      name: "a 200 that is not the route's own body",
      answer: { hello: "world" },
    },
  ];

  it.each(failures)(
    "$name keeps the first answer: the sent note stays, nothing is acknowledged, no prices sentence, the change is still said",
    async ({ answer }) => {
      const { editor, world } = await openAndChoose([
        notice({ isSent: true, pricesChanged: true }),
        answer,
      ]);

      await world.landSave("2");

      expect(requestsOf(world, "GET")).toHaveLength(2);
      expect(byTestId(editor, "sent-kitchen-note")).not.toBeNull();
      expect(requestsOf(world, "POST")).toEqual([]);
      expect(byTestId(editor, "price-notice")).toBeNull();
      expect(confirmationText(editor)).toContain(MELAMINE_NAME);
      expect(confirmationText(editor)).not.toContain(SENTENCE);
    },
  );

  it("an answer for another version says nothing about prices and acknowledges nothing", async () => {
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ current: OTHER_VERSION, pricesChanged: true }),
    ]);

    await world.landSave("2");

    expect(confirmationText(editor)).not.toContain(SENTENCE);
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("the arm that holds no active version says nothing about prices and acknowledges nothing", async () => {
    const { editor, world } = await openAndChoose([
      notice({ isSent: true }),
      { kind: "no-active-version", isSent: true },
    ]);

    await world.landSave("2");

    expect(confirmationText(editor)).not.toContain(SENTENCE);
    expect(confirmationText(editor)).toContain(MELAMINE_NAME);
    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it.each([
    {
      name: "this page's pair, prices moved",
      current: OFF_PAIR,
      moved: true,
      sentence: true,
      posts: 1,
    },
    {
      name: "this page's pair, prices did not move",
      current: OFF_PAIR,
      moved: false,
      sentence: false,
      posts: 1,
    },
    {
      name: "another revision, prices moved",
      current: OTHER_PAIR,
      moved: true,
      sentence: false,
      posts: 0,
    },
    {
      name: "another revision, prices did not move",
      current: OTHER_PAIR,
      moved: false,
      sentence: false,
      posts: 0,
    },
    {
      name: "another version, prices moved",
      current: OTHER_VERSION,
      moved: true,
      sentence: false,
      posts: 0,
    },
  ])(
    "the merged sentence follows the pair and the price flag together: $name",
    async ({ current, moved, sentence, posts }) => {
      const { editor, world } = await openAndChoose([
        notice({ pricesChanged: !moved }),
        notice({ current, pricesChanged: moved }),
      ]);

      await world.landSave("2");

      expect(confirmationText(editor).includes(SENTENCE)).toBe(sentence);
      expect(requestsOf(world, "POST")).toHaveLength(posts);
    },
  );

  it("acknowledges the pair this page displays, never a member the answer adds", async () => {
    const { world } = await openAndChoose([
      notice(),
      notice({ current: { ...OFF_PAIR, extra: "not-the-pair" } }),
    ]);

    await world.landSave("2");

    const [post] = requestsOf(world, "POST");
    expect(post?.body).toEqual(OFF_PAIR);
  });

  it("a second answer that still owes a replacement writes no marker, and C1 does not flash up beside the confirmation", async () => {
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ replacementsRequired: STILL_OWED, pricesChanged: true }),
    ]);

    await world.landSave("2");

    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("a first answer that failed is no obstacle: the sheet opened from the store, and the second answer is taken as the only one", async () => {
    const { editor, world } = await openAndChoose([
      500,
      notice({ pricesChanged: true }),
    ]);

    await world.landSave("2");

    expect(confirmationText(editor)).toContain(SENTENCE);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("keeps the sent note when the second answer succeeds as well", async () => {
    const { editor, world } = await openAndChoose([
      notice({ isSent: true }),
      notice({ isSent: true }),
    ]);

    await world.landSave("2");

    expect(byTestId(editor, "sent-kitchen-note")).not.toBeNull();
  });
});

describe("a first answer that is still on its way when the flow ends", () => {
  // Regression pin: a first `GET` slower than the customer's choice and its save must not replace the second answer the flow
  // held as already acknowledged. If it did, the notice card would come back beside the confirmation that already said its
  // sentence, and its acknowledge control would do nothing (`acknowledgedFor` is latched), so the card could not be dismissed.
  async function endTheFlowBeforeTheFirstAnswerArrives(): Promise<{
    readonly editor: Editor;
    readonly world: ReturnType<typeof serveWorld>;
    readonly arrive: (late?: Record<string, unknown>) => Promise<void>;
  }> {
    let releaseFirstAnswer: (answer: NoticeAnswer) => void = () => undefined;
    const firstAnswer = new Promise<NoticeAnswer>((resolve) => {
      releaseFirstAnswer = resolve;
    });
    const world = serveWorld({
      notices: (nth) =>
        nth === 0 ? firstAnswer : notice({ pricesChanged: true }),
    });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);
    await world.landSave("2");
    expect(requestsOf(world, "POST")).toHaveLength(1);
    expect(confirmationText(editor)).toContain(SENTENCE);
    return {
      editor,
      world,
      arrive: async (late = notice({ pricesChanged: true })) => {
        releaseFirstAnswer(late);
        await settle();
      },
    };
  }

  // The race needs a first answer that says "prices moved" with nothing left to replace: the server evaluated that first `GET`
  // after the choice's `PUT` committed, and its response is still in flight when the second answer has come back. A first
  // `GET` evaluated BEFORE the save still lists the owed row and draws no notice (the control test below).
  it("a late first answer that still lists the owed row draws no C1", async () => {
    const { editor, arrive } = await endTheFlowBeforeTheFirstAnswerArrives();

    await arrive(
      notice({
        pricesChanged: true,
        replacementsRequired: [
          {
            item: { kind: "material", tierId: SWITCHED_OFF_MATERIAL },
            remaining: [{ kind: "material", tierId: "material.melamine" }],
          },
        ],
      }),
    );

    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("does not bring C1 back once the confirmation has said the prices sentence and the pair has been acknowledged", async () => {
    const { editor, arrive } = await endTheFlowBeforeTheFirstAnswerArrives();

    await arrive();

    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("never leaves a card that its acknowledge control cannot dismiss", async () => {
    const { editor, arrive } = await endTheFlowBeforeTheFirstAnswerArrives();
    await arrive();
    const acknowledge = byTestId(editor, "price-notice-acknowledge");

    if (acknowledge !== null) {
      press(acknowledge);
      await settle();
    }

    expect(byTestId(editor, "price-notice")).toBeNull();
  });
});

describe("reopening after the flow", () => {
  /** A server that remembers: the notice reads "prices moved" until the pair has been acknowledged. One that cannot write the
   *  marker (`isMarkerWritable: false`) reads "prices moved" for ever. */
  function rememberingNotices(
    isMarkerWritable = true,
  ): (nth: number, requests: readonly SentRequest[]) => NoticeAnswer {
    return (_nth, requests) =>
      notice({
        pricesChanged:
          !isMarkerWritable ||
          !requests.some((request) => request.method === "POST"),
      });
  }

  it("shows neither the sheet nor C1, and the price, once the marker has been written", async () => {
    const world = serveWorld({ notices: rememberingNotices() });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);
    await world.landSave("2");
    expect(requestsOf(world, "POST")).toHaveLength(1);

    const reopened = await reopenEditor(ROOT_WITH_MDF_OFF);

    expect(byTestId(reopened, "replacement-sheet")).toBeNull();
    expect(byTestId(reopened, "price-notice")).toBeNull();
    expect(byTestId(reopened, "replacement-confirmation")).toBeNull();
    expect(byTestId(reopened, "price-bar-total")).not.toBeNull();
    expect(requestsOf(world, "GET")).toHaveLength(3);
  });

  it("CONTROL: when the marker could not be written, the same reopen shows C1 and no sheet, so the test above is reading the marker", async () => {
    const world = serveWorld({
      notices: rememberingNotices(false),
      postStatus: 500,
    });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);
    await world.landSave("2");

    const reopened = await reopenEditor(ROOT_WITH_MDF_OFF);

    expect(byTestId(reopened, "replacement-sheet")).toBeNull();
    expect(byTestId(reopened, "price-notice")).not.toBeNull();
  });

  it("a kitchen with two owed rows is acknowledged once, after the last, and not after the first", async () => {
    driveEveryTimerFromTheTest();
    const world = serveWorld({ notices: rememberingNotices() });
    hydrate(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
    );
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    await chooseTier(editor, MELAMINE_NAME);
    await world.landSave("2");
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);

    await advanceClock(1_000);
    await chooseTier(editor, tierName("hardware.standard"));
    await world.landSave("3");

    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });
});

describe("the design the flow settles on is the one the customer chose", () => {
  it("the save carries exactly the chosen tier and leaves the rest of the settings as they were", async () => {
    const world = serveWorld({ notices: [notice()] });
    const before = kitchenCarrying({
      materialTierId: SWITCHED_OFF_MATERIAL,
      hardwareTierId: "hardware.soft-close",
    });
    hydrate(before);
    const editor = await mountEditor();

    await chooseTier(editor, MELAMINE_NAME);

    const [put] = requestsOf(world, "PUT");
    const sent = (put?.body as { settings?: Record<string, unknown> }).settings;
    expect(sent?.materialTierId).toBe("material.melamine");
    expect(sent?.hardwareTierId).toBe("hardware.soft-close");
    expect(currentDesignId()).toBe(useConfiguratorStore.getState().designId);
  });
});

const say = createTranslator({ locale: "ro", messages: roMessages });
const RACK = { accessoryId: "dishDryingRack" } as const;
const COVER = { accessoryId: "sinkProtectiveCover" } as const;
const RACK_LINE = say("replacementSheet.accessoryRemoved", {
  name: accessoryName("dishDryingRack"),
});
const COVER_LINE = say("replacementSheet.accessoryRemoved", {
  name: accessoryName("sinkProtectiveCover"),
});
const CHANGED_LINE = say("replacementSheet.changedMaterial", {
  name: MELAMINE_NAME,
});

function confirmationLines(editor: Editor): string[] {
  return [
    ...editor.container.querySelectorAll(
      '[data-testid="replacement-confirmation"] span',
    ),
  ].map((line) => line.textContent);
}

/** The first `GET` is held until the test lets it arrive, or never; the later ones answer from `second`. */
async function chooseWithFirstAnswerHeld(second: NoticeAnswer): Promise<{
  readonly editor: Editor;
  readonly world: ReturnType<typeof serveWorld>;
  readonly arrive: (late: Record<string, unknown>) => Promise<void>;
}> {
  let release: (answer: NoticeAnswer) => void = () => undefined;
  const first = new Promise<NoticeAnswer>((resolve) => {
    release = resolve;
  });
  const world = serveWorld({ notices: (nth) => (nth === 0 ? first : second) });
  hydrate(carryingMdf());
  const editor = await mountEditor();
  await chooseTier(editor, MELAMINE_NAME);
  await world.landSave("2");
  return {
    editor,
    world,
    arrive: async (late) => {
      release(late);
      await settle();
    },
  };
}

describe("an accessory the kitchen lost is acknowledged only once it has been said", () => {
  const removedRack = { removedAccessories: [RACK], pricesChanged: true };

  it.each([
    ["a limit", 429],
    ["a fault", 500],
    ["a dropped network", "network-down"],
  ] as const)(
    "when the first read failed with %s, the confirmation says the accessory the second answer names, between the change and the prices sentence, and the marker is written then",
    async (_name, failure) => {
      const { editor, world } = await openAndChoose([
        failure,
        notice(removedRack),
      ]);
      expect(requestsOf(world, "POST")).toEqual([]);

      await world.landSave("2");

      expect(confirmationLines(editor)).toEqual([
        CHANGED_LINE,
        RACK_LINE,
        SENTENCE,
      ]);
      expect(requestsOf(world, "POST")).toHaveLength(1);
    },
  );

  it("when the first answer never arrives, the second answer's accessory is said once, and a late first answer neither repeats it nor draws the notice", async () => {
    const { editor, world, arrive } = await chooseWithFirstAnswerHeld(
      notice(removedRack),
    );
    expect(confirmationLines(editor)).toEqual([
      CHANGED_LINE,
      RACK_LINE,
      SENTENCE,
    ]);

    await arrive(notice(removedRack));

    expect(confirmationLines(editor)).toHaveLength(3);
    expect(byTestId(editor, "price-notice")).toBeNull();
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("an accessory the sheet showed from the first answer is said by the sheet alone", async () => {
    const world = serveWorld({
      notices: [
        notice({ removedAccessories: [RACK] }),
        notice({ removedAccessories: [RACK] }),
      ],
    });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    expect(required(editor, "replacement-info").textContent).toBe(RACK_LINE);
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(confirmationLines(editor)).toEqual([CHANGED_LINE]);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("one the sheet did not show is said, and one it did show is not repeated", async () => {
    const world = serveWorld({
      notices: [
        notice({ removedAccessories: [RACK] }),
        notice({ removedAccessories: [RACK, COVER] }),
      ],
    });
    hydrate(carryingMdf());
    const editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(confirmationLines(editor)).toEqual([CHANGED_LINE, COVER_LINE]);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("an accessory is said but no marker is written while the second answer still owes a replacement", async () => {
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ ...removedRack, replacementsRequired: STILL_OWED }),
    ]);

    await world.landSave("2");

    expect(confirmationLines(editor)).toContain(RACK_LINE);
    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it("a second answer for another pair names nothing and writes nothing", async () => {
    const { editor, world } = await openAndChoose([
      notice(),
      notice({ ...removedRack, current: OTHER_PAIR }),
    ]);

    await world.landSave("2");

    expect(confirmationLines(editor)).toEqual([CHANGED_LINE]);
    expect(requestsOf(world, "POST")).toEqual([]);
  });
});

describe("a first answer that arrives after a failed second read", () => {
  it("takes the held place and keeps the acknowledged state, so the sent kitchen's note returns and the notice does not", async () => {
    const { editor, arrive } = await chooseWithFirstAnswerHeld(500);
    expect(byTestId(editor, "sent-kitchen-note")).toBeNull();

    await arrive(notice({ isSent: true, pricesChanged: true }));

    expect(byTestId(editor, "sent-kitchen-note")).not.toBeNull();
    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("never replaces a notice that is already held: the second answer's sent state stands", async () => {
    const { editor, arrive } = await chooseWithFirstAnswerHeld(
      notice({ isSent: false }),
    );

    await arrive(notice({ isSent: true, pricesChanged: true }));

    expect(byTestId(editor, "sent-kitchen-note")).toBeNull();
    expect(byTestId(editor, "price-notice")).toBeNull();
  });
});
