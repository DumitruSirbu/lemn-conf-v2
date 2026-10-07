"use client";

// §9's panel: one set of section components, two shells, the shell being a CSS branch
// (`editor-panel.module.css`), so nothing here can see the viewport. No product rule lives here:
// every section, disabled state and sentence arrives decided in the `PanelView`.
import { freeColourFinish, type Finish } from "@lemnaria/configurator-domain";
import type { CSSProperties } from "react";

import { useContent } from "@/i18n/use-content";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./editor-panel.module.css";
import type {
  FinishChip,
  FinishSection,
  FollowTheKitchenChip,
  HandleSection,
  OfferRow,
  PanelFooter,
  PanelHeader,
  PanelNotice,
  PanelNoticeAction,
  PanelSection,
  PanelView,
  PaletteSwatchSection,
  RalPickerSection,
  ReplaceSection,
  WidthChoiceSection,
  WidthSection,
  WidthStepButton,
  WidthStepperSection,
} from "./panel-model";

/** `view` is a prop so the screen above gates its instruction copy on the same value: §9's
 *  open/closed rule keeps one expression. */
export function EditorPanel({ view }: { readonly view: PanelView }) {
  const deselect = useConfiguratorStore((state) => state.deselect);

  if (view.kind === "closed") return null;

  return (
    <aside className={styles.shell} data-testid="editor-panel">
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

/** The panel-wide message, under the header and above the scrolling body. `role="status"`, not
 *  `alert`: the edit is already applied.
 *
 *  Always rendered, empty when silent: a live region mounted with its first message can be announced
 *  late or not at all. Empty it collapses (`[data-empty="true"]`) and must never be `display: none`,
 *  which would remove it from the accessibility tree.
 *
 *  The action buttons sit inside the live region on purpose: retry changes the sentence beside it,
 *  and that re-announcement is a screen-reader user's only confirmation the press happened. */
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
      {notice?.actions?.map((action) => (
        <PanelNoticeButton key={action.kind} action={action} />
      ))}
    </p>
  );
}

const NOTICE_ACTION_TEST_IDS: Record<PanelNoticeAction["kind"], string> = {
  "retry-access-check": "panel-access-retry",
  "reload-stored": "panel-conflict-reload",
  "overwrite-stored": "panel-conflict-overwrite",
};

function PanelNoticeButton({ action }: { readonly action: PanelNoticeAction }) {
  const performNoticeAction = useNoticeActions();
  return (
    <button
      type="button"
      className={styles.noticeAction}
      data-testid={NOTICE_ACTION_TEST_IDS[action.kind]}
      onClick={() => {
        performNoticeAction(action.kind);
      }}
    >
      {action.label}
    </button>
  );
}

/** `reload-stored` is `location.reload()`, not a store action: it discards this browser's unsaved
 *  design, and modelling it as state would imply the store survives it. */
function useNoticeActions(): (kind: PanelNoticeAction["kind"]) => void {
  const retryWriteAccessCheck = useConfiguratorStore(
    (state) => state.retryWriteAccessCheck,
  );
  const overwriteConflict = useConfiguratorStore(
    (state) => state.overwriteConflict,
  );
  return (kind) => {
    if (kind === "retry-access-check") retryWriteAccessCheck();
    else if (kind === "overwrite-stored") overwriteConflict();
    else window.location.reload();
  };
}

function PanelHeaderRow({
  header,
  onClose,
}: {
  readonly header: PanelHeader;
  readonly onClose: () => void;
}) {
  const content = useContent();
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
        aria-label={content.panel.close}
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
      return <CabinetFinishSection section={section} />;
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
      {/* §13.1: a row list, not a grid; at 390 px the whole strip is the tap target. */}
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
  const content = useContent();
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
        <OfferThumbnail url={row.thumbnailUrl} />
        <span className={styles.rowText}>
          <span className={styles.rowName}>{row.label}</span>
          <span className={styles.rowMeta}>{row.secondaryLine}</span>
        </span>
        {row.isCurrent ? (
          <span className={styles.badge}>{content.panel.currentBadge}</span>
        ) : null}
      </button>
    </li>
  );
}

/** §13.4 requires a CSS `background-image`, not an `<img>`: an unresolved value paints an empty tile,
 *  where an `<img>` fires a failed request and shows a broken-image glyph. Decorative, so
 *  `aria-hidden`: the row already names the cabinet. */
function OfferThumbnail({ url }: { readonly url: string | undefined }) {
  return (
    <span
      className={styles.rowThumb}
      style={
        url === undefined ? undefined : { backgroundImage: `url("${url}")` }
      }
      data-testid="row-thumb"
      aria-hidden="true"
    />
  );
}

/** The shared colour control wired to the per-placement command; the store read lives here because
 *  the global settings sheet renders the same control against a pending choice (ADR 0099 decision 9). */
function CabinetFinishSection({
  section,
}: {
  readonly section: FinishSection;
}) {
  const setFinish = useConfiguratorStore((state) => state.setFinish);
  const clearFinish = useConfiguratorStore((state) => state.clearFinish);
  return (
    <FinishSectionView
      section={section}
      onPick={setFinish}
      onFollow={clearFinish}
    />
  );
}

/** ADR 0071 decision 3's three controls, chosen by `section.control` (from the material's
 *  declaration); nothing here may count chips. Exported for the global settings sheet (ADR 0099
 *  decision 9): it reads no store, because what a press writes is the caller's. */
export function FinishSectionView({
  section,
  onPick,
  onFollow,
}: {
  readonly section: FinishSection;
  readonly onPick: (finish: Finish) => void;
  /** ADR 0099 decision 8's press. Absent on the global settings sheet, which is that level, where
   *  `section.follow` is absent too. */
  readonly onFollow?: () => void;
}) {
  const follow =
    section.follow !== undefined && onFollow !== undefined
      ? { chip: section.follow, onFollow }
      : undefined;
  return section.control === "ral-picker" ? (
    <RalPickerView
      section={section}
      onPick={onPick}
      {...(follow === undefined ? {} : { follow })}
    />
  ) : (
    <PaletteSwatchView
      section={section}
      onPick={onPick}
      {...(follow === undefined ? {} : { follow })}
    />
  );
}

/** The chip and its press, which arrive together or not at all. */
interface FollowTheKitchenStep {
  readonly chip: FollowTheKitchenChip;
  readonly onFollow: () => void;
}

/** ADR 0099 decision 8's reset, on its own full-width row under the colour control, never inside the
 *  scrolling chip row where it could scroll out of sight. It uses `.followRow`, not `.swatch`, so
 *  swatch styling cannot make it look like a colour. */
function FollowTheKitchenButton({
  step,
}: {
  readonly step: FollowTheKitchenStep;
}) {
  return (
    <button
      type="button"
      className={styles.followRow}
      data-testid="finish-follow-kitchen"
      data-follow="true"
      aria-pressed={step.chip.isActive}
      disabled={step.chip.isDisabled}
      onClick={step.onFollow}
    >
      <span className={styles.followRowLabel}>{step.chip.label}</span>
      <ChipReason reason={step.chip.reason} />
    </button>
  );
}

/** PAL's decors and veneer's two woods: one projection, two layouts (a full-width list, a side-by-side pair). */
function PaletteSwatchView({
  section,
  onPick,
  follow,
}: {
  readonly section: PaletteSwatchSection;
  readonly onPick: (finish: Finish) => void;
  readonly follow?: FollowTheKitchenStep;
}) {
  return (
    <section
      className={styles.section}
      data-testid="section-finish"
      data-finish-control={section.control}
    >
      <span className={styles.sectionTitle}>{section.title}</span>
      <div
        // Chosen from the declared shape, never from how many chips arrived.
        className={
          section.control === "decor-list" ? styles.chipRow : styles.woodPair
        }
        data-testid="colour-options"
      >
        {section.chips.map((chip) => (
          <SwatchButton key={chip.value} chip={chip} onPick={onPick} />
        ))}
      </div>
      {/* Outside `colour-options` so the way back does not scroll away with the colours. */}
      {follow === undefined ? null : <FollowTheKitchenButton step={follow} />}
      <p className={styles.note}>{section.note}</p>
    </section>
  );
}

/** Paints from the adapter's hex, published as a custom property because a stylesheet cannot import
 *  a constant; a wood's grain derives from that same property, so no second colour is authored in CSS. */
function SwatchButton({
  chip,
  onPick,
}: {
  readonly chip: FinishChip;
  readonly onPick: (finish: Finish) => void;
}) {
  return (
    <button
      type="button"
      className={styles.swatch}
      style={{ "--swatch-colour": chip.swatchColor } as CSSProperties}
      data-testid={`finish-${chip.value}`}
      data-wood={chip.isWood ? "true" : "false"}
      aria-pressed={chip.isActive}
      disabled={chip.isDisabled}
      onClick={() => {
        onPick(chip.finish);
      }}
    >
      <span className={styles.swatchColor} aria-hidden="true" />
      <span className={styles.swatchLabel}>{chip.label}</span>
      <ChipReason reason={chip.reason} />
    </button>
  );
}

/** MDF's control: a native colour input. The value is lower-cased before it is written: `FinishSchema`
 *  admits both cases and no reader case-folds (ADR 0081 decision 1), so `#ECEEEB` and `#eceeeb`
 *  would be two different colours. */
function RalPickerView({
  section,
  onPick,
  follow,
}: {
  readonly section: RalPickerSection;
  readonly onPick: (finish: Finish) => void;
  readonly follow?: FollowTheKitchenStep;
}) {
  return (
    <section
      className={styles.section}
      data-testid="section-finish"
      data-finish-control="ral-picker"
    >
      <span className={styles.sectionTitle}>{section.title}</span>
      <label className={styles.picker}>
        <input
          type="color"
          className={styles.pickerInput}
          data-testid="finish-colour-picker"
          value={section.value}
          disabled={section.isDisabled}
          onChange={(event) => {
            onPick(freeColourFinish(event.target.value.toLowerCase()));
          }}
        />
        <span className={styles.pickerLabel}>{section.label}</span>
      </label>
      {/* Without this an MDF cabinet has no way to stop choosing: every hex is a choice. */}
      {follow === undefined ? null : <FollowTheKitchenButton step={follow} />}
      <ChipReason reason={section.reason} />
      <p className={styles.note}>{section.note}</p>
    </section>
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

/** §13.1's reason for a disabled chip. A disabled button is not focusable, so the reason must be
 *  readable without reaching the control. */
function ChipReason({ reason }: { readonly reason: string | undefined }) {
  if (reason === undefined) return null;
  return <span className={styles.chipReason}>{reason}</span>;
}

/** §9's width control, in two shapes (ADR 0035 decision 3); the model's `control` picks one. */
function WidthSectionView({ section }: { readonly section: WidthSection }) {
  return section.control === "stepper" ? (
    <WidthStepperView section={section} />
  ) : (
    <WidthChoiceView section={section} />
  );
}

/** ADR 0035 decision 1's `+50` / `−50`. The width is an `<output>` between the buttons, so a screen
 *  reader announces a step. A button at a bound stays mounted and disabled with its reason, never
 *  removed. */
function WidthStepperView({
  section,
}: {
  readonly section: WidthStepperSection;
}) {
  const setWidth = useConfiguratorStore((state) => state.setWidth);
  return (
    <section className={styles.section} data-testid="section-width">
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{section.title}</span>
      </div>
      <div className={styles.stepper}>
        <WidthStepView step={section.steps[0]} onStep={setWidth} />
        <output className={styles.stepperValue} data-testid="width-value">
          {section.valueLabel}
        </output>
        <WidthStepView step={section.steps[1]} onStep={setWidth} />
      </div>
      <p className={styles.note}>{section.note}</p>
    </section>
  );
}

function WidthStepView({
  step,
  onStep,
}: {
  readonly step: WidthStepButton;
  readonly onStep: (widthMm: number) => void;
}) {
  return (
    <button
      type="button"
      className={styles.widthStep}
      data-testid={`width-step-${step.direction}`}
      // `aria-label` replaces the contents in the accessible name, so it goes only on an enabled
      // button; a disabled one must announce its reason.
      {...(step.reason === undefined ? { "aria-label": step.ariaLabel } : {})}
      disabled={step.isDisabled}
      onClick={() => {
        onStep(step.widthMm);
      }}
    >
      {step.label}
      <ChipReason reason={step.reason} />
    </button>
  );
}

/** ADR 0035 decision 3's discrete choice, for widths that are genuinely a set. `state` drives styling
 *  only; clickability (`isDisabled`) and the reason are the model's. */
function WidthChoiceView({
  section,
}: {
  readonly section: WidthChoiceSection;
}) {
  const setWidth = useConfiguratorStore((state) => state.setWidth);
  return (
    <section className={styles.section} data-testid="section-width">
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{section.title}</span>
        <span className={styles.widthValue} data-testid="width-value">
          {section.valueLabel}
        </span>
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
            onClick={() => {
              setWidth(chip.widthMm);
            }}
          >
            {chip.label}
            <ChipReason reason={chip.reason} />
          </button>
        ))}
      </div>
      <p className={styles.note}>{section.note}</p>
    </section>
  );
}

/** §10's viewing model: **Gata** and × only clear the selection; every edit is already applied. */
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
      {/* §9 item 7: the running total, absent on a failed or unsupplied pricing query. */}
      {footer.price === undefined ? null : (
        <p
          className={styles.footerPrice}
          data-testid="panel-price"
          aria-live="polite"
        >
          <span className={styles.footerPriceLabel}>{footer.price.label}</span>
          <span
            className={styles.footerPriceAmount}
            data-testid="panel-price-total"
          >
            {footer.price.amountText}
          </span>
        </p>
      )}
      {/* Mounted whether or not there is a warning, and `display: contents` so the footer measures
          the same either way. On mobile this is the only total on screen, the sheet covering the bar. */}
      <div
        className={styles.footerPriceRegion}
        role="status"
        data-testid="panel-price-flag-region"
      >
        {footer.overflowWarning === undefined ? null : (
          <span
            className={styles.footerPriceWarning}
            data-testid="panel-price-overflow"
          >
            {footer.overflowWarning}
          </span>
        )}
      </div>
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
