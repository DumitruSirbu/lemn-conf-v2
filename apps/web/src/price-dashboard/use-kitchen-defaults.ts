"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { Finish } from "@lemnaria/configurator-domain";

import {
  defaultKitchenDefaultsClient,
  orFallback,
  type DefaultsSaveOutcome,
  type KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import {
  DEFAULTS_ROW_ORDER,
  membersHoldingItem,
  membersOfIssues,
  modifiedMembers,
  rebasedOnto,
  saveRequestOf,
  unofferedMembers,
  withMaterial,
  type KitchenDefaultsPageInput,
} from "./kitchen-defaults-model";
import type {
  KitchenDefaultsMember,
  KitchenDefaultsWire,
} from "./price-dashboard-wire-contract";

// The defaults screen's state: the facts the page was given, the values being edited, and what the last save said. The
// rules are the model's; this holds only what changes between renders. A save writes the whole object with the revisions
// the page last read, and a refusal changes nothing the person typed.

/** What stands at the top of the page, above the rows. */
export type DefaultsNotice =
  | "applies"
  | "saved"
  | "changed-meanwhile"
  | "save-failed";

type RowChoice = Exclude<KitchenDefaultsMember, "materialTierId">;

type FocusTarget =
  | { readonly kind: "notice" }
  | { readonly kind: "title" }
  | { readonly kind: "row"; readonly member: KitchenDefaultsMember };

interface Landing {
  readonly notice: DefaultsNotice;
  readonly focus: FocusTarget;
}

const SAVE_FAILED: Landing = {
  notice: "save-failed",
  focus: { kind: "notice" },
};

export interface KitchenDefaultsDesk {
  readonly input: KitchenDefaultsPageInput;
  readonly draft: KitchenDefaultsWire;
  readonly notice: DefaultsNotice;
  /** The colour the last change of material took away, until the person changes the colour or the material again. */
  readonly colourResetFrom: Finish | null;
  readonly modified: ReadonlySet<KitchenDefaultsMember>;
  /** Rows whose chosen value is not on offer, or that the last save refused. */
  readonly unoffered: ReadonlySet<KitchenDefaultsMember>;
  readonly isSaving: boolean;
  readonly canSave: boolean;
  readonly canCancel: boolean;
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly chooseMaterial: (tierId: string) => void;
  readonly choose: <Member extends RowChoice>(
    member: Member,
    value: KitchenDefaultsWire[Member],
  ) => void;
  readonly save: () => void;
  readonly cancel: () => void;
}

export function useKitchenDefaults({
  initialInput,
  client: suppliedClient,
}: {
  readonly initialInput: KitchenDefaultsPageInput;
  readonly client: KitchenDefaultsClient | undefined;
}): KitchenDefaultsDesk {
  const client = useMemo(
    () => suppliedClient ?? defaultKitchenDefaultsClient(initialInput),
    [suppliedClient, initialInput],
  );
  const [input, setInput] = useState(initialInput);
  const [draft, setDraft] = useState(initialInput.state.defaults);
  const [notice, setNotice] = useState<DefaultsNotice>("applies");
  const [colourResetFrom, setColourResetFrom] = useState<Finish | null>(null);
  const [refused, setRefused] = useState<ReadonlySet<KitchenDefaultsMember>>(
    new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestFocus = useFocusRequests({ formRef, noticeRef, titleRef });

  const saved = input.state.defaults;
  const modified = useMemo(() => modifiedMembers(saved, draft), [saved, draft]);
  const unoffered = useMemo(
    () => new Set([...unofferedMembers(input, draft), ...refused]),
    [input, draft, refused],
  );

  const land = useCallback(
    (landing: Landing) => {
      setNotice(landing.notice);
      requestFocus(landing.focus);
    },
    [requestFocus],
  );

  const chooseMaterial = useCallback(
    (tierId: string) => {
      const change = withMaterial(draft, tierId);
      setDraft(change.draft);
      setNotice("applies");
      setColourResetFrom(change.resetFrom);
      setRefused(without(refused, ["materialTierId", "finish"]));
    },
    [draft, refused],
  );

  const choose = useCallback(
    <Member extends RowChoice>(
      member: Member,
      value: KitchenDefaultsWire[Member],
    ) => {
      setDraft({ ...draft, [member]: value });
      setNotice("applies");
      if (member === "finish") setColourResetFrom(null);
      setRefused(without(refused, [member]));
    },
    [draft, refused],
  );

  const save = useCallback(() => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    const request = saveRequestOf(input.state, draft);
    void orFallback<DefaultsSaveOutcome>(() => client.save(request), {
      kind: "failed",
    })
      .then((outcome) =>
        settleSave(outcome, {
          draft,
          readSaved: input.state.defaults,
          client,
          setInput,
          setDraft,
          setRefused,
          land,
        }),
      )
      .finally(() => {
        isSavingRef.current = false;
        setIsSaving(false);
      });
  }, [client, draft, input.state, land]);

  const cancel = useCallback(() => {
    setDraft(saved);
    setColourResetFrom(null);
    setRefused(new Set());
    land({ notice: "applies", focus: { kind: "title" } });
  }, [saved, land]);

  const isDirty = modified.size > 0;
  return {
    input,
    draft,
    notice,
    colourResetFrom,
    modified,
    unoffered,
    isSaving,
    canSave: isDirty && unoffered.size === 0 && !isSaving,
    canCancel: isDirty,
    formRef,
    noticeRef,
    titleRef,
    chooseMaterial,
    choose,
    save,
    cancel,
  };
}

/** What a save's answer changes on the page. A refusal writes nothing, so what the person changed stays. */
interface SaveEffects {
  readonly draft: KitchenDefaultsWire;
  /** The saved values the draft was edited from. */
  readonly readSaved: KitchenDefaultsWire;
  readonly client: KitchenDefaultsClient;
  readonly setDraft: (draft: KitchenDefaultsWire) => void;
  readonly setInput: (
    update: (input: KitchenDefaultsPageInput) => KitchenDefaultsPageInput,
  ) => void;
  readonly setRefused: (members: ReadonlySet<KitchenDefaultsMember>) => void;
  readonly land: (landing: Landing) => void;
}

async function settleSave(
  outcome: DefaultsSaveOutcome,
  effects: SaveEffects,
): Promise<void> {
  switch (outcome.kind) {
    case "saved":
      adoptSaved(outcome.saved, effects);
      return;
    case "invalid":
      refuseRows(membersOfIssues(outcome.issues), effects);
      return;
    case "item-unavailable":
      // Focus goes to the row after the options are read again: the refused option may be gone by then.
      await adoptFreshFacts(effects);
      refuseRows(membersHoldingItem(effects.draft, outcome.item), effects);
      return;
    case "conflict":
      await adoptFreshFactsAfterConflict(effects);
      return;
    case "failed":
      effects.land(SAVE_FAILED);
      return;
  }
}

function adoptSaved(
  saved: { readonly revision: string; readonly availabilityRevision: string },
  { draft, setInput, setRefused, land }: SaveEffects,
): void {
  setInput((input) => ({
    ...input,
    state: { ...saved, saved: true, defaults: draft },
  }));
  setRefused(new Set());
  land({ notice: "saved", focus: { kind: "notice" } });
}

function refuseRows(
  members: readonly KitchenDefaultsMember[],
  { setRefused, land }: SaveEffects,
): void {
  const first = DEFAULTS_ROW_ORDER.find((member) => members.includes(member));
  if (first === undefined) {
    land(SAVE_FAILED);
    return;
  }
  setRefused(new Set(members));
  land({ notice: "applies", focus: { kind: "row", member: first } });
}

/**
 * The facts as they are now, so what is offered, and the revisions a save expects, are what it will be judged against. What
 * the person changed stays; every other row takes the value another member saved meanwhile. False when they cannot be read.
 */
async function adoptFreshFacts(effects: SaveEffects): Promise<boolean> {
  const fresh = await orFallback(() => effects.client.readAgain(), undefined);
  if (fresh === undefined) return false;
  effects.setInput(() => fresh);
  effects.setDraft(
    rebasedOnto(fresh.state.defaults, effects.readSaved, effects.draft),
  );
  return true;
}

async function adoptFreshFactsAfterConflict(
  effects: SaveEffects,
): Promise<void> {
  const isRead = await adoptFreshFacts(effects);
  effects.land(
    isRead
      ? { notice: "changed-meanwhile", focus: { kind: "notice" } }
      : SAVE_FAILED,
  );
}

function without(
  members: ReadonlySet<KitchenDefaultsMember>,
  removed: readonly KitchenDefaultsMember[],
): ReadonlySet<KitchenDefaultsMember> {
  return new Set([...members].filter((member) => !removed.includes(member)));
}

interface FocusRequest {
  readonly ticket: number;
  readonly target: FocusTarget;
}

/** Moves focus when a request is made, once the screen it names has been drawn. */
function useFocusRequests(refs: {
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
}): (target: FocusTarget) => void {
  const { formRef, noticeRef, titleRef } = refs;
  const [request, setRequest] = useState<FocusRequest | undefined>();
  useEffect(() => {
    if (request === undefined) return;
    const { target } = request;
    if (target.kind === "notice") noticeRef.current?.focus();
    else if (target.kind === "title") titleRef.current?.focus();
    else firstControlOf(formRef.current, target.member)?.focus();
  }, [request, formRef, noticeRef, titleRef]);
  return useCallback((target: FocusTarget) => {
    setRequest((last) => ({ ticket: (last?.ticket ?? 0) + 1, target }));
  }, []);
}

function firstControlOf(
  form: HTMLFormElement | null,
  member: KitchenDefaultsMember,
): HTMLElement | null | undefined {
  const row = form?.querySelector<HTMLElement>(`[data-member="${member}"]`);
  return (
    row?.querySelector<HTMLElement>("input:checked") ??
    row?.querySelector<HTMLElement>("input")
  );
}
