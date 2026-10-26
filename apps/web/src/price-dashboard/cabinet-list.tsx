"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type RefObject } from "react";

import type { PriceGroupCode } from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import styles from "./cabinet-list.module.css";
import {
  filterRows,
  groupRows,
  pendingPriceCountOf,
  rowsOf,
  type CabinetListInput,
} from "./cabinet-list-model";
import { CabinetGroupSection } from "./cabinet-list-rows";
import { CatalogUnavailableNotice } from "./catalog-states";

// The cabinet types of the configurator, in four groups, with the price at the default size and, beside it, the active one
// while a change awaits publication. A search and "Doar modificate" narrow it. The search is typed text that never leaves
// the page: it is not sent, stored or put in an address.

/** The group that starts closed: the structural corner pieces, which the manufacturer rarely prices by hand. */
const GROUPS_CLOSED_AT_FIRST: readonly PriceGroupCode[] = ["corner"];

export function CabinetListScreen({
  locale,
  context,
  input,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: CabinetListInput;
}) {
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(input.draft),
  };
  return (
    <StaffShell locale={locale} page="cabinets" context={shell}>
      <CabinetList input={input} />
    </StaffShell>
  );
}

/** The list could not be read: the frame stays, and the notice stands in the page's place. */
export function CabinetListUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="cabinets" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

function CabinetList({ input }: { readonly input: CabinetListInput }) {
  const translate = useTranslations();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOnlyModifiedChosen, setIsOnlyModifiedChosen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<PriceGroupCode>>(
    new Set(GROUPS_CLOSED_AT_FIRST),
  );
  const rows = useMemo(() => rowsOf(input), [input]);
  const modifiedCount = rows.filter((row) => row.isModified).length;
  const onlyModified = isOnlyModifiedChosen && modifiedCount > 0;
  const isNarrowed = query.trim() !== "" || onlyModified;
  const groups = useMemo(
    () => groupRows(filterRows(rows, { query, onlyModified })),
    [rows, query, onlyModified],
  );
  const shownCount = groups.reduce((sum, group) => sum + group.rows.length, 0);

  const toggleGroup = (code: PriceGroupCode) => {
    setClosedGroups((closed) => {
      const next = new Set(closed);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  };
  const clearSearchAndFilter = () => {
    setQuery("");
    setIsOnlyModifiedChosen(false);
    searchRef.current?.focus();
  };

  return (
    <section className={styles.page} data-testid="cabinet-list">
      <div className={styles.heading}>
        <h1 className={styles.title}>
          {translate("priceDashboard.cabinets.title")}
        </h1>
        <p className={styles.subtitle}>
          {translate("priceDashboard.cabinets.subtitle")}
        </p>
      </div>

      <div className={styles.tools}>
        <SearchField
          query={query}
          inputRef={searchRef}
          onChange={setQuery}
          onClear={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
        />
        <ModifiedToggle
          isPressed={onlyModified}
          isAvailable={modifiedCount > 0}
          onToggle={() => {
            setIsOnlyModifiedChosen((isChosen) => !isChosen);
          }}
        />
      </div>

      <p className={styles.basisNote}>
        {translate("priceDashboard.cabinets.basisNote")}
      </p>
      <p role="status" className={styles.visuallyHidden}>
        {translate("priceDashboard.cabinets.groupCount", {
          count: shownCount,
        })}
      </p>

      {groups.length === 0 ? (
        <EmptyList
          query={query}
          onlyModified={onlyModified}
          onClear={clearSearchAndFilter}
        />
      ) : (
        <>
          <ColumnHeads />
          {groups.map((group) => (
            <CabinetGroupSection
              key={group.code}
              group={group}
              isOpen={isNarrowed || !closedGroups.has(group.code)}
              onToggle={
                isNarrowed
                  ? undefined
                  : () => {
                      toggleGroup(group.code);
                    }
              }
            />
          ))}
        </>
      )}
    </section>
  );
}

function SearchField({
  query,
  inputRef,
  onChange,
  onClear,
}: {
  readonly query: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onChange: (query: string) => void;
  readonly onClear: () => void;
}) {
  const translate = useTranslations();
  const searchId = useId();
  return (
    <div className={styles.searchField}>
      <label className={styles.fieldLabel} htmlFor={searchId}>
        {translate("priceDashboard.cabinets.searchLabel")}
      </label>
      <div className={styles.searchControl}>
        <input
          ref={inputRef}
          id={searchId}
          type="search"
          className={styles.searchInput}
          value={query}
          placeholder={translate("priceDashboard.cabinets.searchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {query === "" ? null : (
          <button
            type="button"
            className={styles.searchClear}
            aria-label={translate("priceDashboard.cabinets.searchClear")}
            onClick={onClear}
          />
        )}
      </div>
    </div>
  );
}

/** "Doar modificate": off, and out of reach, while nothing awaits publication. */
function ModifiedToggle({
  isPressed,
  isAvailable,
  onToggle,
}: {
  readonly isPressed: boolean;
  readonly isAvailable: boolean;
  readonly onToggle: () => void;
}) {
  const translate = useTranslations();
  return (
    <button
      type="button"
      className={styles.filterToggle}
      aria-pressed={isPressed}
      disabled={!isAvailable}
      onClick={onToggle}
    >
      {translate("priceDashboard.cabinets.filterChanged")}
    </button>
  );
}

/** The desktop's column titles. Each row's cells say what they are in their own words, so the titles are for the eye. */
function ColumnHeads() {
  const translate = useTranslations();
  return (
    <div className={styles.columns} aria-hidden="true">
      <span />
      <span>{translate("priceDashboard.cabinets.columnCabinet")}</span>
      <span>{translate("priceDashboard.cabinets.columnWidth")}</span>
      <span>{translate("priceDashboard.cabinets.columnPrice")}</span>
    </div>
  );
}

/** What stands where the rows would: a search or the filter that matched nothing, or a book with no cabinet at all. */
function EmptyList({
  query,
  onlyModified,
  onClear,
}: {
  readonly query: string;
  readonly onlyModified: boolean;
  readonly onClear: () => void;
}) {
  const translate = useTranslations();
  const isSearching = query.trim() !== "";
  if (!isSearching) {
    return (
      <div className={styles.empty} data-testid="cabinet-list-empty">
        <p className={styles.emptyTitle}>
          {translate("priceDashboard.cabinets.emptyListTitle")}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.empty} data-testid="cabinet-list-empty">
      <p className={styles.emptyTitle}>
        {onlyModified
          ? translate("priceDashboard.cabinets.emptyChangedTitle", { query })
          : translate("priceDashboard.cabinets.emptySearchTitle", { query })}
      </p>
      <p className={styles.emptyBody}>
        {translate("priceDashboard.cabinets.emptySearchBody")}
      </p>
      <button type="button" className={styles.emptyAction} onClick={onClear}>
        {translate("priceDashboard.cabinets.searchClear")}
      </button>
    </div>
  );
}
