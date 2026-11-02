import type { PriceBook } from "@lemnaria/configurator-domain";

import {
  describeCabinet,
  type CabinetDetailFacts,
} from "./cabinet-detail-facts";
import {
  priceFieldsOf,
  ruleIn,
  type DetailField,
} from "./cabinet-detail-fields";
import {
  deriveCabinetList,
  type CabinetListPageInput,
} from "./cabinet-list-facts";
import { isRuleModified } from "./cabinet-list-model";
import type { DashboardDraftWire } from "./price-dashboard-wire-contract";

// Everything the cabinet's page is drawn from, worked out again from the state after every write, so the page
// shows what the server stored and never what was typed.

export type CabinetDetailDerivation =
  | {
      readonly kind: "ready";
      readonly facts: CabinetDetailFacts;
      readonly fields: readonly DetailField[];
      readonly active: PriceBook;
      /** The active book with the draft applied. */
      readonly candidate: PriceBook;
      readonly draft: DashboardDraftWire;
      /** The draft holds a change to one of this cabinet's prices. */
      readonly isModified: boolean;
    }
  /** The book holds no rule of that id. */
  | { readonly kind: "not-found" }
  /** A fact the book or the catalogue contradicts: a defect of ours, so the page is not drawn rather than wrong. */
  | { readonly kind: "unreadable" };

export function deriveCabinetDetail(
  page: CabinetListPageInput,
  ruleId: string,
): CabinetDetailDerivation {
  const { active, draft } = page.state;
  const rule = ruleIn(active.book, ruleId);
  if (rule === undefined) return { kind: "not-found" };
  const list = deriveCabinetList(page);
  const listed =
    list.kind === "ready"
      ? list.input.rules.find((held) => held.ruleId === ruleId)
      : undefined;
  const facts =
    listed === undefined
      ? undefined
      : describeCabinet(active.book, rule, listed);
  if (list.kind !== "ready" || facts === undefined) {
    return { kind: "unreadable" };
  }
  return {
    kind: "ready",
    facts,
    fields: priceFieldsOf(
      { active: active.book, candidate: list.candidate },
      ruleId,
      facts.listedWidths,
    ),
    active: active.book,
    candidate: list.candidate,
    draft,
    isModified: isRuleModified(draft, ruleId),
  };
}
