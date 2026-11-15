"use client";

import { useId, useMemo, useState } from "react";

import type { Design } from "@lemnaria/configurator-domain";

import {
  useContent,
  useStaffChangesCopy,
  useStaffKitchenCopy,
} from "@/i18n/use-content";
import { usePriceBookRoot } from "@/price/price-book-provider";

import type { KitchenVersion } from "./kitchen-version-rows";
import styles from "./staff-cabinet-list.module.css";
import {
  describeCabinetList,
  type AvailableCabinetList,
  type CabinetChange,
  type CabinetListGroup,
  type CabinetListRow,
} from "./staff-cabinet-list-model";
import { useIsDesktop } from "./staff-kitchens-list";

// Every cabinet of the copy on screen, in an accordion of the client's review groups (ADR 0185 decisions 3 and 4). The
// words are the model's and the catalogue's. What staff opened or closed lives here, in memory, while the page is open:
// the list stays mounted across a version switch, and nothing is stored.

/** At a desktop width the first two groups start open, on a phone the first (mockup `Bucatarii clienti`, `:210`). */
const DEFAULT_OPEN_GROUPS_ON_DESKTOP = 2;
const DEFAULT_OPEN_GROUPS_ON_PHONE = 1;

export interface StaffCabinetListProps {
  readonly design: Design;
  readonly shownVersion: KitchenVersion;
  /** The other copy, when the page holds both and they differ. */
  readonly other: Design | undefined;
}

export function StaffCabinetList({
  design,
  shownVersion,
  other,
}: StaffCabinetListProps) {
  const content = useContent();
  const priceBook = usePriceBookRoot();
  const list = useMemo(
    () =>
      describeCabinetList({
        shown: { design, version: shownVersion },
        other,
        content,
        priceBook,
      }),
    [design, shownVersion, other, content, priceBook],
  );
  const expansion = useGroupExpansion(
    list.kind === "available" ? list.groups.map((group) => group.key) : [],
  );
  const copy = useStaffChangesCopy().cabinets;
  if (list.kind === "unavailable") {
    return (
      <p className={styles.unavailable} data-testid="staff-kitchen-cabinets">
        {copy.unavailable}
      </p>
    );
  }
  return (
    <AvailableList
      list={list}
      shownVersion={shownVersion}
      expansion={expansion}
    />
  );
}

function AvailableList({
  list,
  shownVersion,
  expansion,
}: {
  readonly list: AvailableCabinetList;
  readonly shownVersion: KitchenVersion;
  readonly expansion: GroupExpansion;
}) {
  const copy = useStaffChangesCopy().cabinets;
  const { summary } = useStaffKitchenCopy();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const isOpen = (group: CabinetListGroup): boolean =>
    expansion.isOpen(group.key);
  const areAllOpen = list.groups.every((group) => isOpen(group));
  return (
    <section
      className={styles.list}
      aria-labelledby={titleId}
      data-testid="staff-kitchen-cabinets"
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {shownVersion === "sent" ? summary.titleSent : summary.titleCurrent}
        </h2>
        {list.groups.length === 0 ? null : (
          <button
            type="button"
            className={styles.toggleAll}
            onClick={() => {
              expansion.setAll(!areAllOpen);
            }}
            data-testid="staff-kitchen-cabinets-toggle-all"
          >
            {areAllOpen ? copy.collapseAll : copy.expandAll}
          </button>
        )}
      </div>
      {list.groups.map((group) => (
        <CabinetGroup
          key={group.key}
          group={group}
          panelId={`${baseId}-${group.key}`}
          isOpen={isOpen(group)}
          onToggle={() => {
            expansion.toggle(group.key, isOpen(group));
          }}
        />
      ))}
      {list.holdsChanges ? (
        <p className={styles.note}>{copy.highlightNote}</p>
      ) : null}
    </section>
  );
}

function CabinetGroup({
  group,
  panelId,
  isOpen,
  onToggle,
}: {
  readonly group: CabinetListGroup;
  readonly panelId: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  const copy = useStaffChangesCopy().cabinets;
  return (
    <div className={styles.group} data-testid="staff-cabinet-group">
      <h3 className={styles.groupHeading}>
        <button
          type="button"
          className={styles.groupButton}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          data-testid="staff-cabinet-group-toggle"
        >
          <span className={styles.groupName}>{group.heading}</span>
          <span className={styles.groupEnd}>
            {copy.groupCount(group.rows.length)}
            <span className={styles.chevron} aria-hidden="true" />
          </span>
        </button>
      </h3>
      <ul id={panelId} className={styles.rows} hidden={!isOpen}>
        {group.rows.map((row) => (
          <CabinetRow key={row.placementId} row={row} />
        ))}
      </ul>
    </div>
  );
}

function CabinetRow({ row }: { readonly row: CabinetListRow }) {
  const mark = useChangeMarks()[row.change];
  return (
    <li
      className={styles.row}
      data-testid="staff-kitchen-cabinet"
      data-change={row.change}
    >
      <span className={styles.rowText}>
        <span className={styles.rowName}>{row.name}</span>
        <span className={styles.rowFacts}>
          {row.facts.map((fact, position) => (
            // The facts are a fixed order of words that can repeat (a finish named like a handle), so the place is the key.
            <span key={position}>{fact}</span>
          ))}
        </span>
        {mark === undefined ? null : (
          <span
            className={styles.mark}
            data-testid="staff-kitchen-cabinet-mark"
          >
            {mark}
          </span>
        )}
      </span>
      {row.amountText === undefined ? null : (
        <span
          className={styles.rowAmount}
          data-testid="staff-kitchen-cabinet-amount"
        >
          {row.amountText}
        </span>
      )}
    </li>
  );
}

function useChangeMarks(): Readonly<Record<CabinetChange, string | undefined>> {
  const copy = useStaffChangesCopy().cabinets;
  return {
    same: undefined,
    differs: copy.differs,
    added: copy.newAfterSending,
    removed: copy.removed,
  };
}

interface GroupExpansion {
  readonly isOpen: (groupKey: string) => boolean;
  readonly toggle: (groupKey: string, isOpenNow: boolean) => void;
  readonly setAll: (isOpen: boolean) => void;
}

interface ExpansionChoices {
  /** The last "expand all" or "collapse all", which every group follows unless it was pressed since. */
  readonly all: boolean | undefined;
  readonly byGroup: ReadonlyMap<string, boolean>;
}

const NO_CHOICES: ExpansionChoices = { all: undefined, byGroup: new Map() };

/**
 * Only what staff chose is state, with the place each group was first seen at (a distinct number per key, never reused).
 * Of the groups now shown, the first two by that place on a desktop and the first on a phone are open until pressed:
 * worked out at render, because the first render of a desktop is not yet known to be one. The place is kept by the
 * group's key, so a switch of copy that puts a group in front of another neither opens nor closes the other, and never
 * leaves more groups open by default than the width allows.
 */
function useGroupExpansion(groupKeys: readonly string[]): GroupExpansion {
  const isDesktop = useIsDesktop();
  const [choices, setChoices] = useState(NO_CHOICES);
  const [seenPlaces, setSeenPlaces] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const places = withNewPlaces(seenPlaces, groupKeys);
  if (places.size !== seenPlaces.size) setSeenPlaces(places);
  const defaultOpenGroups = isDesktop
    ? DEFAULT_OPEN_GROUPS_ON_DESKTOP
    : DEFAULT_OPEN_GROUPS_ON_PHONE;
  const placeOf = (groupKey: string): number =>
    places.get(groupKey) ?? Number.POSITIVE_INFINITY;
  const isOpenByDefault = (groupKey: string): boolean =>
    groupKeys.filter((key) => placeOf(key) < placeOf(groupKey)).length <
    defaultOpenGroups;
  return {
    isOpen: (groupKey) =>
      choices.byGroup.get(groupKey) ?? choices.all ?? isOpenByDefault(groupKey),
    toggle: (groupKey, isOpenNow) => {
      setChoices((previous) => ({
        all: previous.all,
        byGroup: new Map(previous.byGroup).set(groupKey, !isOpenNow),
      }));
    },
    setAll: (isOpen) => {
      setChoices({ all: isOpen, byGroup: new Map() });
    },
  };
}

function withNewPlaces(
  known: ReadonlyMap<string, number>,
  groupKeys: readonly string[],
): ReadonlyMap<string, number> {
  if (groupKeys.every((key) => known.has(key))) return known;
  const places = new Map(known);
  for (const key of groupKeys) {
    if (!places.has(key)) places.set(key, places.size);
  }
  return places;
}
