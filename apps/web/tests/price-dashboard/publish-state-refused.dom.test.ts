// @vitest-environment happy-dom
//
// A write that finds the stored draft unreadable hands the person to the page that gives it up, at the revision the route
// named; one that finds no published version says so. Neither is told as a server that did not answer.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import { sampleVersionDetail } from "@/price-dashboard/publish-sample";
import { sampleVersionIdOf } from "@/price-dashboard/publish-sample-client";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const UNREADABLE = {
  kind: "draft-unreadable",
  draftRevision: "rev-9",
} as const;
const NO_VERSION = { kind: "no-active-version" } as const;
const ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: 400_000,
} as DraftChange;
const UNREADABLE_PAGE = '[data-testid="publish-unreadable"]';
const SERVER_DID_NOT_ANSWER = roCopy("priceDashboard.publish.failedBody");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");

let mounted: MountedDesk | undefined;
let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  screen?.unmount();
  mounted = undefined;
  screen = undefined;
  leaveTheStaffServer();
});

async function mountWith(
  replace: Partial<PublishClient>,
): Promise<MountedDesk> {
  const input = inputWithDraft([ANCHOR], "3");
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
  });
  return mounted;
}

async function askToPublish(container: HTMLElement): Promise<void> {
  typeInto(
    requireIn<HTMLInputElement>(container, 'input[type="text"]'),
    "Ajustari",
  );
  click(requireIn(container, '[class*="primary"]'));
  await settle();
  const dialog = requireIn(document.body, '[role="alertdialog"]');
  click(
    byWords(dialog, "button", roCopy("priceDashboard.publish.confirmAction")),
  );
  await settle();
}

describe("a draft found unreadable while the page was open", () => {
  it.each([
    ["taking a change back", "revert"],
    ["publishing", "publish"],
  ] as const)(
    "is the unreadable-draft page, at the revision the route named, after %s",
    async (_name, method) => {
      const { container, client } = await mountWith({
        [method]: () => Promise.resolve(UNREADABLE),
      });

      if (method === "revert") {
        click(requireIn(container, '[data-testid="diff-revert"]'));
        await settle();
      } else {
        await askToPublish(container);
      }

      expect(requireIn(container, UNREADABLE_PAGE).textContent).toContain(
        roCopy("priceDashboard.publish.unreadableTitle"),
      );
      expect(container.textContent).not.toContain(SERVER_DID_NOT_ANSWER);
      expect(container.textContent).not.toContain(SAVE_FAILED);
      expect(container.querySelector('[data-testid="diff-row"]')).toBeNull();
      expect(client.discardDraft).not.toHaveBeenCalled();
    },
  );

  it("gives the draft up at that revision from the page it hands over to", async () => {
    const { container, client } = await mountWith({
      revert: () => Promise.resolve(UNREADABLE),
      discardDraft: () =>
        Promise.resolve({
          kind: "changed",
          draft: { draftRevision: "10", changes: [] },
        }),
    });
    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();
    const discard = roCopy("priceDashboard.publish.discardAction");
    click(byWords(container, "button", discard));
    await settle();

    click(
      byWords(
        requireIn(document.body, '[role="alertdialog"]'),
        "button",
        discard,
      ),
    );
    await settle();

    expect(client.discardDraft.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "rev-9",
      scope: "all",
    });
  });
});

describe("a re-read that finds the draft unreadable", () => {
  it("hands over to the page that gives it up, as a write does, and not to the save-failed notice", async () => {
    const input = inputWithDraft([ANCHOR], "3");
    const client = {
      ...spiedPublishClient(input, {
        revert: () => Promise.resolve({ kind: "conflict" }),
      }),
      readStateOrRefusal: () => Promise.resolve(UNREADABLE),
    };
    mounted = await mountDesk({ input, client });
    const { container } = mounted;

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(requireIn(container, UNREADABLE_PAGE).isConnected).toBe(true);
    expect(container.textContent).not.toContain(SAVE_FAILED);
  });
});

describe("a publish answered by a body nobody can read", () => {
  it("says it is not known whether a version was published, reads the state again, and does not claim the prices did not change", async () => {
    const { container, client } = await mountWith({
      publish: () => Promise.resolve({ kind: "answer-unreadable" }),
    });

    await askToPublish(container);

    const notice = requireIn(container, '[data-testid="publish-notice"]');
    expect(notice.textContent).toContain(
      roCopy("priceDashboard.publish.answerUnreadableTitle"),
    );
    expect(container.textContent).not.toContain(SERVER_DID_NOT_ANSWER);
    expect(client.readState).toHaveBeenCalled();
  });
});

describe("no published version found while the page was open", () => {
  it.each([
    ["taking a change back", "revert"],
    ["publishing", "publish"],
  ] as const)(
    "is said in its own words after %s, and the page stays",
    async (_name, method) => {
      const { container } = await mountWith({
        [method]: () => Promise.resolve(NO_VERSION),
      });

      if (method === "revert") {
        click(requireIn(container, '[data-testid="diff-revert"]'));
        await settle();
      } else {
        await askToPublish(container);
      }

      const notice = requireIn(container, '[data-testid="publish-notice"]');
      expect(notice.textContent).toContain(
        roCopy("priceDashboard.publish.noActiveVersion"),
      );
      expect(container.textContent).not.toContain(SERVER_DID_NOT_ANSWER);
      expect(
        container.querySelector('[data-testid="diff-row"]'),
      ).not.toBeNull();
    },
  );
});

describe("a restore", () => {
  async function restoreWith(
    replace: Partial<PublishClient>,
  ): Promise<HTMLElement> {
    const input = sampleVersionDetail(sampleVersionIdOf(3), "ro");
    if (input === undefined)
      throw new Error("the sample holds no such version");
    screen = mountInCatalogue(
      createElement(VersionDetailScreen, {
        locale: "ro",
        context: contextOf("administrator", ["kitchens", "publish"]),
        input: { ...input, draft: { draftRevision: "1", changes: [] } },
        client: spiedPublishClient(inputWithDraft([]), replace),
      }),
      "ro",
    );
    await settle();
    click(
      byWords(
        screen.container,
        "button",
        roCopy("priceDashboard.history.restoreAction", { versionId: "3" }),
      ),
    );
    await settle();
    click(
      byWords(
        requireIn(document.body, '[role="alertdialog"]'),
        "button",
        roCopy("priceDashboard.common.addToPending"),
      ),
    );
    await settle();
    return screen.container;
  }

  it("that finds the draft unreadable hands over to the page that gives it up", async () => {
    const container = await restoreWith({
      restore: () => Promise.resolve(UNREADABLE),
    });

    expect(requireIn(container, UNREADABLE_PAGE).isConnected).toBe(true);
    expect(container.textContent).not.toContain(SAVE_FAILED);
  });

  it("that finds no version says so in the dialog", async () => {
    await restoreWith({ restore: () => Promise.resolve(NO_VERSION) });

    const dialog = requireIn(document.body, '[role="alertdialog"]');
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.publish.noActiveVersion"),
    );
    expect(dialog.textContent).not.toContain(SAVE_FAILED);
  });
});
