"use client";

// §9's panel, rendered. Frames 2B and D2B on mobile and desktop respectively — one set of section
// components, two shells, and the shell is a CSS branch (`editor-panel.module.css`) rather than a
// React one. Nothing in this file can see the viewport, which is how §10.1's "branch on layout, not
// on logic" is enforced by construction rather than by review.
//
// No product rule lives here either. Every section, every disabled state and every sentence arrives
// already decided in the `PanelView` that `describePanel` produced; this file chooses markup.
import type { Finish } from "@lemnaria/configurator-domain";
import { FINISH_COLORS } from "@lemnaria/three-adapter";
import type { CSSProperties } from "react";

import { ro } from "@/content/ro";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./editor-panel.module.css";
import type {
  ChoiceChip,
  FinishSection,
  HandleSection,
  OfferRow,
  PanelFooter,
  PanelHeader,
  PanelNotice,
  PanelSection,
  PanelView,
  ReplaceSection,
  WidthSection,
} from "./panel-model";

/** The swatch colours are the adapter's own, published onto the shell as custom properties so the
 *  stylesheet paints exactly what the 3D materials are built from. A stylesheet cannot import a
 *  constant; this is the seam that lets it read one. */
const FINISH_SWATCH_COLORS = {
  "--finish-white": FINISH_COLORS.white,
  "--finish-clay": FINISH_COLORS.clay,
  "--finish-sage": FINISH_COLORS.sage,
  "--finish-graphite": FINISH_COLORS.graphite,
} as CSSProperties;

/** The `view` arrives as a prop rather than from `usePanelView` here, so that the screen above can
 *  gate frame 2A's instruction copy on the very same value: §9's open/closed rule then has one
 *  expression instead of two that can drift apart. */
export function EditorPanel({ view }: { readonly view: PanelView }) {
  const deselect = useConfiguratorStore((state) => state.deselect);

  // Frames 2A and D2A: with nothing selected there is no panel at all — the scene is full width and
  // carries the instruction copy itself.
  if (view.kind === "closed") return null;

  return (
    <aside
      className={styles.shell}
      style={FINISH_SWATCH_COLORS}
      data-testid="editor-panel"
    >
      <span className={styles.grabber} aria-hidden="true" />
      <PanelHeaderRow header={view.header} onClose={deselect} />
      <PanelNoticeRow notice={view.notice} />
      <div className={styles.body}>
        {view.sections.map((section) => (
          <PanelSectionView key={section.kind} section={section} />
        ))}
      </div>
      <PanelFooterRow footer={view.footer} onDone={deselect} />
    </aside>
  );
}

/** §9 puts a message beside the control that produced it, and this one was produced by the panel
 *  as a whole — so it sits directly under the header, above the scrolling body, where it cannot be
 *  scrolled past. `role="status"` rather than `alert` even for the failure: the edit is already
 *  applied and nothing is waiting on the customer.
 *
 *  Rendered **always**, empty when there is nothing to say. Many screen readers announce only
 *  *changes* to a live region that was already in the accessibility tree, so a region mounted at
 *  the same moment its first message appears can be announced late or not at all — and for a
 *  read-only customer this notice is the only thing explaining why nothing responds. Empty it
 *  collapses to nothing visible (`[data-empty="true"]`); it is not hidden, because `display: none`
 *  would take it back out of the tree and undo the whole point. */
function PanelNoticeRow({
  notice,
}: {
  readonly notice: PanelNotice | undefined;
}) {
  return (
    <p
      className={styles.notice}
      data-empty={notice ? "false" : "true"}
      data-tone={notice?.tone}
      data-notice={notice?.kind}
      role="status"
      data-testid="panel-notice"
    >
      {notice?.message ?? ""}
    </p>
  );
}

function PanelHeaderRow({
  header,
  onClose,
}: {
  readonly header: PanelHeader;
  readonly onClose: () => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <span className={styles.headerLabel} data-testid="panel-label">
          {header.label}
        </span>
        <span className={styles.headerDetail} data-testid="panel-detail">
          {header.detail}
        </span>
      </div>
      <button
        type="button"
        className={styles.close}
        data-testid="panel-close"
        aria-label={ro.panel.close}
        onClick={onClose}
      >
        ×
      </button>
    </header>
  );
}

function PanelSectionView({ section }: { readonly section: PanelSection }) {
  switch (section.kind) {
    case "rejection":
      return (
        <p
          className={styles.rejection}
          role="status"
          data-testid="panel-rejection"
        >
          <span className={styles.rejectionMark} aria-hidden="true">
            !
          </span>
          {section.message}
        </p>
      );
    case "structural":
      return (
        <section className={styles.section} data-testid="section-structural">
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>{section.title}</span>
          </div>
          <p className={styles.note}>{section.message}</p>
        </section>
      );
    case "replace":
      return <ReplaceSectionView section={section} />;
    case "finish":
      return <FinishSectionView section={section} />;
    case "handle":
      return <HandleSectionView section={section} />;
    case "width":
      return <WidthSectionView section={section} />;
  }
}

function ReplaceSectionView({ section }: { readonly section: ReplaceSection }) {
  const insert = useConfiguratorStore((state) => state.insert);
  return (
    <section className={styles.section} data-testid="section-replace">
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{section.title}</span>
        {section.countLine ? (
          <span className={styles.count} data-testid="replace-count">
            {section.countLine}
          </span>
        ) : null}
      </div>
      {/* §13.1: a row list, not a grid — at 390 px a row gives the name full width and makes the
          whole strip the tap target. No pagination anywhere; the slot knows its width and band. */}
      <ul className={styles.rows} data-testid="replace-rows">
        {section.rows.map((row) => (
          <OfferRowView key={row.buildId} row={row} onPick={insert} />
        ))}
      </ul>
      {section.emptyLine ? (
        <p className={styles.emptyLine} data-testid="replace-empty">
          {section.emptyLine}
        </p>
      ) : null}
    </section>
  );
}

function OfferRowView({
  row,
  onPick,
}: {
  readonly row: OfferRow;
  readonly onPick: (buildId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        data-testid={`offer-${row.buildId}`}
        data-current={row.isCurrent ? "true" : "false"}
        disabled={row.isDisabled}
        onClick={() => {
          onPick(row.buildId);
        }}
      >
        <span className={styles.rowText}>
          <span className={styles.rowName}>{row.label}</span>
          <span className={styles.rowMeta}>{row.secondaryLine}</span>
        </span>
        {row.isCurrent ? (
          <span className={styles.badge}>{ro.panel.currentBadge}</span>
        ) : null}
      </button>
    </li>
  );
}

function FinishSectionView({ section }: { readonly section: FinishSection }) {
  const setFinish = useConfiguratorStore((state) => state.setFinish);
  return (
    <section className={styles.section} data-testid="section-finish">
      <span className={styles.sectionTitle}>{section.title}</span>
      <div className={styles.chipRow}>
        {section.chips.map((chip) => (
          <SwatchButton key={chip.value} chip={chip} onPick={setFinish} />
        ))}
      </div>
      <p className={styles.note}>{section.note}</p>
    </section>
  );
}

function SwatchButton({
  chip,
  onPick,
}: {
  readonly chip: ChoiceChip<Finish>;
  readonly onPick: (finish: Finish) => void;
}) {
  return (
    <button
      type="button"
      className={styles.swatch}
      data-testid={`finish-${chip.value}`}
      aria-pressed={chip.isActive}
      disabled={chip.isDisabled}
      onClick={() => {
        onPick(chip.value);
      }}
    >
      <span className={styles.swatchColor} data-finish={chip.value} />
      <span className={styles.swatchLabel}>{chip.label}</span>
      <ChipReason reason={chip.reason} />
    </button>
  );
}

function HandleSectionView({ section }: { readonly section: HandleSection }) {
  const setHandle = useConfiguratorStore((state) => state.setHandle);
  return (
    <section className={styles.section} data-testid="section-handle">
      <span className={styles.sectionTitle}>{section.title}</span>
      <div className={styles.chipRow}>
        {section.chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={styles.chip}
            data-testid={`handle-${chip.value}`}
            aria-pressed={chip.isActive}
            disabled={chip.isDisabled}
            onClick={() => {
              setHandle(chip.value);
            }}
          >
            {chip.label}
            <ChipReason reason={chip.reason} />
          </button>
        ))}
      </div>
      {section.note ? <p className={styles.note}>{section.note}</p> : null}
    </section>
  );
}

/** §13.1's "greyed and unclickable, WITH the reason", for the two chip families that have no
 *  secondary line of their own to displace. The model decides whether there is a reason; this
 *  renders it. A disabled button is not focusable, so the reason has to be readable without
 *  reaching the control. */
function ChipReason({ reason }: { readonly reason: string | undefined }) {
  if (reason === undefined) return null;
  return <span className={styles.chipReason}>{reason}</span>;
}

/** §9's three chip states drive styling only — §13.1's "disable, don't warn" dashes a `blocked`
 *  chip. Which states are clickable is the model's answer (`isDisabled`), not this file's. */
function WidthSectionView({ section }: { readonly section: WidthSection }) {
  return (
    <section className={styles.section} data-testid="section-width">
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{section.title}</span>
        <span className={styles.widthValue}>{section.valueLabel}</span>
      </div>
      <div className={styles.chipRow}>
        {section.chips.map((chip) => (
          <button
            key={chip.widthMm}
            type="button"
            className={styles.widthChip}
            data-testid={`width-${String(chip.widthMm)}`}
            data-state={chip.state}
            aria-pressed={chip.state === "active"}
            disabled={chip.isDisabled}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <p className={styles.note}>{section.note}</p>
    </section>
  );
}

/** §10's viewing model: **Gata** and × are both *view* actions. Neither commits and neither
 *  cancels — every edit already applied the moment it was made — so both simply clear the
 *  selection, and there is no pending state for either to resolve. */
function PanelFooterRow({
  footer,
  onDone,
}: {
  readonly footer: PanelFooter;
  readonly onDone: () => void;
}) {
  const remove = useConfiguratorStore((state) => state.remove);
  return (
    <footer className={styles.footer}>
      {footer.canDelete && footer.removeDisabledReason !== undefined ? (
        <span className={styles.footerReason} data-testid="panel-remove-reason">
          {footer.removeDisabledReason}
        </span>
      ) : null}
      {footer.canDelete ? (
        <button
          type="button"
          className={styles.remove}
          data-testid="panel-remove"
          disabled={footer.isRemoveDisabled}
          onClick={remove}
        >
          {footer.removeLabel}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.done}
        data-testid="panel-done"
        onClick={onDone}
      >
        {footer.doneLabel}
      </button>
    </footer>
  );
}
