"use client";

import { presetNameFactsOf } from "@lemnaria/configurator-domain";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import { useContent } from "@/i18n/use-content";
import { matchesMedia } from "@/lib/matches-media";
import { useCanAuthorPresetsFor } from "@/preset/preset-authoring-store";
import {
  PresetStatusNotice,
  type PresetStatus,
} from "@/preset/preset-status-notice";
import {
  trapTab,
  useBackgroundInert,
  useEscapeToDismiss,
} from "@/settings/confirmation-dialog";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./configure.module.css";
import dialogStyles from "./save-as-preset.module.css";
import {
  usePresetSave,
  useCloseAfterSavedNotice,
  type PresetSave,
  type PresetSavePhase,
} from "./use-save-as-preset";

const TEST_ID_PREFIX = "save-as-preset";

/** A mouse or a trackpad is the main input: the phone keyboard will not open unasked when the field takes focus. */
const FINE_POINTER_QUERY = "(pointer: fine)";
const CLOSE_GLYPH = "×";

/** The button's state, owned by the screen because the button and the dialog stand in two places: the button over the
 *  scene, the dialog as a direct child of `<main>` (the dialog marks every other band of the screen inert). */
export interface SaveAsPresetControl {
  /** The server said this browser may author presets for this design, and this is the owner's editor. */
  readonly isOffered: boolean;
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}

/** Offered only to the owner's editor, for a design this browser may write and the server's policy allows presets for
 *  (ADR 0112 decision 2, bullet 3: the client never decides). The share and frozen views never reach it. */
export function useSaveAsPresetControl(isOwner: boolean): SaveAsPresetControl {
  const designId = useConfiguratorStore((state) => state.designId);
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const canAuthorPresets = useCanAuthorPresetsFor(designId);
  const [isOpen, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(() => {
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // The dialog unmounts with the focus inside it, and the customer goes back to the control that asked. Not from `close`:
  // there the button's band is still inert, and focus on an inert element is ignored. By this effect the dialog's
  // cleanup (which lifts the inert marks) has run.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) buttonRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return {
    isOffered: isOwner && canWrite === true && canAuthorPresets,
    isOpen,
    open,
    close,
    buttonRef,
  };
}

/** *Salvează ca preset*, over the scene's bottom-right. Hidden by the stylesheet while the phone's sheet is open. */
export function SaveAsPresetButton({
  control,
  isPanelOpen,
}: {
  readonly control: SaveAsPresetControl;
  readonly isPanelOpen: boolean;
}) {
  const content = useContent();
  if (!control.isOffered) return null;

  return (
    <button
      ref={control.buttonRef}
      type="button"
      className={styles.savePreset}
      data-testid={TEST_ID_PREFIX}
      data-panel-open={isPanelOpen}
      aria-haspopup="dialog"
      onClick={control.open}
    >
      {content.presetSave.open}
    </button>
  );
}

type PresetSaveCopy = ReturnType<typeof useContent>["presetSave"];

/**
 * *Salvează ca preset* as a modal of its own (`Presete.dc.html#3t`, `#d3t`; M8D decision D-1): the phone's bottom sheet,
 * desktop's 520 px card. It is built from the three primitives the other modals share (the Tab ring, Escape, the inert
 * background) and stands as a direct child of `<main>` so the last of them can reach the other bands.
 *
 * The Tab order is the DOM order: the field, *Închide*, *Salvează*, then the round × that sits in the head by grid
 * placement alone. An optional name whose placeholder is the generated one, and the reason when the route refuses.
 */
export function SaveAsPresetDialog({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  const content = useContent();
  const save = usePresetSave();
  const isFading = useCloseAfterSavedNotice(save.phase, onClose);
  const [typedName, setTypedName] = useState("");
  const targets = useDialogFocusTargets();
  const titleId = useId();
  const introId = useId();
  const isSending = save.phase.kind === "sending";
  // A request in flight cannot be taken back, so the dialog stays until it is answered.
  const dismiss = isSending ? ignore : onClose;

  useDialogFocus(targets, save.phase.kind);
  useEscapeToDismiss(true, dismiss);
  useBackgroundInert(true, targets.host);

  return (
    <div
      ref={targets.host}
      className={dialogStyles.host}
      data-closing={isFading}
    >
      <div
        className={dialogStyles.scrim}
        aria-hidden="true"
        data-testid={`${TEST_ID_PREFIX}-scrim`}
        onMouseDown={keepFocus}
        onClick={dismiss}
      />
      <div
        ref={targets.surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        tabIndex={-1}
        className={dialogStyles.dialog}
        data-testid={`${TEST_ID_PREFIX}-dialog`}
        onKeyDown={trapTab}
      >
        <span className={dialogStyles.handle} aria-hidden="true" />
        <DialogHead
          copy={content.presetSave}
          titleId={titleId}
          introId={introId}
        />
        <NameField
          fieldRef={targets.field}
          value={typedName}
          isLocked={isSending || save.phase.kind === "saved"}
          onChange={setTypedName}
        />
        <div className={dialogStyles.status}>
          <PresetStatusNotice
            status={statusOf(save, content.presetSave)}
            testId={`${TEST_ID_PREFIX}-status`}
          />
        </div>
        <DialogActions
          save={save}
          typedName={typedName}
          targets={targets}
          dismiss={dismiss}
        />
        <button
          type="button"
          className={dialogStyles.closeButton}
          aria-label={content.presetSave.close}
          aria-disabled={isSending}
          data-testid={`${TEST_ID_PREFIX}-close`}
          onClick={dismiss}
        >
          <span aria-hidden="true">{CLOSE_GLYPH}</span>
        </button>
      </div>
    </div>
  );
}

function DialogHead({
  copy,
  titleId,
  introId,
}: {
  readonly copy: PresetSaveCopy;
  readonly titleId: string;
  readonly introId: string;
}) {
  return (
    <div className={dialogStyles.head}>
      <h2 id={titleId} className={dialogStyles.title}>
        {copy.open}
      </h2>
      <p
        id={introId}
        className={dialogStyles.intro}
        data-testid={`${TEST_ID_PREFIX}-confirm-body`}
      >
        {copy.intro}
      </p>
    </div>
  );
}

/** The optional name, whose placeholder is the name the preset gets if this stays empty. 16 px, so a phone's browser
 *  does not zoom the page on focus. */
function NameField({
  fieldRef,
  value,
  isLocked,
  onChange,
}: {
  readonly fieldRef: RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly isLocked: boolean;
  readonly onChange: (name: string) => void;
}) {
  const content = useContent();
  const design = useConfiguratorStore((state) => state.design);
  const fieldId = useId();
  const generatedName = useMemo(
    () => content.presetName(presetNameFactsOf(design)),
    [content, design],
  );

  return (
    <div className={dialogStyles.field}>
      <label htmlFor={fieldId} className={dialogStyles.label}>
        {content.presetSave.nameLabel}
      </label>
      <input
        ref={fieldRef}
        id={fieldId}
        type="text"
        className={dialogStyles.input}
        data-testid={`${TEST_ID_PREFIX}-name`}
        autoComplete="off"
        disabled={isLocked}
        value={value}
        placeholder={generatedName}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

/** *Închide* and *Salvează*. While a request is in flight *Închide* is `aria-disabled` rather than `disabled`: it stays
 *  a Tab stop, so the ring is never empty and focus has somewhere to be when *Salvează* greys out. */
function DialogActions({
  save,
  typedName,
  targets,
  dismiss,
}: {
  readonly save: PresetSave;
  readonly typedName: string;
  readonly targets: DialogFocusTargets;
  readonly dismiss: () => void;
}) {
  const copy = useContent().presetSave;

  return (
    <div className={dialogStyles.actions}>
      <button
        ref={targets.close}
        type="button"
        className={dialogStyles.closeAction}
        aria-disabled={save.phase.kind === "sending"}
        data-testid={`${TEST_ID_PREFIX}-confirm-back`}
        onClick={dismiss}
      >
        {copy.close}
      </button>
      <button
        ref={targets.confirm}
        type="button"
        className={dialogStyles.confirmAction}
        data-testid={`${TEST_ID_PREFIX}-confirm`}
        disabled={!save.canSubmit}
        onClick={() => {
          save.submit(typedName);
        }}
      >
        {copy.confirm}
      </button>
    </div>
  );
}

interface DialogFocusTargets {
  readonly host: RefObject<HTMLDivElement | null>;
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly close: RefObject<HTMLButtonElement | null>;
  readonly confirm: RefObject<HTMLButtonElement | null>;
}

function useDialogFocusTargets(): DialogFocusTargets {
  return {
    host: useRef<HTMLDivElement>(null),
    surface: useRef<HTMLDivElement>(null),
    field: useRef<HTMLInputElement>(null),
    close: useRef<HTMLButtonElement>(null),
    confirm: useRef<HTMLButtonElement>(null),
  };
}

/**
 * Where focus is. On open: in the field when a mouse or keyboard is the main input, on the dialog itself on touch, so the
 * phone's keyboard does not open over *Salvează* unasked (owner answer O-3, 2026-10-18). While the request is out and
 * once it is saved the field and *Salvează* are disabled, which would drop focus to the page, outside the Tab ring; it
 * goes to *Închide* instead, and returns to *Salvează* if the request ends without closing the dialog.
 */
function useDialogFocus(
  targets: DialogFocusTargets,
  phaseKind: PresetSavePhase["kind"],
): void {
  const { surface, field, close, confirm } = targets;
  const wasMovedToClose = useRef(false);

  useEffect(() => {
    const opening = matchesMedia(FINE_POINTER_QUERY) ? field : surface;
    opening.current?.focus();
  }, [field, surface]);

  useEffect(() => {
    const isLocked = phaseKind === "sending" || phaseKind === "saved";
    if (isLocked && isFocusStranded(field.current, confirm.current)) {
      close.current?.focus();
      wasMovedToClose.current = true;
    } else if (!isLocked && wasMovedToClose.current) {
      wasMovedToClose.current = false;
      if (document.activeElement === close.current) confirm.current?.focus();
    }
  }, [phaseKind, field, close, confirm]);
}

/** True when focus is on the page or on a control that is about to be disabled. */
function isFocusStranded(
  ...disabling: readonly (HTMLElement | null)[]
): boolean {
  const active = document.activeElement;
  return active === document.body || disabling.includes(active as HTMLElement);
}

/** A press on the scrim must not take focus from the dialog: it is not focusable, so the page would get it. */
function keepFocus(event: ReactMouseEvent<HTMLElement>): void {
  event.preventDefault();
}

function ignore(): void {
  // Intentionally nothing: see `dismiss`.
}

/** The one notice under the field: the route's reason, else what the dialog is doing, else nothing. */
function statusOf(
  save: PresetSave,
  copy: PresetSaveCopy,
): PresetStatus | undefined {
  switch (save.phase.kind) {
    case "refused":
      return { tone: "error", sentence: copy.refusal[save.phase.reason] };
    case "sending":
      return { tone: "progress", sentence: copy.saving };
    case "saved":
      return { tone: "ok", sentence: copy.saved };
    case "idle":
      return waitingStatusOf(save, copy);
  }
}

function waitingStatusOf(
  save: PresetSave,
  copy: PresetSaveCopy,
): PresetStatus | undefined {
  if (save.readiness === "waiting") {
    return { tone: "progress", sentence: copy.waiting };
  }
  if (save.readiness === "blocked") {
    return { tone: "error", sentence: copy.refusal.notSaved };
  }
  return undefined;
}
