"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useId, type ReactNode } from "react";

import {
  freeColourFinish,
  lookUpMaterial,
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

/** What names a row: the member it sets, its label and its hint. */
interface RowIdentity {
  readonly member: KitchenDefaultsMember;
  readonly label: string;
  readonly hint: string;
}

/** What a control that is not a radio needs of its row to be tied to the row's error. */
interface RowErrorField {
  readonly isInvalid: boolean;
  /** The id of the row's error, or empty while it has none. */
  readonly errorId: string;
}

const RowErrorFieldContext = createContext<RowErrorField>({
  isInvalid: false,
  errorId: "",
});

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
      row={{
        member: "materialTierId",
        label: translate("priceDashboard.defaults.frontMaterial"),
        hint: translate("priceDashboard.defaults.frontMaterialHint"),
      }}
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
      row={{
        member: "hardwareTierId",
        label: translate("priceDashboard.defaults.hardware"),
        hint: translate("priceDashboard.defaults.hardwareHint"),
      }}
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
      row={{
        member: "cabinetDepthMm",
        label: translate("priceDashboard.defaults.depth"),
        hint: translate("priceDashboard.defaults.depthHint"),
      }}
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
  const offer = colourOfferFor(desk.input, desk.draft.materialTierId);
  const { colourResetFrom, draft } = desk;
  const seed = freeColourSeedOf(draft.materialTierId);
  const options =
    offer.kind === "palette"
      ? offer.entryIds.map((entryId) => ({
          value: entryId,
          label: resolveFinishName(translate, entryId),
          swatchColour: swatchOf(paletteFinish(entryId)).color,
        }))
      : unsetFreeColourOptions(offer.kind, seed, draft.finish);
  const selected =
    draft.finish.kind === "palette-entry" ? draft.finish.entryId : undefined;
  return (
    <ChoiceRow
      desk={desk}
      row={{
        member: "finish",
        label: translate("priceDashboard.defaults.colour"),
        hint: translate("priceDashboard.defaults.colourHint"),
      }}
      options={options}
      selected={selected}
      onChoose={(value) => {
        if (offer.kind === "free") {
          desk.choose("finish", freeColourFinish(value));
          return;
        }
        const entryId =
          offer.kind === "palette"
            ? offer.entryIds.find((offered) => offered === value)
            : undefined;
        if (entryId !== undefined)
          desk.choose("finish", paletteFinish(entryId));
      }}
      resetNote={
        colourResetFrom === null
          ? null
          : translate("priceDashboard.defaults.colourReset", {
              unavailableColour: nameOfFinish(translate, colourResetFrom),
              replacementColour: nameOfFinish(translate, draft.finish),
            })
      }
    >
      {offer.kind === "free" && seed !== undefined ? (
        <FreeColourPicker desk={desk} seed={seed} />
      ) : null}
    </ChoiceRow>
  );
}

/**
 * A colour input always shows a colour, and choosing the one it shows fires nothing. While the kitchen holds no free colour
 * the input shows the material's default, so that colour is offered as an option beside it and every other colour is
 * the input's to emit.
 */
function unsetFreeColourOptions(
  offerKind: "palette" | "free" | "none",
  seed: string | undefined,
  held: Finish,
): readonly RowOption[] {
  if (offerKind !== "free" || seed === undefined) return [];
  if (held.kind === "free-colour") return [];
  return [{ value: seed, label: seed, swatchColour: seed }];
}

function freeColourSeedOf(materialTierId: string): string | undefined {
  const lookup = lookUpMaterial(materialTierId);
  if (lookup.kind === "undeclared") return undefined;
  const { defaultFinish } = lookup.material;
  return defaultFinish.kind === "free-colour" ? defaultFinish.value : undefined;
}

function FreeColourPicker({
  desk,
  seed,
}: {
  readonly desk: KitchenDefaultsDesk;
  /** What the input shows while the kitchen holds no free colour. */
  readonly seed: string;
}) {
  const translate = useTranslations();
  const readoutId = useId();
  const field = useContext(RowErrorFieldContext);
  const { finish } = desk.draft;
  const colour = finish.kind === "free-colour" ? finish.value : seed;
  return (
    <span className={styles.freeColour}>
      <input
        type="color"
        className={styles.colourInput}
        aria-label={translate("priceDashboard.defaults.colour")}
        aria-describedby={[readoutId, field.errorId].join(" ").trim()}
        aria-invalid={field.isInvalid}
        value={colour}
        onChange={(event) => {
          desk.choose("finish", freeColourFinish(event.target.value));
        }}
      />
      <span id={readoutId} className={styles.colourValue} dir="ltr">
        {finish.kind === "free-colour" ? finish.value : ""}
      </span>
    </span>
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
      row={{
        member,
        label: translate(
          isTopRow
            ? "priceDashboard.defaults.topRow"
            : "priceDashboard.defaults.handles",
        ),
        hint: translate(
          isTopRow
            ? "priceDashboard.defaults.topRowHint"
            : "priceDashboard.defaults.handlesHint",
        ),
      }}
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
  row,
  options,
  selected,
  onChoose,
  resetNote,
  children,
}: {
  readonly desk: KitchenDefaultsDesk;
  readonly row: RowIdentity;
  readonly options: readonly RowOption[];
  readonly selected: string | undefined;
  readonly onChoose: (value: string) => void;
  /** The sentence about a colour the last change took away, or null while there is none. Absent for a row with no such
   *  note; where present its region stays in the page, so the sentence is announced when it arrives. */
  readonly resetNote?: string | null;
  /** A control among the options, inside their group. */
  readonly children?: ReactNode;
}) {
  const translate = useTranslations();
  const ids = { label: useId(), hint: useId(), error: useId(), note: useId() };
  const { member } = row;
  const isModified = desk.modified.has(member);
  const hasError = desk.unoffered.has(member);
  const hasNote = resetNote !== undefined;
  const description = [
    ids.hint,
    hasError ? ids.error : undefined,
    hasNote ? ids.note : undefined,
  ]
    .filter((id) => id !== undefined)
    .join(" ");
  const hasRadios = options.length > 0;
  const field: RowErrorField = {
    isInvalid: hasError,
    errorId: hasError ? ids.error : "",
  };
  return (
    <div className={styles.row} data-member={member} data-modified={isModified}>
      <div className={styles.rowHead}>
        <span id={ids.label} className={styles.rowLabel}>
          {row.label}
        </span>
        {isModified ? (
          <span className={styles.modifiedChip}>
            {translate("priceDashboard.defaults.modified")}
          </span>
        ) : null}
        <span id={ids.hint} className={styles.rowHint}>
          {row.hint}
        </span>
      </div>
      <div className={styles.rowBody}>
        <div
          role={hasRadios ? "radiogroup" : "group"}
          className={styles.options}
          aria-labelledby={ids.label}
          aria-describedby={description}
          aria-invalid={hasRadios ? hasError : undefined}
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
          <RowErrorFieldContext value={field}>{children}</RowErrorFieldContext>
        </div>
        {hasNote ? (
          <p id={ids.note} role="status" className={styles.resetNote}>
            {resetNote}
          </p>
        ) : null}
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
