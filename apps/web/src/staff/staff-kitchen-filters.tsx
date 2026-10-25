"use client";

import {
  useId,
  type ChangeEvent,
  type RefObject,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  REQUEST_STATUSES,
  STAFF_KITCHEN_SEARCH_MAX_LENGTH,
  STAFF_KITCHEN_SEGMENTS,
  isRequestStatus,
  isStaffKitchenSegment,
} from "@lemnaria/configurator-domain";

import { useStaffKitchensCopy } from "@/i18n/use-content";

import styles from "./staff-kitchens.module.css";
import type { StaffKitchens } from "./use-staff-kitchens";

// The bar over the list (frames S2B, S2B3, S2D): the segment, the search by the client's e-mail or name, and the
// request status, which only "Trimise" has. The search is a text the person types and a client's own data: it has no
// `name`, so a browser keeps no history of it, and the form never submits to an address.

/** The two fields a press can take away the button that held focus beside: the screen sends focus back to them. */
export interface FilterFocusTargets {
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly statusRef: RefObject<HTMLSelectElement | null>;
}

export type StaffKitchenFiltersProps = FilterFocusTargets &
  Pick<
    StaffKitchens,
    | "filters"
    | "searchProblem"
    | "chooseSegment"
    | "chooseStatus"
    | "typeSearch"
    | "submitSearch"
    | "clearSearch"
  >;

export function StaffKitchenFilters(props: StaffKitchenFiltersProps) {
  return (
    <div className={styles.filters}>
      <SegmentChoice
        segment={props.filters.segment}
        onChoose={props.chooseSegment}
      />
      <SearchBox {...props} />
      <StatusChoice
        selectRef={props.statusRef}
        isEnabled={props.filters.segment === "sent"}
        status={props.filters.status}
        onChoose={props.chooseStatus}
      />
    </div>
  );
}

function SegmentChoice({
  segment,
  onChoose,
}: {
  readonly segment: StaffKitchens["filters"]["segment"];
  readonly onChoose: StaffKitchens["chooseSegment"];
}) {
  const copy = useStaffKitchensCopy();
  const groupName = useId();
  return (
    <fieldset className={styles.segments}>
      <legend className={styles.fieldLabel}>{copy.filters.segmentLabel}</legend>
      <div className={styles.segmentRow}>
        {STAFF_KITCHEN_SEGMENTS.map((candidate) => (
          <label key={candidate} className={styles.segment}>
            <input
              type="radio"
              className={styles.segmentInput}
              name={groupName}
              value={candidate}
              checked={candidate === segment}
              onChange={(event) => {
                if (isStaffKitchenSegment(event.target.value)) {
                  onChoose(event.target.value);
                }
              }}
            />
            <span className={styles.segmentFace}>
              {copy.filters.segments[candidate]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SearchBox({
  searchRef,
  filters,
  searchProblem,
  typeSearch,
  submitSearch,
  clearSearch,
}: StaffKitchenFiltersProps) {
  const copy = useStaffKitchensCopy().filters;
  const inputId = useId();
  const problemId = useId();
  const problemText =
    searchProblem === "too-long"
      ? copy.searchTooLong(STAFF_KITCHEN_SEARCH_MAX_LENGTH)
      : copy.searchRefused;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearch();
  };
  return (
    <form
      role="search"
      className={styles.searchField}
      noValidate
      onSubmit={submit}
    >
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {copy.searchLabel}
      </label>
      <div
        className={styles.searchControl}
        data-invalid={searchProblem !== undefined}
      >
        <input
          ref={searchRef}
          id={inputId}
          type="search"
          className={styles.searchInput}
          value={filters.searchText}
          placeholder={copy.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-invalid={searchProblem === undefined ? undefined : true}
          aria-describedby={searchProblem === undefined ? undefined : problemId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            typeSearch(event.target.value);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submitSearch();
          }}
        />
        {filters.searchText === "" ? null : (
          <button
            type="button"
            className={styles.searchClear}
            aria-label={copy.searchClear}
            onClick={clearSearch}
          />
        )}
      </div>
      {searchProblem === undefined ? null : (
        <p id={problemId} role="alert" className={styles.fieldProblem}>
          {problemText}
        </p>
      )}
    </form>
  );
}

function StatusChoice({
  selectRef,
  isEnabled,
  status,
  onChoose,
}: {
  readonly selectRef: FilterFocusTargets["statusRef"];
  readonly isEnabled: boolean;
  readonly status: StaffKitchens["filters"]["status"];
  readonly onChoose: StaffKitchens["chooseStatus"];
}) {
  const copy = useStaffKitchensCopy();
  const selectId = useId();
  const hintId = useId();
  return (
    <div className={styles.statusField}>
      <label htmlFor={selectId} className={styles.fieldLabel}>
        {copy.filters.statusLabel}
      </label>
      <select
        ref={selectRef}
        id={selectId}
        className={styles.statusSelect}
        disabled={!isEnabled}
        aria-describedby={isEnabled ? undefined : hintId}
        value={status ?? ""}
        onChange={(event) => {
          const chosen = event.target.value;
          onChoose(isRequestStatus(chosen) ? chosen : null);
        }}
      >
        <option value="">{copy.filters.statusAll}</option>
        {REQUEST_STATUSES.map((candidate) => (
          <option key={candidate} value={candidate}>
            {copy.statuses[candidate]}
          </option>
        ))}
      </select>
      {isEnabled ? null : (
        <span id={hintId} className={styles.fieldHint}>
          {copy.filters.statusOnlyForSent}
        </span>
      )}
    </div>
  );
}
