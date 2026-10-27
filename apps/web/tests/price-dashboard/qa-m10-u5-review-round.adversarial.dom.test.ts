// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U5, review round: the outcomes added after the first QA (a candidate the catalogue refuses, a
// version that is gone, a client that rejects), the scope a bulk row is told in, and the sample client's name rule. The
// existing files test each with one case; here every control character, every scope and every call that can reject is taken
// in turn, and what each leaves behind (draft, active version, count, dialog, retry) is read back.
import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftBulk,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishClient } from "@/price-dashboard/publish-client";
import type {
  PublishPageInput,
  VersionDetailInput,
} from "@/price-dashboard/publish-model";
import { PublishScreen } from "@/price-dashboard/publish-page";
import {
  SAMPLE_PUBLISH_PAGE,
  sampleVersionDetail,
} from "@/price-dashboard/publish-sample";
import {
  makeSamplePublishClient,
  makeSampleVersionClient,
  sampleVersionIdOf,
} from "@/price-dashboard/publish-sample-client";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const COPY = roMessages.priceDashboard;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
const ACTIVE = SAMPLE_PUBLISH_PAGE.state.active.book;
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';
const MINUS_SIGN = "−";

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

function numberAt(address: AppliedAddress): number {
  const reading = readEditableFields(ACTIVE).find((row) =>
    isSameAddress(row.address, address),
  );
  if (typeof reading?.value !== "number") throw new Error("not a number");
  return reading.value;
}

const BASE_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
};
const PRICE: DraftChange = {
  address: BASE_ANCHOR,
  value: numberAt(BASE_ANCHOR) + 20_000,
};

function inputWith(
  changes: readonly DraftChange[],
  revision = "1",
): PublishPageInput {
  return {
    ...SAMPLE_PUBLISH_PAGE,
    state: {
      ...SAMPLE_PUBLISH_PAGE.state,
      draft: { draftRevision: revision, changes },
    },
  };
}

type Spied = {
  [Method in keyof PublishClient]: ReturnType<
    typeof vi.fn<PublishClient[Method]>
  >;
};

function spied(
  base: PublishClient,
  replace: Partial<PublishClient> = {},
): Spied {
  return {
    readState: vi.fn<PublishClient["readState"]>(
      replace.readState ?? (() => base.readState()),
    ),
    publish: vi.fn<PublishClient["publish"]>(
      replace.publish ?? ((request) => base.publish(request)),
    ),
    change: vi.fn<PublishClient["change"]>(
      replace.change ?? ((request) => base.change(request)),
    ),
    revert: vi.fn<PublishClient["revert"]>(
      replace.revert ?? ((request) => base.revert(request)),
    ),
    restore: vi.fn<PublishClient["restore"]>(
      replace.restore ?? ((version, request) => base.restore(version, request)),
    ),
  };
}

const spiedPublish = (
  input: PublishPageInput,
  replace: Partial<PublishClient> = {},
): Spied =>
  spied(
    makeSamplePublishClient({ state: input.state, archived: new Map() }),
    replace,
  );

async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(8);
  });
}

async function mountPublish(
  input: PublishPageInput,
  client: PublishClient,
  locale: TestLocale = "ro",
) {
  screen = mountInCatalogue(
    createElement(PublishScreen, {
      locale,
      context: contextOf("administrator", MENU),
      input,
      initialView: "pending",
      client,
    }),
    locale,
  );
  await flushPromises(5);
  return screen.container;
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');
const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};
const nameField = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(container, 'input[type="text"]');
const publishButton = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, '[class*="primary"]');
const rowsIn = (container: ParentNode): HTMLElement[] =>
  allIn(container, '[data-testid="diff-row"]');

async function publishWith(client: Spied, input = inputWith([PRICE])) {
  const container = await mountPublish(input, client);
  typeInto(nameField(container), "Ajustari");
  publishButton(container).focus();
  click(publishButton(container));
  click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
  await settle();
  return container;
}

// ---- a catalogue that refuses the candidate ---------------------------------------------------------------------------

describe("a publish the catalogue refuses", () => {
  it("says so in its own notice, offers no retry, and leaves the draft, the rows, the count and the active version alone", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, {
      publish: () => Promise.resolve({ kind: "candidate-refused" }),
    });

    const container = await publishWith(client, input);

    const notice = requireIn(
      container,
      '[data-testid="publish-notice"]',
    ).textContent;
    expect(notice).toContain(COPY.publish.candidateRefusedTitle);
    expect(notice).toContain(COPY.publish.candidateRefusedBody);
    expect(notice).not.toContain(COPY.publish.failedTitle);
    expect(
      allIn(container, "button").some(
        (button) => button.textContent === COPY.publish.retry,
      ),
    ).toBe(false);
    expect(dialog()).toBeNull();
    expect(rowsIn(container)).toHaveLength(1);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(
      container.querySelector('[data-testid="version-history"]'),
    ).toBeNull();
    expect(client.readState).not.toHaveBeenCalled();
    expect((await client.readState())?.active).toEqual(input.state.active);
    expect((await client.readState())?.draft.changes).toEqual([PRICE]);
  });

  it("does not read the state again, because nothing moved, and lets the person ask again after changing the draft", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, {
      publish: () => Promise.resolve({ kind: "candidate-refused" }),
    });
    const container = await publishWith(client, input);
    const readsBefore = client.readState.mock.calls.length;

    publishButton(container).focus();
    click(publishButton(container));

    expect(client.readState.mock.calls.length).toBe(readsBefore);
    expect(dialog()).not.toBeNull();
  });

  it("is told in Russian with the Russian words", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, {
      publish: () => Promise.resolve({ kind: "candidate-refused" }),
    });
    screen = undefined;
    const container = await mountPublish(input, client, "ru");
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));
    click(
      byWords(
        requireDialog(),
        "button",
        ruMessages.priceDashboard.publish.confirmAction,
      ),
    );
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(ruMessages.priceDashboard.publish.candidateRefusedTitle);
  });
});

// ---- calls that reject ------------------------------------------------------------------------------------------------

describe("a client that rejects", () => {
  const boom = (): Promise<never> => Promise.reject(new Error("network"));

  it("leaves a publish as a failed one: the dialog closes, the notice offers a retry, the draft is the one it was", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, { publish: boom });

    const container = await publishWith(client, input);

    expect(dialog()).toBeNull();
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.publish.failedTitle);
    expect(byWords(container, "button", COPY.publish.retry)).toBeDefined();
    expect(rowsIn(container)).toHaveLength(1);
    expect(publishButton(container).getAttribute("aria-busy")).toBeNull();
  });

  it("leaves a published version's re-read as a read that gave nothing: the screen still lands in the history on the new version", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, { readState: boom });

    const container = await publishWith(client, input);

    const [newest] = allIn(container, '[data-testid="version-row"]');
    expect(newest?.dataset.state).toBe("active");
    expect(newest?.textContent).toContain("Ajustari");
    expect(newest?.textContent).toContain(
      String(input.state.active.sequenceNumber + 1),
    );
  });

  it("leaves an arrow as a save that failed, and the rows stay", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, { revert: boom });
    const container = await mountPublish(input, client);

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.saveFailed);
    expect(rowsIn(container)).toHaveLength(1);
  });

  it("leaves the provisional switch as a save that failed, and the switch where it was", async () => {
    const input = inputWith([]);
    const client = spiedPublish(input, { change: boom });
    const container = await mountPublish(input, client);
    const toggle = requireIn<HTMLButtonElement>(container, '[role="switch"]');
    const before = toggle.getAttribute("aria-checked");

    click(toggle);
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.saveFailed);
    expect(
      requireIn(container, '[role="switch"]').getAttribute("aria-checked"),
    ).toBe(before);
  });

  it("leaves a conflict whose re-read rejects as a conflict notice over the rows it had", async () => {
    const input = inputWith([PRICE]);
    const client = spiedPublish(input, {
      publish: () => Promise.resolve({ kind: "conflict" }),
      readState: boom,
    });

    const container = await publishWith(client, input);

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.changedMeanwhile);
    expect(rowsIn(container)).toHaveLength(1);
  });
});

// ---- the version page: a version that is gone, a restore that rejects -------------------------------------------------

function detailOf(
  sequenceNumber: number,
  changes: readonly DraftChange[] = [],
): VersionDetailInput {
  const found = sampleVersionDetail(sampleVersionIdOf(sequenceNumber));
  if (found === undefined) throw new Error("the sample holds no such version");
  return { ...found, draft: { draftRevision: "1", changes } };
}

async function mountDetail(input: VersionDetailInput, client: PublishClient) {
  screen = mountInCatalogue(
    createElement(VersionDetailScreen, {
      locale: "ro",
      context: contextOf("administrator", MENU),
      input,
      client,
    }),
    "ro",
  );
  await flushPromises(5);
  return screen.container;
}

const restoreButton = (
  container: HTMLElement,
  sequenceNumber: number,
): HTMLButtonElement =>
  byWords<HTMLButtonElement>(
    container,
    "button",
    roCopy("priceDashboard.history.restoreAction", {
      versionId: String(sequenceNumber),
    }),
  );

describe("a restore of a version the store no longer holds", () => {
  it("keeps the dialog open with its own sentence, changes nothing, and can be left with Escape", async () => {
    const input = detailOf(3, [PRICE]);
    const client = spied(makeSampleVersionClient(input), {
      restore: () => Promise.resolve({ kind: "version-not-found" }),
    });
    const container = await mountDetail(input, client);
    restoreButton(container, 3).focus();
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.history.versionNotFound);
    expect(requireDialog().textContent).not.toContain(COPY.errors.saveFailed);
    expect(
      container.querySelector('[data-testid="restore-notice"]'),
    ).toBeNull();
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(client.readState).not.toHaveBeenCalled();
    expect((await client.readState())?.draft.changes).toEqual([PRICE]);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(restoreButton(container, 3));
  });

  it("is still pressable after the refusal, so a second try is a second request", async () => {
    const input = detailOf(3);
    const client = spied(makeSampleVersionClient(input), {
      restore: () => Promise.resolve({ kind: "version-not-found" }),
    });
    const container = await mountDetail(input, client);
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();
    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(client.restore).toHaveBeenCalledTimes(2);
    expect(
      byWords(requireDialog(), "button", COPY.common.addToPending).getAttribute(
        "aria-busy",
      ),
    ).toBeNull();
  });

  it("is asked of the sample client with an id nobody holds, and answers that the version is not found", async () => {
    const input = detailOf(3);
    const client = makeSampleVersionClient(input);

    expect(
      await client.restore("sample-version-00000099", {
        expectedDraftRevision: "1",
      }),
    ).toEqual({
      kind: "version-not-found",
    });
    expect((await client.readState())?.draft.changes).toEqual([]);
  });
});

describe("a restore whose draft moved meanwhile", () => {
  it("adopts the draft that was read again: the count in the frame follows it, and the next try carries its revision", async () => {
    const input = detailOf(3, [PRICE]);
    const fresh = { draftRevision: "2", changes: [] as readonly DraftChange[] };
    const base = makeSampleVersionClient(input);
    const client = spied(base, {
      readState: async () => {
        const state = await base.readState();
        return state === undefined ? undefined : { ...state, draft: fresh };
      },
      restore: (_id, request) =>
        Promise.resolve(
          request.expectedDraftRevision === "2"
            ? {
                kind: "restored",
                draft: { draftRevision: "3", changes: [PRICE] },
                addedChangeCount: 1,
              }
            : { kind: "conflict" },
        ),
    });
    const container = await mountDetail(input, client);
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.changedMeanwhile);
    expect(container.querySelector(PENDING_CHIP)).toBeNull();

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(
      client.restore.mock.calls.map(
        ([, request]) => request.expectedDraftRevision,
      ),
    ).toEqual(["1", "2"]);
    expect(dialog()).toBeNull();
  });

  it("recounts the prices that differ against the active book that was read again", async () => {
    const input = detailOf(3);
    const base = makeSampleVersionClient(input);
    const archived = input.version.book;
    const client = spied(base, {
      readState: async () => {
        const state = await base.readState();
        return state === undefined
          ? undefined
          : { ...state, active: { ...state.active, book: archived } };
      },
      restore: () => Promise.resolve({ kind: "conflict" }),
    });
    const container = await mountDetail(input, client);
    expect(
      restoreButton(container, 3).getAttribute("aria-disabled"),
    ).toBeNull();
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(restoreButton(container, 3).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("leaves a restore that rejects as a save that failed, with the dialog open and the draft unchanged", async () => {
    const input = detailOf(3, [PRICE]);
    const client = spied(makeSampleVersionClient(input), {
      restore: () => Promise.reject(new Error("network")),
    });
    const container = await mountDetail(input, client);
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.saveFailed);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
  });

  it("leaves a conflict whose re-read rejects as a conflict with the draft it had", async () => {
    const input = detailOf(3, [PRICE]);
    const client = spied(makeSampleVersionClient(input), {
      restore: () => Promise.resolve({ kind: "conflict" }),
      readState: () => Promise.reject(new Error("network")),
    });
    const container = await mountDetail(input, client);
    click(restoreButton(container, 3));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.changedMeanwhile);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
  });
});

// ---- the scope a bulk row is told in ----------------------------------------------------------------------------------

function bulkOf(ruleIds: readonly string[], bulk: DraftBulk): DraftChange[] {
  return ruleIds.flatMap((ruleId) =>
    (["anchorMinor", "perStepWiderMinor", "perStepNarrowerMinor"] as const).map(
      (field): DraftChange => {
        const address = { kind: "cabinet", ruleId, field } as const;
        const value =
          Math.round((numberAt(address) * (100 + bulk.percent)) / 100 / 1000) *
          1000;
        return { address, value, groupId: "bulk-x", bulk } as DraftChange;
      },
    ),
  );
}

const SOME_RULES = [
  "cabinet.base-cabinet",
  "cabinet.base-sink",
  "cabinet.wall-cabinet",
];

describe.each(["ro", "ru"] as const)("a bulk row's scope in %s", (locale) => {
  const say =
    locale === "ro"
      ? createTranslatorFor(roMessages)
      : createTranslatorFor(ruMessages as typeof roMessages);

  it.each([-90, -1, 5, 300])(
    "reads 'all the cabinets' for the whole catalogue at %i %% whatever number of cabinets the draft holds",
    async (percent) => {
      const changes = bulkOf(SOME_RULES, { percent, scope: "all" });
      expect(applyChanges(ACTIVE, changes).ok).toBe(true);
      const container = await mountPublish(
        inputWith(changes),
        spiedPublish(inputWith(changes)),
        locale,
      );

      const name = requireIn(
        container,
        '[data-testid="diff-group-name"]',
      ).textContent;
      expect(name).toBe(
        say("priceDashboard.publish.bulkRowName", {
          signedPercent: `${percent < 0 ? MINUS_SIGN : "+"}${String(Math.abs(percent))}`,
          group: say("priceDashboard.publish.bulkScopeAll"),
        }),
      );
      expect(name).not.toMatch(/\d\s*(dulap|шкаф)/);
    },
  );

  it("reads the number of cabinets for a selection, and the group's name for a group", async () => {
    const selection = bulkOf(SOME_RULES, { percent: 5, scope: "selection" });
    const grouped = bulkOf(["cabinet.wall-cabinet", "cabinet.wall-lift"], {
      percent: 5,
      scope: "group",
      groupCode: "wall",
    });

    const first = await mountPublish(
      inputWith(selection),
      spiedPublish(inputWith(selection)),
      locale,
    );
    expect(
      requireIn(first, '[data-testid="diff-group-name"]').textContent,
    ).toBe(
      say("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: say("priceDashboard.cabinets.groupCount", { count: 3 }),
      }),
    );
    screen?.unmount();
    const second = await mountPublish(
      inputWith(grouped),
      spiedPublish(inputWith(grouped)),
      locale,
    );
    expect(
      requireIn(second, '[data-testid="diff-group-name"]').textContent,
    ).toBe(
      say("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: say("priceDashboard.cabinets.groupWall"),
      }),
    );
  });
});

function createTranslatorFor(messages: typeof roMessages) {
  return createTranslator({
    locale: messages === roMessages ? "ro" : "ru",
    messages,
  });
}

// ---- the sample client's name rule ------------------------------------------------------------------------------------

describe("the sample client's rule for a version's name", () => {
  const client = makeSamplePublishClient({
    state: SAMPLE_PUBLISH_PAGE.state,
    archived: new Map(),
  });
  const request = (label: string) => ({
    expectedDraftRevision: SAMPLE_PUBLISH_PAGE.state.draft.draftRevision,
    expectedActiveSequence: SAMPLE_PUBLISH_PAGE.state.active.sequenceNumber,
    expectedAvailabilityRevision:
      SAMPLE_PUBLISH_PAGE.state.active.availability.revision,
    label,
    note: "",
  });
  const CONTROL_CODES = [
    ...Array.from({ length: 0x20 }, (_, code) => code),
    ...Array.from({ length: 0x21 }, (_, offset) => 0x7f + offset),
  ];

  it.each(CONTROL_CODES)(
    "refuses the control character U+%s inside a name",
    async (code) => {
      const outcome = await client.publish(
        request(`a${String.fromCodePoint(code)}b`),
      );

      expect(outcome).toEqual({
        kind: "invalid",
        code: "TEXT_FORBIDDEN_CHARACTER",
      });
    },
  );

  it.each([" ", " ", "\ud800", "\udfff", "a\ud800", "\udc00b"])(
    "refuses the separator or lone surrogate %j",
    async (text) => {
      const outcome = await client.publish(request(`x${text}y`));

      expect(outcome).toEqual({
        kind: "invalid",
        code: "TEXT_FORBIDDEN_CHARACTER",
      });
    },
  );

  it.each([
    "Blum – tarife «noi»",
    "Liste d\u00e9finitive",
    "Версия 5",
    "a b",
    "v2.1 (final)",
    "😀 nou",
  ])("accepts %j, which is a name", async (label) => {
    const fresh = makeSamplePublishClient({
      state: SAMPLE_PUBLISH_PAGE.state,
      archived: new Map(),
    });

    expect((await fresh.publish(request(label))).kind).toBe("published");
  });

  it("judges the length before the characters, so a long name with a control character is told as too long", async () => {
    const outcome = await client.publish(request(`${"x".repeat(80)}\n`));

    expect(outcome).toEqual({ kind: "invalid", code: "TEXT_TOO_LONG" });
  });

  it("refuses without writing: the draft and the active version are what they were", async () => {
    await client.publish(request("a\nb"));

    const state = await client.readState();
    expect(state?.active).toEqual(SAMPLE_PUBLISH_PAGE.state.active);
    expect(state?.draft).toEqual(SAMPLE_PUBLISH_PAGE.state.draft);
  });
});
