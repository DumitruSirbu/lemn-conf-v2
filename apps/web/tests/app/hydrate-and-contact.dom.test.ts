// @vitest-environment happy-dom
//
// The contact page's, the review's and the confirmation's hydrators decide which copy of a design the store shows by one rule
// (`store/newest-copy.ts`: ADR 0148 E3, E3a; 8L criterion 14 (b)). One table runs every state of the store through
// both, and each must leave the store in the state the other leaves it in, with no request of its own. The screens are
// stubbed: what is under test is what the hydrator writes before they read it.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/d/[id]/review/review-screen", () => ({
  ReviewScreen: () => null,
}));
vi.mock("@/contact/contact-screen", () => ({ ContactScreen: () => null }));
vi.mock("@/done/done-screen", () => ({ DoneScreen: () => null }));

import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { HydrateAndDone } from "@/app/d/[id]/done/hydrate-and-done";
import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import {
  useConfiguratorStore,
  type WriteAccess,
} from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "design-in-two-pages" as DesignId;
const OTHER_ID = "another-design" as DesignId;

const PAGE_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "the-page's-copy",
};
const STORE_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "the-store's-copy",
};
const EDITED_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "an-edit-not-yet-saved",
};

interface StoreBefore {
  readonly designId: DesignId;
  readonly revision: string;
  readonly canWrite: WriteAccess;
  readonly hasUnsavedEdit: boolean;
}

interface Row {
  readonly name: string;
  readonly store: StoreBefore;
  readonly pageRevision: string;
  readonly after: {
    readonly design: Design;
    readonly designId: DesignId;
    readonly revision: string;
    readonly canWrite: WriteAccess;
  };
}

const CLEAN_STORE: StoreBefore = {
  designId: DESIGN_ID,
  revision: "3",
  canWrite: true,
  hasUnsavedEdit: false,
};

const ROWS: readonly Row[] = [
  {
    name: "an unsaved edit is kept, whatever revision the page carries",
    store: { ...CLEAN_STORE, hasUnsavedEdit: true },
    pageRevision: "9",
    after: {
      design: EDITED_DESIGN,
      designId: DESIGN_ID,
      revision: "3",
      canWrite: true,
    },
  },
  {
    name: "a clean store at an equal revision is kept",
    store: CLEAN_STORE,
    pageRevision: "3",
    after: {
      design: STORE_DESIGN,
      designId: DESIGN_ID,
      revision: "3",
      canWrite: true,
    },
  },
  {
    name: "a clean store at a greater revision is kept",
    store: CLEAN_STORE,
    pageRevision: "2",
    after: {
      design: STORE_DESIGN,
      designId: DESIGN_ID,
      revision: "3",
      canWrite: true,
    },
  },
  {
    name: "a clean store at a lesser revision is replaced, and write access is carried",
    store: CLEAN_STORE,
    pageRevision: "4",
    after: {
      design: PAGE_DESIGN,
      designId: DESIGN_ID,
      revision: "4",
      canWrite: true,
    },
  },
  {
    name: "a refused write answer is carried through a replacement",
    store: { ...CLEAN_STORE, canWrite: false },
    pageRevision: "4",
    after: {
      design: PAGE_DESIGN,
      designId: DESIGN_ID,
      revision: "4",
      canWrite: false,
    },
  },
  {
    name: "another design's store is replaced and its write answer is not carried",
    store: { ...CLEAN_STORE, designId: OTHER_ID },
    pageRevision: "1",
    after: {
      design: PAGE_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: "checking",
    },
  },
];

const HYDRATORS = [
  {
    name: "the review's",
    render: (revision: string): ReactElement =>
      createElement(HydrateAndReview, {
        design: PAGE_DESIGN,
        designId: DESIGN_ID,
        revision,
      }),
  },
  {
    name: "the contact page's",
    render: (revision: string): ReactElement =>
      createElement(HydrateAndContact, {
        design: PAGE_DESIGN,
        designId: DESIGN_ID,
        revision,
        isSendable: true,
        sentReference: { kind: "none" },
      }),
  },
  {
    name: "the confirmation's",
    render: (revision: string): ReactElement =>
      createElement(HydrateAndDone, {
        design: PAGE_DESIGN,
        designId: DESIGN_ID,
        revision,
        sentReference: { kind: "none" },
      }),
  },
] as const;

const requests: string[] = [];

function holdInTheStore({
  designId,
  revision,
  canWrite,
  hasUnsavedEdit,
}: StoreBefore): void {
  useConfiguratorStore.getState().hydrate({
    design: STORE_DESIGN,
    designId,
    revision,
    canWrite,
  });
  if (hasUnsavedEdit) useConfiguratorStore.setState({ design: EDITED_DESIGN });
}

function renderInTheBrowser(page: ReactElement): void {
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
      children: page,
    }),
  );
}

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("fetch", (url: string) => {
    requests.push(url);
    return Promise.reject(new Error("a hydrator made a request"));
  });
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(HYDRATORS)("$name hydrator", ({ render }) => {
  it.each(ROWS)("$name", ({ store, pageRevision, after }) => {
    holdInTheStore(store);

    renderInTheBrowser(render(pageRevision));

    expect(useConfiguratorStore.getState()).toMatchObject(after);
    expect(requests).toEqual([]);
  });

  it("keeps what it wrote when the same page renders again", () => {
    renderInTheBrowser(render("4"));
    renderInTheBrowser(render("4"));

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: PAGE_DESIGN,
      revision: "4",
    });
    expect(requests).toEqual([]);
  });
});

describe("the three hydrators", () => {
  it.each(ROWS)("leave the store alike: $name", ({ store, pageRevision }) => {
    const [review, ...others] = HYDRATORS.map(({ render }) => {
      useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
      holdInTheStore(store);
      renderInTheBrowser(render(pageRevision));
      const { design, designId, revision, canWrite, savedDesign } =
        useConfiguratorStore.getState();
      return { design, designId, revision, canWrite, savedDesign };
    });

    expect(others).toHaveLength(HYDRATORS.length - 1);
    for (const other of others) expect(other).toEqual(review);
  });
});
