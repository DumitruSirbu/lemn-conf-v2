"use client";

import { presetNameFactsOf } from "@lemnaria/configurator-domain";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useContent } from "@/i18n/use-content";
import { useCanAuthorPresetsFor } from "@/preset/preset-authoring-store";
import { ConfirmationDialog } from "@/settings/confirmation-dialog";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./configure.module.css";
import { usePresetSave, type PresetSave } from "./use-save-as-preset";

const TEST_ID_PREFIX = "save-as-preset";

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

/** The dialog: an optional name whose placeholder is the generated one, and the reason when the route refuses. */
export function SaveAsPresetDialog({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  const content = useContent();
  const save = usePresetSave();
  const [typedName, setTypedName] = useState("");
  const fieldId = useId();
  const design = useConfiguratorStore((state) => state.design);
  const generatedName = useMemo(
    () => content.presetName(presetNameFactsOf(design)),
    [content, design],
  );
  // A request in flight cannot be taken back, so the dialog stays until it is answered.
  const dismiss = save.phase.kind === "sending" ? ignore : onClose;

  return (
    <ConfirmationDialog
      view={{
        title: content.presetSave.open,
        body: content.presetSave.intro,
        confirmLabel: content.presetSave.confirm,
        backLabel: content.presetSave.close,
      }}
      testIdPrefix={TEST_ID_PREFIX}
      isConfirmDisabled={!save.canSubmit}
      onConfirm={() => {
        save.submit(typedName);
      }}
      onStay={dismiss}
    >
      <div className={styles.presetField}>
        <label htmlFor={fieldId}>{content.presetSave.nameLabel}</label>
        <input
          id={fieldId}
          type="text"
          className={styles.presetFieldInput}
          data-testid={`${TEST_ID_PREFIX}-name`}
          autoComplete="off"
          value={typedName}
          placeholder={generatedName}
          onChange={(event) => {
            setTypedName(event.target.value);
          }}
        />
      </div>
      <p
        className={styles.presetStatus}
        role="status"
        data-testid={`${TEST_ID_PREFIX}-status`}
      >
        {statusSentenceOf(save, content.presetSave)}
      </p>
    </ConfirmationDialog>
  );
}

function ignore(): void {
  // Intentionally nothing: see `dismiss`.
}

/** The one sentence under the field: the route's reason, else what the dialog is doing, else nothing. */
function statusSentenceOf(
  save: PresetSave,
  copy: ReturnType<typeof useContent>["presetSave"],
): string {
  switch (save.phase.kind) {
    case "refused":
      return copy.refusal[save.phase.reason];
    case "sending":
      return copy.saving;
    case "saved":
      return copy.saved;
    case "idle":
      return waitingSentenceOf(save, copy);
  }
}

function waitingSentenceOf(
  save: PresetSave,
  copy: ReturnType<typeof useContent>["presetSave"],
): string {
  if (save.readiness === "waiting") return copy.waiting;
  return save.readiness === "blocked" ? copy.refusal.notSaved : "";
}
