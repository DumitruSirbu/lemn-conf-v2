"use client";

import { useEffect, useId, useMemo, useState } from "react";

import type { Design } from "@lemnaria/configurator-domain";

import { useContent, useStaffChangesCopy } from "@/i18n/use-content";

import {
  holdsDifferingRows,
  versionRowsOf,
  type KitchenVersion,
  type KitchenVersions,
  type VersionRow,
} from "./kitchen-version-rows";
import styles from "./kitchen-version-switch.module.css";
import { StaffKitchenView } from "./staff-kitchen-view";

// "Trimisă" and "Actuală" (frame D10B): which copy of the kitchen the picture, the cabinet list and the summary show,
// and the list that marks the bodies the two copies do not share. The words of each choice are told by the page, which
// knows the dates.

const VERSIONS: readonly KitchenVersion[] = ["sent", "current"];

export interface KitchenVersionSwitchProps {
  readonly shown: KitchenVersion;
  readonly onChoose: (version: KitchenVersion) => void;
  readonly labels: Readonly<Record<KitchenVersion, string>>;
}

export function KitchenVersionSwitch({
  shown,
  onChoose,
  labels,
}: KitchenVersionSwitchProps) {
  const copy = useStaffChangesCopy();
  const groupName = useId();
  return (
    <fieldset className={styles.switch} data-testid="staff-kitchen-versions">
      <legend className={styles.legend}>{copy.version.label}</legend>
      <div className={styles.row}>
        {VERSIONS.map((version) => (
          <label key={version} className={styles.choice}>
            <input
              type="radio"
              className={styles.input}
              name={groupName}
              value={version}
              checked={version === shown}
              onChange={() => {
                onChoose(version);
              }}
            />
            <span className={styles.face}>{labels[version]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The picture of the copy on screen. The view hydrates its store while it renders, so the picture of the other copy is
 * taken off the page in one commit and this copy's drawn in the next: two views mounted at once would write the store
 * under each other's feet, and a change of the document under one mount is not something the view supports.
 */
export function VersionedKitchenView({
  design,
  isCurrentVariantOfSent,
}: {
  readonly design: Design;
  readonly isCurrentVariantOfSent: boolean;
}) {
  const [drawn, setDrawn] = useState(design);
  useEffect(() => {
    setDrawn(design);
  }, [design]);
  if (drawn !== design) return null;
  return (
    <StaffKitchenView
      design={design}
      isCurrentVariantOfSent={isCurrentVariantOfSent}
    />
  );
}

export function KitchenVersionCabinets({
  versions,
  shown,
}: {
  readonly versions: KitchenVersions;
  readonly shown: KitchenVersion;
}) {
  const copy = useStaffChangesCopy().cabinets;
  const content = useContent();
  const rows = useMemo(
    () => versionRowsOf({ versions, shown, content }),
    [versions, shown, content],
  );
  if (rows === undefined) {
    return (
      <p className={styles.unavailable} data-testid="staff-kitchen-cabinets">
        {copy.unavailable}
      </p>
    );
  }
  return (
    <div className={styles.cabinets} data-testid="staff-kitchen-cabinets">
      <table className={styles.table} aria-label={copy.tableLabel}>
        <thead>
          <tr>
            <th scope="col">{copy.columnBody}</th>
            <th scope="col">{copy.columnSize}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CabinetRow key={row.placementId} row={row} />
          ))}
        </tbody>
      </table>
      {holdsDifferingRows(rows) ? (
        <p className={styles.note}>{copy.highlightNote}</p>
      ) : null}
    </div>
  );
}

function CabinetRow({ row }: { readonly row: VersionRow }) {
  const copy = useStaffChangesCopy().cabinets;
  const marks = {
    same: undefined,
    differs: copy.differs,
    added: copy.added,
    removed: copy.removed,
  } as const;
  const mark = marks[row.change];
  return (
    <tr data-testid="staff-kitchen-cabinet" data-change={row.change}>
      <th scope="row">
        <span className={styles.name}>{row.name}</span>
        {mark === undefined ? null : (
          <span className={styles.mark}>{mark}</span>
        )}
      </th>
      <td>{copy.size(row.size)}</td>
    </tr>
  );
}
