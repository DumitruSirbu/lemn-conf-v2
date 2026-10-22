"use client";

import { judgeKitchenName } from "@lemnaria/configurator-domain";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { AccountIssueCode } from "@/i18n/content";
import { useAccountKitchensCopy } from "@/i18n/use-content";

import accountStyles from "../account.module.css";
import { AccountForm, SubmitButton, TextField } from "../account-form-parts";
import { FailureNotice } from "./kitchen-failure-notice";
import type { ListedKitchen } from "./kitchens-answer";
import styles from "./kitchens.module.css";
import type { KitchenActions, RenameResult } from "./use-kitchen-actions";
import type { ListFailure } from "./use-kitchens";

// The name's field in the card (Lot 2 frame A9E). The name is read as the server reads it (NFC, trimmed, 1 to 120
// characters) before anything is sent, so the refusals of the field cost no request; the server's own refusal of the same
// field is shown in the same place. A name the person leaves as it was is not sent.

export interface RenameKitchenFormProps {
  readonly kitchen: ListedKitchen;
  /** The name the card shows: the field starts as it. */
  readonly kitchenName: string;
  readonly actions: KitchenActions;
  /** The form ends, saved or not: the card draws its actions again. */
  readonly onDone: () => void;
}

type RenameStatus =
  | { readonly kind: "editing" }
  | { readonly kind: "busy" }
  | { readonly kind: "refused"; readonly code: AccountIssueCode }
  | { readonly kind: "failed"; readonly failure: ListFailure };

export function RenameKitchenForm({
  kitchen,
  kitchenName,
  actions,
  onDone,
}: RenameKitchenFormProps) {
  const copy = useAccountKitchensCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(kitchenName);
  const [status, setStatus] = useState<RenameStatus>({ kind: "editing" });
  useSelectFieldOnOpen(inputRef);

  function submit(): void {
    if (status.kind === "busy") return;
    const judgement = judgeKitchenName(value);
    if (!judgement.ok) {
      refuse(judgement.code);
      return;
    }
    if (judgement.name === kitchenName) {
      onDone();
      return;
    }
    setStatus({ kind: "busy" });
    void actions.rename(kitchen, judgement.name).then(settle);
  }

  function settle(result: RenameResult): void {
    switch (result.kind) {
      case "renamed":
      case "gone":
        onDone();
        return;
      case "refused":
        refuse(result.issue.code);
        return;
      case "failed":
        setStatus({ kind: "failed", failure: result.failure });
        return;
      case "left":
        return;
    }
  }

  function refuse(code: AccountIssueCode): void {
    setStatus({ kind: "refused", code });
    inputRef.current?.focus();
  }

  function cancelOnEscape(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || status.kind === "busy") return;
    event.stopPropagation();
    onDone();
  }

  return (
    <div onKeyDown={cancelOnEscape}>
      <AccountForm onSubmit={submit} isBusy={status.kind === "busy"}>
        <TextField
          label={copy.rename.label}
          name="kitchen-name"
          type="text"
          autoComplete="off"
          spellCheck
          value={value}
          onChange={setValue}
          inputRef={inputRef}
          {...(status.kind === "refused"
            ? { error: copy.rename.fieldError(status.code) }
            : {})}
        />
        {status.kind === "failed" ? (
          <FailureNotice failure={status.failure} />
        ) : null}
        <div className={styles.renameActions}>
          <SubmitButton
            label={copy.rename.save}
            busyLabel={copy.rename.saving}
            isBusy={status.kind === "busy"}
            isOff={false}
          />
          <CancelRename isBusy={status.kind === "busy"} onCancel={onDone} />
        </div>
      </AccountForm>
    </div>
  );
}

function CancelRename({
  isBusy,
  onCancel,
}: {
  readonly isBusy: boolean;
  readonly onCancel: () => void;
}) {
  const copy = useAccountKitchensCopy();
  return (
    <button
      type="button"
      className={accountStyles.secondary}
      aria-disabled={isBusy ? true : undefined}
      onClick={isBusy ? undefined : onCancel}
    >
      {copy.rename.cancel}
    </button>
  );
}

/** The field opens with its text selected: the usual next act is to type over it. */
function useSelectFieldOnOpen(
  inputRef: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef]);
}
