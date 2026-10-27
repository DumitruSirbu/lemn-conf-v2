"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import {
  freeColourFinish,
  paletteFinish,
  type Finish,
  type Handle,
} from "@lemnaria/configurator-domain";
import { swatchOf } from "@lemnaria/three-adapter";

import {
  resolveBookText,
  resolveFinishName,
  type ContentTranslator,
} from "@/i18n/content";

import styles from "./kitchen-defaults.module.css";
import {
  activeHandles,
  activeHardware,
  activeMaterials,
  colourOfferFor,
  depthOptions,
} from "./kitchen-defaults-model";
import type { KitchenDefaultsDesk } from "./use-kitchen-defaults";
import type { KitchenDefaultsMember } from "./price-dashboard-wire-contract";

// The six rows of D9, in the frame's order. Each is a labelled group of native radio buttons (the colour of an MDF kitchen,
// a free colour, is a native colour input), so the arrow keys, the touch targets and the names come from the platform.

interface RowOption {
  readonly value: string;
  readonly label: string;
  /** The colour of the dot before the label, for the colour row. */
  readonly swatchColour?: string;
}

export function KitchenDefaultsRows({
  desk,
}: {
  readonly desk: KitchenDefaultsDesk;
}) {
  return (
    <>
      <MaterialRow desk={desk} />
      <HardwareRow desk={desk} />
      <DepthRow desk={desk} />
      <ColourRow desk={desk} />
      <HandleRow desk={desk} member="handle" />
      <HandleRow desk={desk} member="topRowHandle" />
    </>
  );
}

function MaterialRow({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  const options = activeMaterials(desk.input).map((tier) => ({
    value: tier.tierId,
    label: resolveBookText(translate, tier.name, tier.nameKey),
  }));
  return (
    <ChoiceRow
      desk={desk}
      member="materialTierId"
      label={translate("priceDashboard.defaults.frontMaterial")}
      hint={translate("priceDashboard.defaults.frontMaterialHint")}
      options={options}
      selected={desk.draft.materialTierId}
      onChoose={desk.chooseMaterial}
    />
  );
}

function HardwareRow({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  const options = activeHardware(desk.input).map((tier) => ({
    value: tier.tierId,
    label: resolveBookText(translate, tier.name, tier.nameKey),
  }));
  return (
    <ChoiceRow
      desk={desk}
      member="hardwareTierId"
      label={translate("priceDashboard.defaults.hardware")}
      hint={translate("priceDashboard.defaults.hardwareHint")}
      options={options}
      selected={desk.draft.hardwareTierId}
      onChoose={(tierId) => {
        desk.choose("hardwareTierId", tierId);
      }}
    />
  );
}

function DepthRow({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  const unit = translate("priceDashboard.units.mm");
  const options = depthOptions().map((depthMm) => ({
    value: String(depthMm),
    label: `${String(depthMm)} ${unit}`,
  }));
  return (
    <ChoiceRow
      desk={desk}
      member="cabinetDepthMm"
      label={translate("priceDashboard.defaults.depth")}
      hint={translate("priceDashboard.defaults.depthHint")}
      options={options}
      selected={String(desk.draft.cabinetDepthMm)}
      onChoose={(depthMm) => {
        desk.choose("cabinetDepthMm", Number(depthMm));
      }}
    />
  );
}

function ColourRow({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  const noteId = useId();
  const offer = colourOfferFor(desk.input, desk.draft.materialTierId);
  const options =
    offer.kind === "palette"
      ? offer.entryIds.map((entryId) => ({
          value: entryId,
          label: resolveFinishName(translate, entryId),
          swatchColour: swatchOf(paletteFinish(entryId)).color,
        }))
      : [];
  const selected =
    desk.draft.finish.kind === "palette-entry"
      ? desk.draft.finish.entryId
      : undefined;
  return (
    <ChoiceRow
      desk={desk}
      member="finish"
      label={translate("priceDashboard.defaults.colour")}
      hint={translate("priceDashboard.defaults.colourHint")}
      options={options}
      selected={selected}
      onChoose={(value) => {
        const entryId =
          offer.kind === "palette"
            ? offer.entryIds.find((offered) => offered === value)
            : undefined;
        if (entryId !== undefined)
          desk.choose("finish", paletteFinish(entryId));
      }}
      describedBy={noteId}
      control={offer.kind === "free" ? <FreeColourPicker desk={desk} /> : null}
      aside={<ColourResetNote id={noteId} desk={desk} />}
    />
  );
}

function FreeColourPicker({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  const valueId = useId();
  const { finish } = desk.draft;
  const colour = finish.kind === "free-colour" ? finish.value : undefined;
  return (
    <span className={styles.freeColour}>
      <input
        type="color"
        className={styles.colourInput}
        aria-label={translate("priceDashboard.defaults.colour")}
        aria-describedby={valueId}
        value={colour ?? "#000000"}
        onChange={(event) => {
          desk.choose("finish", freeColourFinish(event.target.value));
        }}
      />
      <span id={valueId} className={styles.colourValue} dir="ltr">
        {colour ?? ""}
      </span>
    </span>
  );
}

/** D9B: the colour the new material does not have, and the one that takes its place. The region stays mounted, so the
 *  sentence is announced when it arrives. */
function ColourResetNote({
  id,
  desk,
}: {
  readonly id: string;
  readonly desk: KitchenDefaultsDesk;
}) {
  const translate = useTranslations();
  const { colourResetFrom } = desk;
  return (
    <p id={id} role="status" className={styles.resetNote}>
      {colourResetFrom === null
        ? null
        : translate("priceDashboard.defaults.colourReset", {
            unavailableColour: nameOfFinish(translate, colourResetFrom),
            replacementColour: nameOfFinish(translate, desk.draft.finish),
          })}
    </p>
  );
}

function nameOfFinish(translate: ContentTranslator, finish: Finish): string {
  return finish.kind === "palette-entry"
    ? resolveFinishName(translate, finish.entryId)
    : finish.value;
}

function HandleRow({
  desk,
  member,
}: {
  readonly desk: KitchenDefaultsDesk;
  readonly member: Extract<KitchenDefaultsMember, "handle" | "topRowHandle">;
}) {
  const translate = useTranslations();
  const labels: Readonly<Record<Handle, string>> = {
    steel: translate("panel.handleLabels.steel"),
    black: translate("panel.handleLabels.black"),
    push: translate("panel.handleLabels.push"),
  };
  const offered = activeHandles(desk.input);
  const options = offered.map((handle) => ({
    value: handle,
    label: labels[handle],
  }));
  const isTopRow = member === "topRowHandle";
  return (
    <ChoiceRow
      desk={desk}
      member={member}
      label={translate(
        isTopRow
          ? "priceDashboard.defaults.topRow"
          : "priceDashboard.defaults.handles",
      )}
      hint={translate(
        isTopRow
          ? "priceDashboard.defaults.topRowHint"
          : "priceDashboard.defaults.handlesHint",
      )}
      options={options}
      selected={desk.draft[member]}
      onChoose={(value) => {
        const handle = offered.find((candidate) => candidate === value);
        if (handle !== undefined) desk.choose(member, handle);
      }}
    />
  );
}

function ChoiceRow({
  desk,
  member,
  label,
  hint,
  options,
  selected,
  onChoose,
  describedBy,
  control,
  aside,
}: {
  readonly desk: KitchenDefaultsDesk;
  readonly member: KitchenDefaultsMember;
  readonly label: string;
  readonly hint: string;
  readonly options: readonly RowOption[];
  readonly selected: string | undefined;
  readonly onChoose: (value: string) => void;
  readonly describedBy?: string;
  /** A control that stands among the options, in their group: MDF's free colour. */
  readonly control?: ReactNode;
  /** What stands beside the group and is not one of its options. */
  readonly aside?: ReactNode;
}) {
  const translate = useTranslations();
  const ids = { label: useId(), hint: useId(), error: useId() };
  const isModified = desk.modified.has(member);
  const hasError = desk.unoffered.has(member);
  const description = [ids.hint, hasError ? ids.error : undefined, describedBy]
    .filter((id) => id !== undefined)
    .join(" ");
  return (
    <div className={styles.row} data-member={member} data-modified={isModified}>
      <div className={styles.rowHead}>
        <span id={ids.label} className={styles.rowLabel}>
          {label}
        </span>
        {isModified ? (
          <span className={styles.modifiedChip}>
            {translate("priceDashboard.defaults.modified")}
          </span>
        ) : null}
        <span id={ids.hint} className={styles.rowHint}>
          {hint}
        </span>
      </div>
      <div className={styles.rowBody}>
        <div
          role={options.length > 0 ? "radiogroup" : "group"}
          className={styles.options}
          aria-labelledby={ids.label}
          aria-describedby={description}
          aria-invalid={options.length > 0 ? hasError : undefined}
        >
          {options.map((option) => (
            <OptionButton
              key={option.value}
              member={member}
              option={option}
              isChecked={option.value === selected}
              onChoose={onChoose}
            />
          ))}
          {control}
        </div>
        {aside}
        {hasError ? (
          <p id={ids.error} role="alert" className={styles.rowError}>
            {translate("priceDashboard.defaults.itemUnavailable")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function OptionButton({
  member,
  option,
  isChecked,
  onChoose,
}: {
  readonly member: KitchenDefaultsMember;
  readonly option: RowOption;
  readonly isChecked: boolean;
  readonly onChoose: (value: string) => void;
}) {
  return (
    <label className={styles.option}>
      <input
        type="radio"
        className={styles.optionInput}
        name={member}
        value={option.value}
        checked={isChecked}
        onChange={() => {
          onChoose(option.value);
        }}
      />
      <span className={styles.optionFace}>
        {option.swatchColour === undefined ? null : (
          <span
            className={styles.swatch}
            style={{ backgroundColor: option.swatchColour }}
            aria-hidden="true"
          />
        )}
        {option.label}
      </span>
    </label>
  );
}
