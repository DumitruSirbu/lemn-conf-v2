"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  sameFinish,
  type Finish,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { orFailed } from "./async-seams";
import { defaultKitchenDefaultsClient } from "./default-kitchen-defaults-client";
import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
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
  const [notice, setNotice] = useState<DefaultsNotice>("applies");
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestFocus = useFocusRequests({ formRef, noticeRef, titleRef });
  const land = useCallback(
    (landing: Landing) => {
      setNotice(landing.notice);
      requestFocus(landing.focus);
    },
    [requestFocus],
  );
  const editing = useDraftEditing(initialInput, () => {
    setNotice("applies");
  });
  const { isSaving, save } = useSave({ client, editing, land });
  const cancel = useCallback(() => {
    editing.discard();
    land({ notice: "applies", focus: { kind: "title" } });
  }, [editing, land]);

  const isDirty = editing.modified.size > 0;
  return {
    input: editing.input,
    draft: editing.draft,
    notice,
    colourResetFrom: editing.colourResetFrom,
    modified: editing.modified,
    unoffered: editing.unoffered,
    isSaving,
    canSave: isDirty && editing.unoffered.size === 0 && !isSaving,
    canCancel: isDirty,
    formRef,
    noticeRef,
    titleRef,
    chooseMaterial: editing.chooseMaterial,
    choose: editing.choose,
    save,
    cancel,
  };
}

/** The values being edited, against the saved ones the person started from. */
interface DraftEditing {
  readonly input: KitchenDefaultsPageInput;
  readonly draft: KitchenDefaultsWire;
  readonly colourResetFrom: Finish | null;
  readonly modified: ReadonlySet<KitchenDefaultsMember>;
  readonly unoffered: ReadonlySet<KitchenDefaultsMember>;
  /** What the page holds now, which is not the render a save was started in. */
  readonly currentDraft: () => KitchenDefaultsWire;
  readonly chooseMaterial: (tierId: string) => void;
  readonly choose: KitchenDefaultsDesk["choose"];
  /** Back to the saved values. */
  readonly discard: () => void;
  /** The draft became the saved values. A reset the person made since, which the save did not write, keeps its note. */
  readonly adoptSaved: (
    saved: SavedRevisions,
    sent: KitchenDefaultsWire,
  ) => void;
  /**
   * The facts read again: what is offered and the revisions change, what the person changed from what they started with
   * stays, and every other row takes the value another member saved meanwhile. A colour the material does not offer is
   * reset as a change of material would. The draft that results.
   */
  readonly adoptFresh: (
    fresh: KitchenDefaultsPageInput,
    savedAtEditStart: KitchenDefaultsWire,
  ) => KitchenDefaultsWire;
  readonly refuse: (members: readonly KitchenDefaultsMember[]) => void;
}

interface SavedRevisions {
  readonly revision: string;
  readonly availabilityRevision: string;
}

function useDraftEditing(
  initialInput: KitchenDefaultsPageInput,
  onEdit: () => void,
): DraftEditing {
  const [input, setInput] = useState(initialInput);
  const [draft, setDraft] = useState(initialInput.state.defaults);
  const [colourResetFrom, setColourResetFrom] = useState<Finish | null>(null);
  const [refused, setRefused] = useState<ReadonlySet<KitchenDefaultsMember>>(
    new Set(),
  );
  const latestDraftRef = useRef(draft);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  const saved = input.state.defaults;
  const modified = useMemo(() => modifiedMembers(saved, draft), [saved, draft]);
  const unoffered = useMemo(
    () => new Set([...unofferedMembers(input, draft), ...refused]),
    [input, draft, refused],
  );

  const chooseMaterial = useCallback(
    (tierId: string) => {
      const change = withMaterial(draft, tierId, input.disabled);
      setDraft(change.draft);
      setColourResetFrom(change.resetFrom);
      setRefused(without(refused, ["materialTierId", "finish"]));
      onEdit();
    },
    [draft, input.disabled, refused, onEdit],
  );

  const choose = useCallback(
    <Member extends RowChoice>(
      member: Member,
      value: KitchenDefaultsWire[Member],
    ) => {
      setDraft({ ...draft, [member]: value });
      if (member === "finish") setColourResetFrom(null);
      setRefused(without(refused, [member]));
      onEdit();
    },
    [draft, refused, onEdit],
  );

  const discard = useCallback(() => {
    setDraft(saved);
    setColourResetFrom(null);
    setRefused(new Set());
  }, [saved]);

  const adoptSaved = useCallback(
    (revisions: SavedRevisions, sent: KitchenDefaultsWire) => {
      setInput((last) => ({
        ...last,
        state: { ...revisions, saved: true, defaults: sent },
      }));
      const current = latestDraftRef.current;
      const isResetSaved =
        current.materialTierId === sent.materialTierId &&
        sameFinish(current.finish, sent.finish);
      if (isResetSaved) setColourResetFrom(null);
      setRefused(new Set());
    },
    [],
  );

  const adoptFresh = useCallback(
    (
      fresh: KitchenDefaultsPageInput,
      savedAtEditStart: KitchenDefaultsWire,
    ) => {
      const rebased = rebasedOnto(
        fresh.state.defaults,
        savedAtEditStart,
        latestDraftRef.current,
      );
      const settled = withMaterial(
        rebased,
        rebased.materialTierId,
        fresh.disabled,
      );
      setInput(fresh);
      setDraft(settled.draft);
      if (settled.resetFrom !== null) setColourResetFrom(settled.resetFrom);
      return settled.draft;
    },
    [],
  );

  const refuse = useCallback((members: readonly KitchenDefaultsMember[]) => {
    setRefused(new Set(members));
  }, []);

  return {
    input,
    draft,
    colourResetFrom,
    modified,
    unoffered,
    currentDraft: () => latestDraftRef.current,
    chooseMaterial,
    choose,
    discard,
    adoptSaved,
    adoptFresh,
    refuse,
  };
}

/** One save at a time, and what each answer does to the page. */
function useSave({
  client,
  editing,
  land,
}: {
  readonly client: KitchenDefaultsClient;
  readonly editing: DraftEditing;
  readonly land: (landing: Landing) => void;
}): { readonly isSaving: boolean; readonly save: () => void } {
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const { input, draft } = editing;
  const save = useCallback(() => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    const request = saveRequestOf(input.state, draft);
    void orFailed<DefaultsSaveOutcome>(() => client.save(request), {
      kind: "failed",
    })
      .then((outcome) =>
        settleSave(outcome, {
          sent: draft,
          savedAtEditStart: input.state.defaults,
          client,
          editing,
          land,
        }),
      )
      .finally(() => {
        isSavingRef.current = false;
        setIsSaving(false);
      });
  }, [client, draft, editing, input.state, land]);
  return { isSaving, save };
}

/**
 * What a save's answer changes on the page. A refusal writes nothing, so what the person changed stays, including what
 * they changed while the save was in the air: `sent` is what was sent, `editing.currentDraft()` is what the page holds when
 * the answer comes.
 */
interface SaveEffects {
  readonly sent: KitchenDefaultsWire;
  readonly savedAtEditStart: KitchenDefaultsWire;
  readonly client: KitchenDefaultsClient;
  readonly editing: DraftEditing;
  readonly land: (landing: Landing) => void;
}

async function settleSave(
  outcome: DefaultsSaveOutcome,
  effects: SaveEffects,
): Promise<void> {
  switch (outcome.kind) {
    case "saved":
      effects.editing.adoptSaved(outcome.saved, effects.sent);
      effects.land({ notice: "saved", focus: { kind: "notice" } });
      return;
    case "invalid":
      refuseRows(
        unchangedSinceSent(membersOfIssues(outcome.issues), effects),
        effects,
      );
      return;
    case "item-unavailable":
      await refuseItem(outcome.item, effects);
      return;
    case "conflict":
      await landAfterConflict(effects);
      return;
    case "failed":
      effects.land(SAVE_FAILED);
      return;
  }
}

function refuseRows(
  members: readonly KitchenDefaultsMember[],
  { editing, land }: SaveEffects,
): void {
  const first = DEFAULTS_ROW_ORDER.find((member) => members.includes(member));
  if (first === undefined) {
    land(SAVE_FAILED);
    return;
  }
  editing.refuse(members);
  land({ notice: "applies", focus: { kind: "row", member: first } });
}

/** A refusal names what was sent: a row the person has changed since is not the one refused. */
function unchangedSinceSent(
  members: readonly KitchenDefaultsMember[],
  { sent, editing }: SaveEffects,
): readonly KitchenDefaultsMember[] {
  const changed = modifiedMembers(sent, editing.currentDraft());
  return members.filter((member) => !changed.has(member));
}

/** Focus goes to the row after the options are read again: the refused option may be gone by then. */
async function refuseItem(item: ItemRef, effects: SaveEffects): Promise<void> {
  const rebased = await adoptFreshFacts(effects);
  refuseRows(
    membersHoldingItem(rebased ?? effects.editing.currentDraft(), item),
    effects,
  );
}

async function landAfterConflict(effects: SaveEffects): Promise<void> {
  const isRead = (await adoptFreshFacts(effects)) !== undefined;
  effects.land(
    isRead
      ? { notice: "changed-meanwhile", focus: { kind: "notice" } }
      : SAVE_FAILED,
  );
}

/** The facts read again and laid under the person's edits; nothing when they cannot be read. */
async function adoptFreshFacts(
  effects: SaveEffects,
): Promise<KitchenDefaultsWire | undefined> {
  const fresh = await orFailed(() => effects.client.readAgain(), undefined);
  if (fresh === undefined) return undefined;
  return effects.editing.adoptFresh(fresh, effects.savedAtEditStart);
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
