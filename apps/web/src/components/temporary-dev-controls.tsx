"use client";

import {
  describeSelection,
  FinishSchema,
  HandleSchema,
  offersFor,
  type CatalogOffer,
  type Finish,
  type Handle,
  type SelectionMeta,
} from "@lemnaria/configurator-domain";
import { useMemo, useState } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./temporary-dev-controls.module.css";

/**
 * TEMPORARY — DELETED BY M4. Scaffolding, not a prototype of M4's panel.
 *
 * M3 ships four verbs (`remove`, `insert`, `setFinish`, `setHandle`) and no surface to drive them
 * from: §9's panel is M4's work item. This is the stand-in that lets the verbs be exercised — by
 * the mobile gate of `docs/milestones/M3-mutations.md` "Surfaces", and by hand — until that panel
 * exists. It is deliberately unbranded, uses developer English rather than `content/ro.ts`, and
 * makes no attempt at the mockup: nothing here is a design decision M4 should inherit, and
 * anything that looked designed would invite exactly that.
 *
 * It invents no product behaviour. Rows come from `offersFor` — already the fit-filtered §9 list,
 * so "never offer what cannot be satisfied" holds without a rule restated here — and every
 * disabled state is read off `describeSelection`'s `meta` rather than decided locally. `insert` is
 * additionally gated on `isBodyProbeAttached`, which exists precisely so a control is disabled
 * before the scene is ready instead of offered and then refused.
 *
 * The readout is developer-facing, not customer-facing. `saveStatus` is shown here as a bare
 * status word inside this panel and nowhere else: which surface communicates a failed write is
 * M4's open question, and M3 must not invent a banner M4 would have to remove.
 *
 * Collapsed by default so the canvas stays unobstructed — the picking gate taps the canvas at
 * recorded pixel positions, and a panel over the scene would silently eat them.
 */
export function TemporaryDevControls() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.root} data-testid="dev-controls-root">
      <button
        type="button"
        className={styles.toggle}
        data-testid="dev-controls-toggle"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((wasOpen) => !wasOpen);
        }}
      >
        {isOpen ? "close dev" : "dev"}
      </button>
      {isOpen ? <DevControlPanel /> : null}
    </div>
  );
}

function DevControlPanel() {
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  const remove = useConfiguratorStore((state) => state.remove);
  const insert = useConfiguratorStore((state) => state.insert);

  return (
    <section className={styles.panel} data-testid="dev-controls">
      <DevReadout meta={meta} />
      <button
        type="button"
        className={styles.action}
        data-testid="dev-remove"
        disabled={!meta?.canDelete}
        onClick={remove}
      >
        remove
      </button>
      <DevOfferList
        offers={isBodyProbeAttached ? offers : []}
        onInsert={insert}
      />
      <DevAppearanceRows meta={meta} />
    </section>
  );
}

/** The panel's entire input, exactly as §8 specifies it — `undefined` when nothing resolves. */
function useSelectionMeta(): SelectionMeta | undefined {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);

  return useMemo(
    () =>
      selection
        ? describeSelection({ records, voids, catalog, target: selection })
        : undefined,
    [records, voids, catalog, selection],
  );
}

function useSelectionOffers(): CatalogOffer[] {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  const columns = useConfiguratorStore((state) => state.columns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);

  return useMemo(
    () =>
      selection
        ? offersFor({ records, voids, columns, catalog, target: selection })
        : [],
    [records, voids, columns, catalog, selection],
  );
}

/** Developer-visible only. The rejection is shown as its stable **code**, never its rendered
 *  Romanian sentence: that sentence is §9's banner copy and belongs to the surface M4 chooses. */
function DevReadout({ meta }: { meta: SelectionMeta | undefined }) {
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const designId = useConfiguratorStore((state) => state.designId);
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  const lastRejection = useConfiguratorStore((state) => state.lastRejection);

  return (
    <p
      className={styles.readout}
      data-testid="dev-readout"
      data-meta-kind={meta?.kind ?? ""}
      data-selection-id={meta?.id ?? ""}
      data-open-w-mm={meta ? String(meta.openWmm) : ""}
      data-open-h-mm={meta ? String(meta.openHmm) : ""}
      data-span-h-mm={meta ? String(meta.spanHmm) : ""}
      data-save-status={saveStatus}
      data-design-id={designId ?? ""}
      data-probe={isBodyProbeAttached ? "on" : "off"}
      data-rejection={lastRejection?.code ?? ""}
    >
      {meta ? describeMetaForDeveloper(meta) : "selection: none"}
      <br />
      {`probe ${isBodyProbeAttached ? "on" : "off"} · save ${saveStatus} · design ${designId ?? "unminted"} · refused ${lastRejection?.code ?? "—"}`}
    </p>
  );
}

function describeMetaForDeveloper(meta: SelectionMeta): string {
  const size = `${String(meta.openWmm)}×${String(meta.openHmm)}`;
  return `${meta.kind} ${meta.id} · ${meta.label} · ${size} · span ${String(meta.spanHmm)} · ${meta.bandLabel}`;
}

interface DevOfferListProps {
  readonly offers: readonly CatalogOffer[];
  readonly onInsert: (buildId: string) => void;
}

function DevOfferList({ offers, onInsert }: DevOfferListProps) {
  if (offers.length === 0) return null;
  return (
    <ul className={styles.offers} data-testid="dev-offers">
      {offers.map((offer) => (
        <li key={offer.buildId}>
          <button
            type="button"
            className={styles.action}
            data-testid={`dev-insert-${offer.buildId}`}
            onClick={() => {
              onInsert(offer.buildId);
            }}
          >
            {`${offer.buildId} ${String(offer.widthMm)}×${String(offer.heightMm)}${offer.isCurrent ? " (actual)" : ""}`}
          </button>
        </li>
      ))}
    </ul>
  );
}

function DevAppearanceRows({ meta }: { meta: SelectionMeta | undefined }) {
  const setFinish = useConfiguratorStore((state) => state.setFinish);
  const setHandle = useConfiguratorStore((state) => state.setHandle);

  return (
    <>
      <div className={styles.row}>
        {FinishSchema.options.map((finish: Finish) => (
          <button
            key={finish}
            type="button"
            className={styles.action}
            data-testid={`dev-finish-${finish}`}
            disabled={!meta?.canFinish}
            onClick={() => {
              setFinish(finish);
            }}
          >
            {finish}
          </button>
        ))}
      </div>
      <div className={styles.row}>
        {HandleSchema.options.map((handle: Handle) => (
          <button
            key={handle}
            type="button"
            className={styles.action}
            data-testid={`dev-handle-${handle}`}
            disabled={!meta?.canHandle}
            onClick={() => {
              setHandle(handle);
            }}
          >
            {handle}
          </button>
        ))}
      </div>
    </>
  );
}
