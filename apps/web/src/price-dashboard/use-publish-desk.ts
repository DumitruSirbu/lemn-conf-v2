"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  CandidateRefusalWire,
  DashboardDraftWire,
  DashboardStateWire,
  DraftRevertTargetWire,
  PublishedWire,
  PublishTextRefusalCode,
} from "./price-dashboard-wire-contract";
import { orFailed } from "./async-seams";
import { defaultPublishClient } from "./default-publish-client";
import type { PriceDraftClient } from "./price-draft-client";
import {
  type PublishBlock,
  type PublishClient,
  type PublishOutcome,
} from "./publish-client";
import {
  offersOnlyDiscard,
  readPendingDraft,
  type PendingDraftReading,
  type PublishPageInput,
} from "./publish-model";
import { useDiscardDraft, type DiscardControl } from "./use-discard-draft";
import {
  usePriceDraft,
  type FieldWriteResult,
  type PriceDraft,
} from "./use-price-draft";
import { useVersionHistory, type VersionHistory } from "./use-version-history";

// Nothing is shown as published until the client said so; a refusal as `changed-meanwhile` reads the state again first.
// The draft belongs to `usePriceDraft`: every write of it, here or in a row's field, goes through it, one at a time.

const PUBLISH_FAILED: PublishOutcome = { kind: "failed" };

export type PublishView = "pending" | "history";

/** Where a publish stands. Opening a confirmation sends nothing; only `publishing` has a request out. */
export type PublishPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "confirming" }
  | { readonly kind: "confirming-provisional-off"; readonly isChecked: boolean }
  | { readonly kind: "publishing" };

/** What the last write left on the page, drawn at the top of the list. */
export type PublishNotice =
  | {
      readonly kind: "published";
      readonly sequenceNumber: number;
      readonly label: string;
    }
  | { readonly kind: "failed" }
  | {
      readonly kind: "candidate-refused";
      readonly refusals: readonly CandidateRefusalWire[];
    }
  | { readonly kind: "conflict" }
  | { readonly kind: "save-failed" }
  | { readonly kind: "discarded" }
  | { readonly kind: "blocked"; readonly block: PublishBlock };

export interface PublishDesk {
  readonly state: DashboardStateWire;
  readonly history: VersionHistory;
  readonly reading: PendingDraftReading;
  readonly view: PublishView;
  readonly versionName: string;
  readonly nameRefusal: PublishTextRefusalCode | undefined;
  readonly phase: PublishPhase;
  readonly notice: PublishNotice | undefined;
  /** A publish has its request out. */
  readonly isBusy: boolean;
  /** A publish or a write of the draft is out: no other write is sent meanwhile. */
  readonly isLocked: boolean;
  readonly isProvisional: boolean;
  readonly discard: DiscardControl;
  readonly setVersionName: (name: string) => void;
  readonly requestPublish: () => void;
  readonly cancelPublish: () => void;
  readonly confirmProvisionalOff: (isChecked: boolean) => void;
  readonly confirmPublish: () => void;
  readonly revert: (target: DraftRevertTargetWire) => void;
  /** A value typed into a row's "Nou": equal to the active one, it takes the draft's change out. */
  readonly saveAmount: PriceDraft["changeOrRevert"];
  readonly toggleProvisional: () => void;
  readonly dismissNotice: () => void;
}

interface DeskInput {
  readonly input: PublishPageInput;
  readonly initialView: PublishView;
  readonly client: PublishClient | undefined;
}

export function usePublishDesk({
  input,
  initialView,
  client: suppliedClient,
}: DeskInput): PublishDesk {
  const client = useMemo(
    () => suppliedClient ?? defaultPublishClient({ kind: "publish", input }),
    [suppliedClient, input],
  );
  const draftClient = useMemo(() => draftClientOf(client), [client]);
  const priceDraft = usePriceDraft({
    initial: input.state,
    client: draftClient,
  });
  const { state } = priceDraft;
  const history = useVersionHistory({ client, initial: input.versions });
  const [view, setView] = useState<PublishView>(initialView);
  const [versionName, setVersionNameState] = useState("");
  const [nameRefusal, setNameRefusal] = useState<
    PublishTextRefusalCode | undefined
  >(undefined);
  const [phase, setPhase] = useState<PublishPhase>({ kind: "idle" });
  const [notice, setNotice] = useState<PublishNotice | undefined>(undefined);
  const reading = useMemo(
    () =>
      readPendingDraft({
        active: state.active.book,
        changes: state.draft.changes,
        cabinetNames: input.cabinetNames,
      }),
    [state, input.cabinetNames],
  );
  const isBusy = phase.kind === "publishing";
  const {
    adopt,
    refresh,
    change: changeDraft,
    revert: revertDraft,
    changeOrRevert,
    isBusy: isDraftBusy,
  } = priceDraft;

  const readAgain = useCallback(async () => {
    await refresh();
    setNotice({ kind: "conflict" });
  }, [refresh]);

  const discard = useDiscardDraft({
    client,
    draftRevision: state.draft.draftRevision,
    isOffered: offersOnlyDiscard(reading),
    onDiscarded: (draft: DashboardDraftWire) => {
      adopt({ ...state, draft });
      setNotice({ kind: "discarded" });
    },
    onConflict: () => void readAgain(),
  });

  const noticeAfterWrite = useCallback((result: FieldWriteResult) => {
    switch (result.kind) {
      case "saved":
        setNotice(undefined);
        return;
      case "conflict":
        setNotice({ kind: "conflict" });
        return;
      case "refused":
      case "candidate-refused":
      case "failed":
        setNotice({ kind: "save-failed" });
        return;
      case "busy":
      case "unchanged":
        return;
    }
  }, []);

  const revert = useCallback(
    (target: DraftRevertTargetWire) => {
      void revertDraft(target).then(noticeAfterWrite);
    },
    [revertDraft, noticeAfterWrite],
  );

  const saveAmount = useCallback<PriceDraft["changeOrRevert"]>(
    async (wanted, activeValue) => {
      const result = await changeOrRevert(wanted, activeValue);
      if (result.kind === "saved") setNotice(undefined);
      return result;
    },
    [changeOrRevert],
  );

  const toggleProvisional = useCallback(() => {
    const next = !isProvisionalOf(reading, state);
    const address = { kind: "provisional" } as const;
    const write =
      next === state.active.book.amountsProvisional
        ? revertDraft({ kind: "change", address })
        : changeDraft({ address, value: next });
    void write.then(noticeAfterWrite);
  }, [revertDraft, changeDraft, reading, state, noticeAfterWrite]);

  const adoptPublished = useCallback(
    async (published: PublishedWire, sentLabel: string) => {
      const fresh = await refresh();
      const ownVersion =
        fresh?.active.versionId === published.versionId ? fresh : undefined;
      const label = ownVersion?.active.label ?? sentLabel;
      if (fresh === undefined) {
        adopt(locallyPublished(state, reading, { published, label }));
      }
      history.showPublished({
        versionId: published.versionId,
        sequenceNumber: published.sequenceNumber,
        label,
        state: "active",
        publishedAt: ownVersion?.active.publishedAt ?? new Date().toISOString(),
        changeCount: state.draft.changes.length,
      });
      setNotice({
        kind: "published",
        sequenceNumber: published.sequenceNumber,
        label,
      });
      setView("history");
    },
    [refresh, state, reading, adopt, history],
  );

  const settlePublish = useCallback(
    (outcome: PublishOutcome, sentLabel: string) => {
      setPhase({ kind: "idle" });
      switch (outcome.kind) {
        case "published":
          void adoptPublished(outcome.published, sentLabel);
          return;
        case "conflict":
          void readAgain();
          return;
        case "invalid":
          setNameRefusal(outcome.code);
          return;
        case "blocked":
          setNotice({ kind: "blocked", block: outcome.block });
          return;
        case "candidate-refused":
          setNotice({
            kind: "candidate-refused",
            refusals: outcome.refusals,
          });
          return;
        case "failed":
          setNotice({ kind: "failed" });
      }
    },
    [adoptPublished, readAgain],
  );

  const confirmPublish = useCallback(() => {
    setPhase({ kind: "publishing" });
    const sentLabel = versionName.trim();
    void orFailed(
      () =>
        client.publish({
          expectedDraftRevision: state.draft.draftRevision,
          expectedActiveSequence: state.active.sequenceNumber,
          expectedAvailabilityRevision: state.active.availability.revision,
          label: sentLabel,
          note: "",
        }),
      PUBLISH_FAILED,
    ).then((outcome) => {
      settlePublish(outcome, sentLabel);
    });
  }, [client, state, versionName, settlePublish]);

  return {
    state,
    history,
    reading,
    view,
    versionName,
    nameRefusal,
    phase,
    notice,
    isBusy,
    isLocked: isBusy || isDraftBusy,
    isProvisional: isProvisionalOf(reading, state),
    discard,
    setVersionName: (name) => {
      setVersionNameState(name);
      setNameRefusal(undefined);
    },
    requestPublish: () => {
      if (isDraftBusy) return;
      if (versionName.trim() === "") {
        setNameRefusal("TEXT_EMPTY");
        return;
      }
      setPhase(
        reading.kind === "ready" && reading.view.holdsProvisionalOff
          ? { kind: "confirming-provisional-off", isChecked: false }
          : { kind: "confirming" },
      );
    },
    cancelPublish: () => {
      if (!isBusy) setPhase({ kind: "idle" });
    },
    confirmProvisionalOff: (isChecked) => {
      setPhase({ kind: "confirming-provisional-off", isChecked });
    },
    confirmPublish,
    revert,
    saveAmount,
    toggleProvisional,
    dismissNotice: () => {
      setNotice(undefined);
    },
  };
}

/** The draft's own client over the desk's: the desk never makes a bulk change, so that one is never sent. */
function draftClientOf(client: PublishClient): PriceDraftClient {
  return {
    readState: () => client.readState(),
    change: async (request) => draftResultOf(await client.change(request)),
    revert: async (request) => draftResultOf(await client.revert(request)),
    bulk: () => Promise.resolve({ kind: "failed" }),
  };
}

function draftResultOf(
  outcome: Awaited<ReturnType<PublishClient["change"]>>,
): Awaited<ReturnType<PriceDraftClient["change"]>> {
  return outcome.kind === "changed"
    ? { kind: "changed", written: outcome.draft }
    : outcome;
}

function isProvisionalOf(
  reading: PendingDraftReading,
  state: DashboardStateWire,
): boolean {
  return reading.kind === "ready"
    ? reading.view.candidateIsProvisional
    : state.active.book.amountsProvisional;
}

/** The state after a publish whose fresh read was not to be had: the candidate is the active book, the draft is empty. */
function locallyPublished(
  state: DashboardStateWire,
  reading: PendingDraftReading,
  published: { readonly published: PublishedWire; readonly label: string },
): DashboardStateWire {
  return {
    active: {
      ...state.active,
      versionId: published.published.versionId,
      sequenceNumber: published.published.sequenceNumber,
      label: published.label,
      publishedAt: new Date().toISOString(),
      book:
        reading.kind === "ready"
          ? reading.view.candidateBook
          : state.active.book,
    },
    draft: { draftRevision: state.draft.draftRevision, changes: [] },
  };
}
