"use client";

import { cameraPresetsForRoom } from "@lemnaria/three-adapter";
import { useMemo } from "react";

import {
  kitchenSummaryOf,
  type Design,
  type Finish,
  type PricedDesign,
  type WholeKitchenPriceLine,
} from "@lemnaria/configurator-domain";

import { describeKitchenPrice } from "@/account/kitchens/kitchen-summary";
import type { Content, StaffKitchenCopy } from "@/i18n/content";
import { useContent, useStaffKitchenCopy } from "@/i18n/use-content";
import { usePriceBookRoot } from "@/price/price-book-provider";
import { priceFloorOf, type PriceBookRoot } from "@/price/price-book-root";
import { KitchenPicture } from "@/review/review-scene";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { presetForRoom, type SceneView } from "@/scene/scene-view";
import { useWebGLSupport } from "@/scene/webgl-support";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import {
  useConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import styles from "./staff-kitchen.module.css";

// The first column of the staff kitchen page (frames S3B, S3C): the kitchen to look at, and what it is made of.
//
// The view is the review's own picture, `KitchenPicture` over the view-only canvas: it mounts no orbit controls and picks
// nothing, so no gesture on it can select a body or change the document, and it mounts no editor screen (the single-mount
// guard keeps those to the two doors that own one, and this is not a third). The store it draws from is the share view's
// arrangement: a design hydrated under a sentinel id, `canWrite: false`, in the browser only.

/** Never a real design id (those are 21 characters), so nothing downstream can mistake this session's store for a
 *  kitchen's own. */
const STAFF_VIEW_DESIGN_ID = "staff-view";

/** No row backs this session, so there is no revision a save could state; `canWrite: false` keeps one from being tried. */
const STAFF_VIEW_REVISION = "staff-view";

const WALL_JOINER = " × ";

export interface StaffKitchenViewProps {
  readonly design: Design;
  /** The design is the kitchen as it stands now, not as it was sent, and the view says so beside the picture. */
  readonly isCurrentVariantOfSent: boolean;
}

/**
 * Hydrates during render, in the browser only, as the share view does, and guarded by the design object: two kitchens are
 * two mounts (the page keys it by the kitchen's id), never a rerender of one instance, so the render-time `hydrate()` does
 * not write a store during another component's render.
 */
export function StaffKitchenView({
  design,
  isCurrentVariantOfSent,
}: StaffKitchenViewProps) {
  const loaded = {
    design,
    designId: STAFF_VIEW_DESIGN_ID,
    revision: STAFF_VIEW_REVISION,
    canWrite: false,
  } as const;
  hydrateSessionStoreInBrowser(loaded, holdsThisReadOnlyView(design));
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <KitchenScene isCurrentVariantOfSent={isCurrentVariantOfSent} />
    </ConfiguratorSnapshotProvider>
  );
}

/** The store already holds this very view: the same document, under the sentinel, unable to write. A store that holds the
 *  same document in any other state (the editor's own seed, a writable copy) is not this view and is replaced. */
function holdsThisReadOnlyView(design: Design) {
  return (session: ConfiguratorState): boolean =>
    session.design === design &&
    session.designId === STAFF_VIEW_DESIGN_ID &&
    session.canWrite === false;
}

function KitchenScene({
  isCurrentVariantOfSent,
}: {
  readonly isCurrentVariantOfSent: boolean;
}) {
  const copy = useStaffKitchenCopy();
  const content = useContent();
  const support = useWebGLSupport();
  const room = useConfiguratorStore((state) => state.design.room);
  const presetId = useCameraPreset((state) => state.presetId);
  const standAt = useCameraPreset((state) => state.standAt);
  const view = useMemo<SceneView>(
    () => ({ kind: "preset", id: presetId }),
    [presetId],
  );
  const cameraPresets = useMemo(() => cameraPresetsForRoom(room), [room]);
  // The stored id may be one this room has outgrown; the button pressed is the one the scene actually frames.
  const resolvedPresetId = useMemo(
    () => presetForRoom(presetId, room).id,
    [presetId, room],
  );

  return (
    <section
      className={styles.view}
      aria-label={copy.view.label}
      data-testid="staff-kitchen-view"
    >
      <div className={styles.picture}>
        {support === "unsupported" ? (
          <p className={styles.sceneNote}>{copy.view.noWebGl}</p>
        ) : (
          <KitchenPicture
            support={support}
            view={view}
            fallback={
              <div className={styles.sceneNote}>
                {content.configure.loading}
              </div>
            }
          />
        )}
        <span className={styles.viewBadges}>
          <span className={styles.viewBadge}>{copy.view.readOnly}</span>
          {isCurrentVariantOfSent ? (
            <span
              className={styles.viewBadge}
              data-kind="current"
              data-testid="staff-kitchen-current-variant"
            >
              {copy.view.current}
            </span>
          ) : null}
        </span>
      </div>
      {support === "unsupported" ? null : (
        <div
          className={styles.cameraChips}
          role="group"
          aria-label={content.configure.cameraGroupLabel}
        >
          {cameraPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.cameraChip}
              aria-pressed={preset.id === resolvedPresetId}
              onClick={() => {
                standAt(preset.id);
              }}
            >
              {content.configure.cameraPresets[preset.id]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** One line of the summary: the label, the value the person reads and, under the price, the flagged total's sentence. */
export interface StaffSummaryRow {
  readonly key:
    | "shape"
    | "walls"
    | "material"
    | "hardware"
    | "finish"
    | "bodies"
    | "price";
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
}

/**
 * What the design is made of, as the rows of the frames' "Configurația trimisă" card. Every value is a word the
 * configurator already says of the same fact (the room's shape, the palette's finish name, the price book's tier names),
 * and the price is the starting figure of the kitchen as it stands, by the one rule of every price surface. A fact
 * that cannot be told (a kitchen the price book refuses, a design with no default colour) is `noValue`.
 */
export function describeStaffSummaryRows({
  design,
  priceBook,
  copy,
  content,
  noValue,
}: {
  readonly design: Design;
  readonly priceBook: PriceBookRoot;
  readonly copy: StaffKitchenCopy;
  readonly content: Content;
  readonly noValue: string;
}): readonly StaffSummaryRow[] {
  const facts = kitchenSummaryOf(design);
  const priced = priceFloorOf(priceBook, design);
  const price = describeKitchenPrice(priced, content.price);
  const { summary } = copy;
  return [
    {
      key: "shape",
      label: summary.shape,
      value: summary.shapeName(facts.shape),
    },
    {
      key: "walls",
      label: summary.walls,
      value: summary.wallsValue(facts.wallsMm.join(WALL_JOINER)),
    },
    {
      key: "material",
      label: summary.material,
      value: tierNameOf(priced, "material", content) ?? noValue,
    },
    {
      key: "hardware",
      label: summary.hardware,
      value: tierNameOf(priced, "hardware", content) ?? noValue,
    },
    {
      key: "finish",
      label: summary.finish,
      value: finishNameOf(facts.finish, content) ?? noValue,
    },
    {
      key: "bodies",
      label: summary.bodies,
      value: String(design.placements.length),
    },
    {
      key: "price",
      label: summary.price,
      value:
        price === undefined
          ? noValue
          : `${price.figure.label} ${price.figure.amountText}`,
      ...(price?.overflowWarning === undefined
        ? {}
        : { sub: price.overflowWarning }),
    },
  ];
}

function tierNameOf(
  priced: PricedDesign | undefined,
  kind: WholeKitchenPriceLine["kind"],
  content: Content,
): string | undefined {
  const line = priced?.lines.find(
    (candidate): candidate is WholeKitchenPriceLine => candidate.kind === kind,
  );
  return line === undefined
    ? undefined
    : content.bookText(line.name, line.nameKey);
}

function finishNameOf(
  finish: Finish | undefined,
  content: Content,
): string | undefined {
  if (finish === undefined) return undefined;
  return finish.kind === "palette-entry"
    ? content.finishName(finish.entryId)
    : content.globalSettings.pillColourValue(finish.value);
}

/** The card under the picture. `title` says which copy of the kitchen it describes. */
export function StaffKitchenSummary({
  design,
  title,
  noValue,
}: {
  readonly design: Design;
  readonly title: string;
  readonly noValue: string;
}) {
  const copy = useStaffKitchenCopy();
  const content = useContent();
  const priceBook = usePriceBookRoot();
  const rows = useMemo(
    () =>
      describeStaffSummaryRows({ design, priceBook, copy, content, noValue }),
    [design, priceBook, copy, content, noValue],
  );
  return (
    <section
      className={styles.card}
      aria-labelledby="staff-kitchen-summary-title"
      data-testid="staff-kitchen-summary"
    >
      <h2 id="staff-kitchen-summary-title" className={styles.cardTitle}>
        {title}
      </h2>
      <dl className={styles.facts}>
        {rows.map((row) => (
          <div key={row.key} className={styles.fact} data-fact={row.key}>
            <dt className={styles.factLabel}>{row.label}</dt>
            <dd className={styles.factValue}>
              {row.value}
              {row.sub === undefined ? null : (
                <span className={styles.factSub}>{row.sub}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.cardNote}>{copy.summary.priceNote}</p>
    </section>
  );
}
