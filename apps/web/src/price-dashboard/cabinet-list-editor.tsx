"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  isSameAddress,
  type AppliedAddress,
} from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import type { StaffShellContext } from "@/staff/staff-shell";

import { BulkChangeDialog } from "./bulk-change-dialog";
import {
  CabinetListScreen,
  CabinetListUnavailableScreen,
} from "./cabinet-list";
import {
  deriveCabinetList,
  type CabinetListPageInput,
} from "./cabinet-list-facts";
import type { PriceEditing } from "./cabinet-list-inline-edit";
import type { CabinetAnchorField } from "./cabinet-list-model";
import { DepthRuleCard } from "./depth-rule-card";
import type { DraftChangeInputWire } from "./price-dashboard-wire-contract";
import type { PriceDraftClient } from "./price-draft-client";
import { usePriceDraft, type FieldWriteResult } from "./use-price-draft";

// The cabinet list with its writes: the screen reads the draft it holds, and a price, the depth rule or a bulk action
// changes it through the dashboard's routes. The rows are worked out again from the draft after every write, so what is
// shown is what the server stored and never what was typed.

const DEPTH_RULE_ADDRESS: AppliedAddress = { kind: "depth-rule" };

export interface CabinetListEditorProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: CabinetListPageInput;
  /** The routes the writes go through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
}

export function CabinetListEditor({
  locale,
  context,
  page,
  client,
}: CabinetListEditorProps) {
  const { state, isBusy, change, revert, bulk } = usePriceDraft({
    initial: page.state,
    client,
  });
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const bulkButtonRef = useRef<HTMLButtonElement>(null);
  const reading = useMemo(
    () => deriveCabinetList({ state, cabinetNames: page.cabinetNames }),
    [state, page.cabinetNames],
  );

  /** A value equal to the active one is no change: it takes the draft's change at that address out, or does nothing. */
  const setField = useCallback(
    (
      wanted: { readonly address: AppliedAddress; readonly value: number },
      activeValue: number,
    ): Promise<FieldWriteResult> => {
      // The address of a number field and a number are a change of that field: the route judges which address takes one.
      if (wanted.value !== activeValue) {
        return change(wanted as DraftChangeInputWire);
      }
      const holdsChange = state.draft.changes.some((held) =>
        isSameAddress(held.address, wanted.address),
      );
      return holdsChange
        ? revert({ kind: "change", address: wanted.address })
        : Promise.resolve({ kind: "unchanged" });
    },
    [state.draft.changes, change, revert],
  );

  const editing = useMemo<PriceEditing>(
    () => ({
      isBusy,
      saveAnchor: (field: CabinetAnchorField, minor: number) =>
        setField({ address: field.address, value: minor }, field.activeMinor),
    }),
    [isBusy, setField],
  );

  if (reading.kind === "unreadable") {
    return <CabinetListUnavailableScreen locale={locale} context={context} />;
  }
  const activeDepthPercent = state.active.book.depthRule.deepCabinetPercent;
  return (
    <>
      <CabinetListScreen
        locale={locale}
        context={context}
        input={reading.input}
        editing={editing}
        rulesCard={
          <DepthRuleCard
            activePercent={activeDepthPercent}
            pendingPercent={reading.candidate.depthRule.deepCabinetPercent}
            isBusy={isBusy}
            onSave={(percent) =>
              setField(
                { address: DEPTH_RULE_ADDRESS, value: percent },
                activeDepthPercent,
              )
            }
            onOpenBulk={() => {
              setIsBulkOpen(true);
            }}
            bulkButtonRef={bulkButtonRef}
          />
        }
      />
      {isBulkOpen ? (
        <BulkChangeDialog
          rows={reading.input.rules}
          candidate={reading.candidate}
          onApply={bulk}
          returnFocusFallbackRef={bulkButtonRef}
          onClose={() => {
            setIsBulkOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
