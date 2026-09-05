// **Wave 6P promised the finish surface would stay value-preserving and un-widened, and until this
// file no test in this repository could have caught it breaking that promise.**
//
// The wave split what used to be one string into two — `FinishChip.value`, which the DOM is keyed
// and styled by, and `FinishChip.finish`, which the command writes — and `panel-model.test.ts`
// asserts the *pair*. Nothing asserted the *markup*, and the markup is what four e2e specs address:
// `page.getByTestId("finish-graphite")`, `finish-white`, `finish-sage`, and
// `[data-testid^="finish-"]` counted as a set (`apps/web/tests/e2e/editor-panel.e2e.spec.ts`,
// `editor-rail.desktop.e2e.spec.ts`, `read-only-panel.e2e.spec.ts`). The e2e gate cannot run in a
// worktree without a database, so a widened or re-keyed swatch would have shipped green.
//
// The literals below are written out rather than derived from `LEGACY_ENUM_FINISH_NAMES`: a test
// that reads the same list the component reads agrees with any list the component is given, which
// is precisely the widening this file exists to refuse.
import {
  cabinetDepthMmOf,
  buildKitchenLBodyCatalog,
  describeSelection,
  KITCHEN_L_DESIGN,
  LEGACY_ENUM_FINISHES,
  offersFor,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type PanelView } from "@/panel/panel-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

vi.mock("@/price/use-priced-design", () => ({
  usePricedDesign: () => undefined,
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector({ lastRejection: null, deselect: () => undefined }),
  };
});

const { EditorPanel } = await import("@/panel/editor-panel");

/** Exactly the five names §5.5 shipped with, in the order the panel has rendered them since M4. */
const SHIPPED_SWATCH_KEYS = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
] as const;

function markupFor(meta: Parameters<typeof describePanel>[0]["meta"]): string {
  const view: PanelView = describePanel({
    meta,
    offers: [],
    rejection: null,
    widthOptions: meta ? noWidthIsFree(meta.widthMm, meta.sizesMm) : [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  return renderToStaticMarkup(createElement(EditorPanel, { view }));
}

function attributesInOrder(markup: string, attribute: string): string[] {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]*)"`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

/** The swatch button as one string, matched by the test id an e2e spec addresses it by. */
function buttonFor(markup: string, key: string): string {
  const button = new RegExp(
    `<button[^>]*data-testid="finish-${key}"[^>]*>.*?</button>`,
    "s",
  ).exec(markup);
  if (!button) throw new Error(`no swatch button with test id finish-${key}`);
  return button[0];
}

describe("the finish swatches render the same DOM wave 6P inherited", () => {
  const unpainted = markupFor(occupiedMeta());

  it("emits exactly five swatch test ids, in the shipped order", () => {
    const testIds = attributesInOrder(unpainted, "data-testid").filter((id) =>
      id.startsWith("finish-"),
    );

    expect(testIds).toEqual(SHIPPED_SWATCH_KEYS.map((key) => `finish-${key}`));
  });

  it("emits the same five as data-finish, which is what the stylesheet paints from", () => {
    expect(attributesInOrder(unpainted, "data-finish")).toEqual([
      ...SHIPPED_SWATCH_KEYS,
    ]);
  });

  it("keys the swatch and its colour span by the same string, not by two", () => {
    // The wave gave the chip a second field. If the button's test id ever came from `finish` while
    // the span still came from `value`, the two would drift apart without either list changing.
    for (const key of SHIPPED_SWATCH_KEYS) {
      expect(buttonFor(unpainted, key)).toContain(`data-finish="${key}"`);
    }
  });

  it("renders neither kind of declared finish into an attribute", () => {
    // A palette id or a `#`-prefixed colour reaching a `data-` attribute is the widening: every
    // e2e selector above is written against the five names.
    expect(unpainted).not.toContain("palette-entry");
    expect(unpainted).not.toContain("free-colour");
    expect(unpainted).not.toContain("pal.");
    expect(unpainted).not.toContain('data-finish="#');
    expect(unpainted).not.toContain('data-testid="finish-#');
  });

  it.each(SHIPPED_SWATCH_KEYS)(
    "labels the %s swatch as it always did",
    (key) => {
      expect(buttonFor(unpainted, key)).toContain(ro.panel.finishLabels[key]);
    },
  );

  it("presses nothing when the body wears no finish", () => {
    for (const key of SHIPPED_SWATCH_KEYS) {
      expect(buttonFor(unpainted, key)).toContain('aria-pressed="false"');
    }
  });

  it.each(SHIPPED_SWATCH_KEYS)(
    "presses only the %s swatch when the body wears it",
    (key) => {
      const markup = markupFor(
        occupiedMeta({ finish: LEGACY_ENUM_FINISHES[key] }),
      );

      for (const other of SHIPPED_SWATCH_KEYS) {
        expect(buttonFor(markup, other)).toContain(
          `aria-pressed="${String(other === key)}"`,
        );
      }
    },
  );
});

describe("the click an e2e spec performs still lights the swatch it clicked", () => {
  /** The whole chain the e2e specs assert in one hop: the chip's own `finish` goes to the store's
   *  `setFinish`, the design records it, `describeSelection` publishes it, and the panel is asked
   *  which swatch is pressed. Wave 6P is the first time the value written and the value rendered
   *  are different strings, so nothing before it could have caught them disagreeing. */
  interface ClickOutcome {
    readonly pressed: readonly string[];
    readonly rejectionCode: string | null;
  }

  function clickSwatch(key: string): ClickOutcome {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-08-26T12:00:00.000Z",
    });
    store.getState().select({ kind: "placement", id: "p0" });

    const before = describePanel({
      meta: describeSelection({
        records: store.getState().records,
        voids: store.getState().voids,
        catalog: store.getState().catalog,
        target: { kind: "placement", id: "p0" },
      }),
      offers: offersFor({
        records: store.getState().records,
        voids: store.getState().voids,
        columns: store.getState().columns,
        catalog: store.getState().catalog,
        cabinetDepthMm: cabinetDepthMmOf(store.getState().design),
        target: { kind: "placement", id: "p0" },
      }),
      rejection: null,
      widthOptions: [],
      isBodyProbeAttached: true,
      canWrite: true,
      saveStatus: "idle",
    });
    if (before.kind !== "open") throw new Error("expected an open panel");
    const section = before.sections.find((one) => one.kind === "finish");
    if (section?.kind !== "finish") throw new Error("no finish section");
    const chip = section.chips.find((one) => one.value === key);
    if (!chip) throw new Error(`no chip keyed ${key}`);

    store.getState().setFinish(chip.finish);
    const rejectionCode = store.getState().lastRejection?.code ?? null;

    const after = describePanel({
      meta: describeSelection({
        records: store.getState().records,
        voids: store.getState().voids,
        catalog: store.getState().catalog,
        target: { kind: "placement", id: "p0" },
      }),
      offers: [],
      rejection: null,
      widthOptions: [],
      isBodyProbeAttached: true,
      canWrite: true,
      saveStatus: "idle",
    });
    if (after.kind !== "open") throw new Error("expected an open panel");
    const pressed = after.sections.find((one) => one.kind === "finish");
    if (pressed?.kind !== "finish") throw new Error("no finish section");
    return {
      pressed: pressed.chips
        .filter((one) => one.isActive)
        .map((one) => one.value),
      rejectionCode,
    };
  }

  /** **The seeded kitchen carries no settings, so it is PAL** — and since wave 6Q-a the five chips
   *  no longer land the same way. Three write a PAL decor; *Lut* and *Salvie* write a free colour,
   *  which a decor list does not offer (ADR 0078 decision 1), and the command refuses them.
   *
   *  Written out rather than partitioned by asking the domain, for this file's own stated reason: a
   *  test that reads the same query the command reads agrees with it however it is wrong. */
  const OFFERED_ON_PAL = ["white", "graphite", "oak"] as const;
  const REFUSED_ON_PAL = ["clay", "sage"] as const;

  it("splits the five shipped swatches between the two branches and drops none", () => {
    expect([...OFFERED_ON_PAL, ...REFUSED_ON_PAL].sort()).toEqual(
      [...SHIPPED_SWATCH_KEYS].sort(),
    );
  });

  it.each(OFFERED_ON_PAL)(
    "leaves %s pressed and nothing else, exactly as the e2e spec expects",
    (key) => {
      const outcome = clickSwatch(key);
      expect(outcome.rejectionCode).toBeNull();
      expect(outcome.pressed).toEqual([key]);
    },
  );

  /** **ADR 0078 decision 6's named, accepted interim, asserted rather than left to be discovered.**
   *  A customer tapping *Lut* or *Salvie* on a PAL kitchen gets a Romanian sentence instead of a
   *  silently stored finish its material does not offer. Wave 6R clears it by making the panel's
   *  offer the control's own; until then this is the behaviour, and it is strictly better than
   *  writing the invalid state. */
  it.each(REFUSED_ON_PAL)(
    "refuses %s on a PAL kitchen and presses nothing at all",
    (key) => {
      const outcome = clickSwatch(key);
      expect(outcome.rejectionCode).toBe("FINISH_NOT_OFFERED");
      expect(outcome.pressed).toEqual([]);
    },
  );
});
