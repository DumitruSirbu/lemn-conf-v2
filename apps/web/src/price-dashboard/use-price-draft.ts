"use client";

import { useCallback, useRef, useState } from "react";

import {
  isSameAddress,
  type AddressOfKind,
  type AppliedAddress,
  type AccessoryCreation,
  type HardwareTierCreation,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftWriteResult,
  type PriceDraftClient,
} from "./price-draft-client";
import type {
  BulkRefusalCode,
  BulkTargetWire,
  DashboardDraftWire,
  DashboardStateWire,
  DraftChangeCreatedWire,
  HardwareRatesWire,
  DraftChangeInputWire,
  DraftChangeRefusalCode,
  DraftRevertTargetWire,
} from "./price-dashboard-wire-contract";
import { useLateAnswerGuard } from "./use-late-answer-guard";

// The draft of prices as a screen holds it. A write names the draft revision the screen last saw, one write is out at a
// time, and a write the server refuses as `changed-meanwhile` leaves the screen with the state read again, so the
// person retypes against what is now there. Nothing is shown as written until the server said so.

/** What a screen is told of a write. The draft it shows has already moved when this is `saved`. */
export type FieldWriteResult =
  | { readonly kind: "saved" }
  | { readonly kind: "refused"; readonly code: DraftChangeRefusalCode }
  | { readonly kind: "candidate-refused" }
  /** Another write landed first. The state has been read again, and nothing was written. */
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" }
  /** Another write is out, so this one was not sent. Not a failure: a screen shows nothing for it. */
  | { readonly kind: "busy" }
  /** The value is the one the draft already holds, so nothing was written. */
  | { readonly kind: "unchanged" };

export type BulkWriteResult =
  | {
      readonly kind: "saved";
      readonly ruleCount: number;
      readonly amountCount: number;
    }
  | { readonly kind: "refused"; readonly code: BulkRefusalCode }
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" }
  /** Another write is out, so this one was not sent. Not a failure: a screen shows nothing for it. */
  | { readonly kind: "busy" };

export type CreateWriteResult =
  /** The class and its rates are in the draft, under the id the server minted. */
  | { readonly kind: "created"; readonly created: ItemRef }
  | { readonly kind: "refused"; readonly code: DraftChangeRefusalCode }
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" }
  /** Another write is out, so this one was not sent. Not a failure: a screen shows nothing for it. */
  | { readonly kind: "busy" };

/** What a hardware class is created from: its Romanian words, and one rate for each mechanism. */
export interface HardwareClassCreation {
  readonly value: HardwareTierCreation;
  readonly rates: HardwareRatesWire;
}

/** What a linked accessory is created from: the cabinet type it follows, its price per unit and its Romanian words. */
export interface AccessoryDraftCreation {
  readonly value: AccessoryCreation;
}

export interface BulkChangeInput {
  readonly target: BulkTargetWire;
  readonly percent: number;
}

/** An amount wanted at the address of a number field. */
export interface WantedAmount {
  readonly address: AppliedAddress;
  readonly value: number;
}

/** A text wanted at the address of a created row's words. */
export interface WantedText {
  readonly address: AddressOfKind<"created-row-text">;
  readonly value: string;
}

/**
 * What a read of the state came to. `superseded` is a read that a later read or an adoption overtook: its state, when it
 * got one, was not adopted. `failed` is a read that got nothing and was not overtaken, so the state is as it was.
 */
export type StateRead =
  | { readonly kind: "read"; readonly state: DashboardStateWire }
  | {
      readonly kind: "superseded";
      readonly state: DashboardStateWire | undefined;
    }
  | { readonly kind: "failed" };

export interface PriceDraft {
  readonly state: DashboardStateWire;
  readonly isBusy: boolean;
  readonly change: (change: DraftChangeInputWire) => Promise<FieldWriteResult>;
  readonly revert: (target: DraftRevertTargetWire) => Promise<FieldWriteResult>;
  /** A value equal to the active one is no change: it takes the draft's change at that address out, or does nothing. */
  readonly changeOrRevert: <Wanted extends WantedAmount | WantedText>(
    wanted: Wanted,
    activeValue: Wanted["value"],
  ) => Promise<FieldWriteResult>;
  readonly bulk: (input: BulkChangeInput) => Promise<BulkWriteResult>;
  readonly createHardwareClass: (
    input: HardwareClassCreation,
  ) => Promise<CreateWriteResult>;
  readonly createAccessory: (
    input: AccessoryDraftCreation,
  ) => Promise<CreateWriteResult>;
  /** Whether the client has any route that takes a creation; where it has none, a screen offers none. */
  readonly canCreateHardwareClass: boolean;
  readonly canCreateAccessory: boolean;
  /** Whether the client takes a change of a created row's words; where it does not, a screen offers no rename. */
  readonly canChangeCreatedText: boolean;
  /** Takes a state made elsewhere (a publish, a discard) as the one the next write names the revision of. */
  readonly adopt: (state: DashboardStateWire) => void;
  /**
   * Reads the state again and adopts it unless a later read or adoption began meanwhile. The draft takes no write while
   * it is out, so a write cannot land beside it and drop the revisions it carries.
   */
  readonly refresh: () => Promise<StateRead>;
}

interface DraftInput {
  readonly initial: DashboardStateWire;
  readonly client?: PriceDraftClient | undefined;
}

export function usePriceDraft({
  initial,
  client = FETCHING_PRICE_DRAFT_CLIENT,
}: DraftInput): PriceDraft {
  const [state, setState] = useState(initial);
  const [isBusy, setIsBusy] = useState(false);
  const stateRef = useRef(state);
  const holdsRef = useRef(0);

  const { moveOn, begin } = useLateAnswerGuard();

  const adoptDraft = useCallback(
    (draft: DashboardDraftWire) => {
      moveOn();
      stateRef.current = { ...stateRef.current, draft };
      setState(stateRef.current);
    },
    [moveOn],
  );

  const adopt = useCallback(
    (adopted: DashboardStateWire) => {
      moveOn();
      stateRef.current = adopted;
      setState(adopted);
    },
    [moveOn],
  );

  const readAgain = useCallback(async (): Promise<StateRead> => {
    moveOn();
    const isSuperseded = begin();
    const fresh = await client.readState().catch(() => undefined);
    if (isSuperseded()) return { kind: "superseded", state: fresh };
    if (fresh === undefined) return { kind: "failed" };
    stateRef.current = fresh;
    setState(fresh);
    return { kind: "read", state: fresh };
  }, [client, moveOn, begin]);

  /** Holds the draft against other writes while `send` is out. Holds stack: the last one to end frees it. */
  const holdingTheDraft = useCallback(
    async <Result>(send: () => Promise<Result>): Promise<Result> => {
      holdsRef.current += 1;
      setIsBusy(true);
      try {
        return await send();
      } finally {
        holdsRef.current -= 1;
        if (holdsRef.current === 0) setIsBusy(false);
      }
    },
    [],
  );

  /** One write at a time: a second press while one is out is not sent. */
  const exclusively = useCallback(
    async <Result extends { readonly kind: string }>(
      send: () => Promise<Result>,
      busy: Result,
    ): Promise<Result> => (holdsRef.current > 0 ? busy : holdingTheDraft(send)),
    [holdingTheDraft],
  );

  const refresh = useCallback(
    () => holdingTheDraft(readAgain),
    [readAgain, holdingTheDraft],
  );

  const settle = useCallback(
    async <Code extends string, Written>(
      outcome: DraftWriteResult<Code, Written>,
      draftOf: (written: Written) => DashboardDraftWire,
    ) => {
      if (outcome.kind === "changed") adoptDraft(draftOf(outcome.written));
      else if (outcome.kind === "conflict") await readAgain();
      else if (outcome.kind === "session-ended") {
        raiseStaffSessionExpired({ keepsTypedText: true });
      }
    },
    [adoptDraft, readAgain],
  );

  const change = useCallback(
    (input: DraftChangeInputWire) =>
      exclusively<FieldWriteResult>(async () => {
        const outcome = await sendOrFail(() =>
          client.change({
            expectedDraftRevision: stateRef.current.draft.draftRevision,
            change: input,
          }),
        );
        await settle(outcome, (written) => written);
        return fieldResultOf(outcome);
      }, BUSY),
    [client, exclusively, settle],
  );

  const revert = useCallback(
    (target: DraftRevertTargetWire) =>
      exclusively<FieldWriteResult>(async () => {
        const outcome = await sendOrFail(() =>
          client.revert({
            expectedDraftRevision: stateRef.current.draft.draftRevision,
            target,
          }),
        );
        await settle(outcome, (written) => written);
        return fieldResultOf(outcome);
      }, BUSY),
    [client, exclusively, settle],
  );

  const changeOrRevert = useCallback(
    (
      wanted: WantedAmount | WantedText,
      activeValue: number | string,
    ): Promise<FieldWriteResult> => {
      // A field's address with a value of its kind is a change of that field: the route judges which address takes one.
      if (wanted.value !== activeValue) {
        return change({
          address: wanted.address,
          value: wanted.value,
        } as DraftChangeInputWire);
      }
      const holdsChange = stateRef.current.draft.changes.some((held) =>
        isSameAddress(held.address, wanted.address),
      );
      return holdsChange
        ? revert({ kind: "change", address: wanted.address })
        : Promise.resolve(UNCHANGED);
    },
    [change, revert],
  );

  const bulk = useCallback(
    (input: BulkChangeInput) =>
      exclusively<BulkWriteResult>(async () => {
        const outcome = await sendOrFail(() =>
          client.bulk({
            expectedDraftRevision: stateRef.current.draft.draftRevision,
            ...input,
          }),
        );
        await settle(outcome, (written) => written.draft);
        return bulkResultOf(outcome);
      }, BUSY),
    [client, exclusively, settle],
  );

  /** Sends a creation through the client's route for it, which is absent where the client has none. */
  const createRow = useCallback(
    <Input extends object>(
      create:
        | ((
            request: { readonly expectedDraftRevision: string } & Input,
          ) => Promise<
            DraftWriteResult<DraftChangeRefusalCode, DraftChangeCreatedWire>
          >)
        | undefined,
      input: Input,
    ) =>
      exclusively<CreateWriteResult>(async () => {
        if (create === undefined) return FAILED;
        const outcome = await sendOrFail(() =>
          create({
            expectedDraftRevision: stateRef.current.draft.draftRevision,
            ...input,
          }),
        );
        await settle(outcome, (written) => written.draft);
        return createResultOf(outcome);
      }, BUSY),
    [exclusively, settle],
  );

  const createHardwareClass = useCallback(
    (input: HardwareClassCreation) =>
      createRow(client.createHardwareClass, input),
    [client, createRow],
  );

  const createAccessory = useCallback(
    (input: AccessoryDraftCreation) => createRow(client.createAccessory, input),
    [client, createRow],
  );

  return {
    state,
    isBusy,
    change,
    revert,
    changeOrRevert,
    bulk,
    createHardwareClass,
    createAccessory,
    canCreateHardwareClass: client.createHardwareClass !== undefined,
    canCreateAccessory: client.createAccessory !== undefined,
    canChangeCreatedText: client.acceptsCreatedRowText === true,
    adopt,
    refresh,
  };
}

const FAILED = { kind: "failed" } as const;
const BUSY = { kind: "busy" } as const;
const UNCHANGED = { kind: "unchanged" } as const;

/** A client that throws is a write that failed: the screen is never left waiting on one. */
async function sendOrFail<Code extends string, Written>(
  send: () => Promise<DraftWriteResult<Code, Written>>,
): Promise<DraftWriteResult<Code, Written>> {
  try {
    return await send();
  } catch {
    return FAILED;
  }
}

function fieldResultOf(
  outcome: DraftWriteResult<DraftChangeRefusalCode, DashboardDraftWire>,
): FieldWriteResult {
  switch (outcome.kind) {
    case "changed":
      return { kind: "saved" };
    case "refused":
    case "candidate-refused":
    case "conflict":
      return outcome;
    case "session-ended":
    case "failed":
      return FAILED;
  }
}

function bulkResultOf(
  outcome: DraftWriteResult<
    BulkRefusalCode,
    { readonly draft: DashboardDraftWire } & {
      readonly ruleCount: number;
      readonly amountCount: number;
    }
  >,
): BulkWriteResult {
  switch (outcome.kind) {
    case "changed":
      return {
        kind: "saved",
        ruleCount: outcome.written.ruleCount,
        amountCount: outcome.written.amountCount,
      };
    case "refused":
    case "candidate-refused":
    case "conflict":
      return outcome;
    case "session-ended":
    case "failed":
      return FAILED;
  }
}

function createResultOf(
  outcome: DraftWriteResult<
    DraftChangeRefusalCode,
    { readonly created: ItemRef }
  >,
): CreateWriteResult {
  switch (outcome.kind) {
    case "changed":
      return { kind: "created", created: outcome.written.created };
    case "refused":
    case "candidate-refused":
    case "conflict":
      return outcome;
    case "session-ended":
    case "failed":
      return FAILED;
  }
}
