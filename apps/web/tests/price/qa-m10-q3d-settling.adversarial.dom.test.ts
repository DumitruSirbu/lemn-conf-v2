// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave Q3d, the flow after the last choice (ruling 8, Q3-b, Q3-c). `q3d-replacement-sheet.dom.test.ts`
// holds the save open and lands it; the cases here are the ones it leaves: a save that is refused, a second answer that fails
// in each way the route can fail, a second answer for another pair or version or arm, an unrelated edit queued behind the
// choice, a double press, and a server that remembers the marker so that "reopen shows neither sheet nor C1" is observed.
//
// **The revision half of the save-landed predicate.** `design === savedDesign` and `revision !== revisionAtChoice` are both
// needed (`hasReplacementSaveLanded`). The implementer's DOM tests reach only the design half: no public action makes the
// design equal the saved one with the revision unmoved. The test that does is marked SIMULATED: it calls `applySaved`, the
// coalescer's own hook, with the unmoved revision and the design on screen.
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
import { ro } from "../support/romanian-content";
import {
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
} from "../support/replacement-sheet-world";
import { kitchenCarrying } from "../support/tier-offer-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const SENTENCE = roMessages.customerPriceNotice.alsoUpdated;
const MELAMINE_NAME = ro.bookText(
  SAMPLE_PRICE_ROOT.book.material.tiers[0]?.name ?? "",
  SAMPLE_PRICE_ROOT.book.material.tiers[0]?.nameKey,
);
const OTHER_PAIR = { ...OFF_PAIR, availabilityRevision: "2" };
const OTHER_VERSION = { ...OFF_PAIR, versionId: "another-version" };
const STILL_OWED = [
  { item: { kind: "material", tierId: "material.veneer" }, remaining: [] },
];

const carryingMdf = () =>
  kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL });

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

describe("the save-landed predicate, both halves (Q3-c)", () => {
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
  // FINDING (low): `use-price-notice.ts` `useEffect` -> `setHeld({ designId, read, hasAcknowledged: false })` replaces whatever
  // is held, including the second answer `askAgainAndConfirm` held as already acknowledged. A first `GET` slower than the
  // customer's choice and the save therefore brings C1 back beside the confirmation that already said its sentence, and
  // the acknowledge control then does nothing (`acknowledgedFor` is latched), so the card cannot be dismissed.
  async function endTheFlowBeforeTheFirstAnswerArrives(): Promise<{
    readonly editor: Editor;
    readonly world: ReturnType<typeof serveWorld>;
    readonly arrive: () => Promise<void>;
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
      arrive: async () => {
        releaseFirstAnswer(notice({ pricesChanged: true }));
        await settle();
      },
    };
  }

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

describe("reopening after the flow (Q3-b)", () => {
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
    await chooseTier(
      editor,
      ro.bookText(
        SAMPLE_PRICE_ROOT.book.hardware.tiers[0]?.name ?? "",
        SAMPLE_PRICE_ROOT.book.hardware.tiers[0]?.nameKey,
      ),
    );
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
