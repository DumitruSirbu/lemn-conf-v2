// What the publish page's DOM tests of the follow-ups share: the page mounted over a client that records every call, a
// draft built from changes, and a promise a test settles by hand. Nothing here asserts.
import { act, createElement } from "react";
import { vi } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import type { PublishPageInput } from "@/price-dashboard/publish-model";
import { PublishScreen } from "@/price-dashboard/publish-page";
import { makeSamplePublishClient } from "../support/publish-sample-client";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";
import type { PublishView } from "@/price-dashboard/use-publish-desk";

import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { contextOf } from "./staff-frame-harness";

export type SpiedPublishClient = {
  [Method in keyof PublishClient]: ReturnType<
    typeof vi.fn<PublishClient[Method]>
  >;
};

export function inputWithDraft(
  changes: readonly DraftChange[],
  draftRevision = "1",
): PublishPageInput {
  return {
    ...SAMPLE_PUBLISH_PAGE,
    state: {
      ...SAMPLE_PUBLISH_PAGE.state,
      draft: { draftRevision, changes },
    },
  };
}

/** The sample desk with every call recorded, any method replaced by what a test needs it to answer. */
export function spiedPublishClient(
  input: PublishPageInput,
  replace: Partial<PublishClient> = {},
): SpiedPublishClient {
  const base = makeSamplePublishClient({
    state: input.state,
    archived: new Map(),
    history: {
      versions: input.versions.versions,
      pageSize: input.versions.pageSize,
    },
  });
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
    discardDraft: vi.fn<PublishClient["discardDraft"]>(
      replace.discardDraft ?? ((request) => base.discardDraft(request)),
    ),
    readVersionPage: vi.fn<PublishClient["readVersionPage"]>(
      replace.readVersionPage ?? ((page) => base.readVersionPage(page)),
    ),
    restore: vi.fn<PublishClient["restore"]>(
      replace.restore ?? ((version, request) => base.restore(version, request)),
    ),
  };
}

export interface MountedDesk {
  readonly container: HTMLElement;
  readonly client: SpiedPublishClient;
  readonly unmount: () => void;
}

export async function mountDesk(options: {
  readonly input: PublishPageInput;
  readonly client?: SpiedPublishClient;
  readonly view?: PublishView;
}): Promise<MountedDesk> {
  const { input, view = "pending" } = options;
  const client = options.client ?? spiedPublishClient(input);
  const screen: MountedScreen = mountInCatalogue(
    createElement(PublishScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "publish"]),
      input,
      initialView: view,
      client,
    }),
    "ro",
  );
  await flushPromises(5);
  return { container: screen.container, client, unmount: screen.unmount };
}

export async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(5);
  });
}

/** A promise a test settles when it chooses, so an answer can arrive after the person has moved on. */
export function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((settled) => {
    resolve = settled;
  });
  return { promise, resolve };
}

export async function pressKey(
  input: HTMLElement,
  key: "Enter" | "Escape",
): Promise<void> {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
  await settle();
}
