"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  DashboardStateWire,
  DraftRevertTargetWire,
  PriceVersionSummaryWire,
  PublishedWire,
  PublishTextRefusalCode,
} from "./price-dashboard-wire-contract";
import {
  defaultPublishClient,
  type DraftWriteOutcome,
  type PublishBlock,
  type PublishClient,
  type PublishOutcome,
} from "./publish-client";
import {
  readPendingDraft,
  type PendingDraftReading,
  type PublishPageInput,
} from "./publish-model";

// The publish page's state: the draft and the active version as the screen last read them, the version's name, where the
// publish stands, and what the last write said. A write is sent with the revision the screen displayed; a refusal as
// `changed-meanwhile` reads the state again before saying so, and nothing is shown as published until the server said it.

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
  | { readonly kind: "conflict" }
  | { readonly kind: "save-failed" }
  | { readonly kind: "blocked"; readonly block: PublishBlock };

export interface PublishDesk {
  readonly state: DashboardStateWire;
  readonly versions: readonly PriceVersionSummaryWire[];
  readonly reading: PendingDraftReading;
  readonly view: PublishView;
  readonly versionName: string;
  readonly nameRefusal: PublishTextRefusalCode | undefined;
  readonly phase: PublishPhase;
  readonly notice: PublishNotice | undefined;
  readonly isBusy: boolean;
  readonly isProvisional: boolean;
  readonly setVersionName: (name: string) => void;
  readonly requestPublish: () => void;
  readonly cancelPublish: () => void;
  readonly confirmProvisionalOff: (isChecked: boolean) => void;
  readonly confirmPublish: () => void;
  readonly revert: (target: DraftRevertTargetWire) => void;
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
    () =>
      suppliedClient ??
      defaultPublishClient({ state: input.state, archived: new Map() }),
    [suppliedClient, input],
  );
  const [state, setState] = useState(input.state);
  const [versions, setVersions] = useState(input.versions.versions);
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

  const readAgain = useCallback(async () => {
    const fresh = await client.readState();
    if (fresh !== undefined) setState(fresh);
    setNotice({ kind: "conflict" });
  }, [client]);

  const applyDraftWrite = useCallback(
    (outcome: DraftWriteOutcome) => {
      if (outcome.kind === "changed") {
        setState((current) => ({ ...current, draft: outcome.draft }));
        setNotice(undefined);
      } else if (outcome.kind === "conflict") void readAgain();
      else setNotice({ kind: "save-failed" });
    },
    [readAgain],
  );

  const revert = useCallback(
    (target: DraftRevertTargetWire) => {
      void client
        .revert({
          expectedDraftRevision: state.draft.draftRevision,
          target,
        })
        .then(applyDraftWrite);
    },
    [client, state.draft.draftRevision, applyDraftWrite],
  );

  const toggleProvisional = useCallback(() => {
    const next = !isProvisionalOf(reading, state);
    const isActiveValue = next === state.active.book.amountsProvisional;
    const request = { expectedDraftRevision: state.draft.draftRevision };
    const write = isActiveValue
      ? client.revert({
          ...request,
          target: { kind: "change", address: { kind: "provisional" } },
        })
      : client.change({
          ...request,
          change: { address: { kind: "provisional" }, value: next },
        });
    void write.then(applyDraftWrite);
  }, [client, reading, state, applyDraftWrite]);

  const adoptPublished = useCallback(
    async (published: PublishedWire) => {
      const fresh = await client.readState();
      const adopted =
        fresh ??
        locallyPublished(state, reading, {
          published,
          label: versionName.trim(),
        });
      setState(adopted);
      setVersions((held) => [
        summaryOfActive(adopted, state.draft.changes.length),
        ...held.map((version) => ({ ...version, state: "archived" as const })),
      ]);
      setNotice({
        kind: "published",
        sequenceNumber: published.sequenceNumber,
        label: adopted.active.label,
      });
      setView("history");
    },
    [client, state, reading, versionName],
  );

  const settlePublish = useCallback(
    (outcome: PublishOutcome) => {
      setPhase({ kind: "idle" });
      switch (outcome.kind) {
        case "published":
          void adoptPublished(outcome.published);
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
        case "failed":
          setNotice({ kind: "failed" });
      }
    },
    [adoptPublished, readAgain],
  );

  const confirmPublish = useCallback(() => {
    setPhase({ kind: "publishing" });
    void client
      .publish({
        expectedDraftRevision: state.draft.draftRevision,
        expectedActiveSequence: state.active.sequenceNumber,
        expectedAvailabilityRevision: state.active.availability.revision,
        label: versionName.trim(),
        note: "",
      })
      .then(settlePublish);
  }, [client, state, versionName, settlePublish]);

  return {
    state,
    versions,
    reading,
    view,
    versionName,
    nameRefusal,
    phase,
    notice,
    isBusy,
    isProvisional: isProvisionalOf(reading, state),
    setVersionName: (name) => {
      setVersionNameState(name);
      setNameRefusal(undefined);
    },
    requestPublish: () => {
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
    toggleProvisional,
    dismissNotice: () => {
      setNotice(undefined);
    },
  };
}

function isProvisionalOf(
  reading: PendingDraftReading,
  state: DashboardStateWire,
): boolean {
  return reading.kind === "ready"
    ? reading.view.candidateIsProvisional
    : state.active.book.amountsProvisional;
}

function summaryOfActive(
  adopted: DashboardStateWire,
  changeCount: number,
): PriceVersionSummaryWire {
  return {
    versionId: adopted.active.versionId,
    sequenceNumber: adopted.active.sequenceNumber,
    label: adopted.active.label,
    state: "active",
    publishedAt: adopted.active.publishedAt,
    changeCount,
  };
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
