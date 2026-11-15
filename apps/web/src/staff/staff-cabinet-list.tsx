"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

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
import { KitchenSettings } from "./staff-cabinet-settings";
import { useIsDesktop } from "./staff-kitchens-list";
import type { StaffSentCabinetLineWire } from "./staff-kitchens-wire-contract";

// Every cabinet of the copy on screen, in an accordion of the client's review groups (ADR 0185 decisions 3 and 4),
// under a header that says what the kitchen is made of (decision 6). The words are the model's and the catalogue's.
// What staff opened or closed lives here, in memory, while the page is open: the list stays mounted across a version
// switch, and nothing is stored.

/** At a desktop width the first two groups start open, on a phone the first (mockup `Bucatarii clienti`, `:210`). */
const DEFAULT_OPEN_GROUPS_ON_DESKTOP = 2;
const DEFAULT_OPEN_GROUPS_ON_PHONE = 1;

export interface StaffCabinetListProps {
  readonly design: Design;
  readonly shownVersion: KitchenVersion;
  /** The other copy, when the page holds both and they differ. */
  readonly other: Design | undefined;
  /** What the sent request stored for each cabinet: the sent copy's amounts. */
  readonly sentLines: readonly StaffSentCabinetLineWire[];
  /** Leaves the header's starting price out: only a draft states one (see `KitchenSettingsProps`). */
  readonly omitsStartingPrice: boolean;
}

export function StaffCabinetList({
  design,
  shownVersion,
  other,
  sentLines,
  omitsStartingPrice,
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
        sentLines,
      }),
    [design, shownVersion, other, content, priceBook, sentLines],
  );
  const expansion = useGroupExpansion(
    list.kind === "available" ? list.groups.map((group) => group.key) : [],
  );
  const settings = (
    <KitchenSettings
      design={design}
      other={other}
      isShownCurrent={shownVersion === "current"}
      omitsStartingPrice={omitsStartingPrice}
    />
  );
  if (list.kind === "unavailable") {
    return <UnavailableList shownVersion={shownVersion} settings={settings} />;
  }
  return (
    <AvailableList
      list={list}
      shownVersion={shownVersion}
      expansion={expansion}
      settings={settings}
    />
  );
}

function UnavailableList({
  shownVersion,
  settings,
}: {
  readonly shownVersion: KitchenVersion;
  readonly settings: ReactNode;
}) {
  const copy = useStaffChangesCopy().cabinets;
  const titleId = `${useId()}-title`;
  return (
    <section
      className={styles.list}
      aria-labelledby={titleId}
      data-testid="staff-kitchen-cabinets"
    >
      <div className={styles.head}>
        <ListTitle id={titleId} shownVersion={shownVersion} />
      </div>
      {settings}
      <p className={styles.unavailable}>{copy.unavailable}</p>
    </section>
  );
}

function AvailableList({
  list,
  shownVersion,
  expansion,
  settings,
}: {
  readonly list: AvailableCabinetList;
  readonly shownVersion: KitchenVersion;
  readonly expansion: GroupExpansion;
  readonly settings: ReactNode;
}) {
  const copy = useStaffChangesCopy().cabinets;
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
        <ListTitle id={titleId} shownVersion={shownVersion} />
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
      {settings}
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

/** Says which copy of the kitchen the list and its header describe. */
function ListTitle({
  id,
  shownVersion,
}: {
  readonly id: string;
  readonly shownVersion: KitchenVersion;
}) {
  const { summary } = useStaffKitchenCopy();
  return (
    <h2 id={id} className={styles.title}>
      {shownVersion === "sent" ? summary.titleSent : summary.titleCurrent}
    </h2>
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
