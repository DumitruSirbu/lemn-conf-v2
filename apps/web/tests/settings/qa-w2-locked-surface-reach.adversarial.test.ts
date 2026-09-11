// **Adversarial QA for wave W2, attack 2: where can a locked browser still be offered a write?**
//
// M6-AUD-001 is *"a write surface that silently defaults to permitted"*. The wave closed it on the
// sheet's **choosing** step — trigger, radios and *Aplică* — and this file asks the same question of
// every other route into the same commit.
//
// Two answers are recorded here.
//
//   1. **The confirm step takes no editability at all.** `ConfirmStep` receives a
//      `MaterialResetConfirmStep` and nothing about access, so its *Confirmă* renders live on a
//      locked sheet with no reason on it, and the handler behind it — `applyPending` — carries none
//      of the `editability.isReadOnly` guard `requestApply` carries four lines above it. A sheet
//      opened while writable and locked underneath (a save in flight that comes back `unauthorized`
//      is exactly that, and is the state the audit finding describes) is one press from a commit.
//      That is the failing test in this file.
//   2. **The `editability` prop is optional and absent means writable.** The prop's own doc comment
//      says the risk is closed by `read-only-global-settings.test.ts` going red if `GlobalSettings`
//      stops passing it. Measured: it does not. Deleting `editability={editability}` from the one
//      production call site leaves the whole 1710-test web suite green, because no test can open the
//      sheet — the environment is `node`, there is no DOM, and `useState(false)` never advances. The
//      guard here is the one that can be written without a browser.
import {
  countCabinetsWearingAChosenFinish,
  KITCHEN_L_BODY_CATALOG,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { ro as content } from "../support/romanian-content";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeEditability } from "@/store/editability";

import {
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  VENEER_TIER_ID,
} from "../support/mdf-kitchen-wearing-chosen-colours";

const SURFACE_ID = "settings";

/** The one locked state that needs no argument about reachability: the load said no. */
const LOCKED = describeEditability(
  { canWrite: false, saveStatus: "idle" },
  ro.panel,
);

/** The state a sheet opened writable can arrive in without the customer doing anything: the save of
 *  an earlier edit came back refused while the sheet stood open. */
const LOCKED_MID_SESSION = describeEditability(
  {
    canWrite: true,
    saveStatus: "unauthorized",
  },
  ro.panel,
);

/** The wave 6Q-c fixture: a material switch that would discard four chosen colours, so the view
 *  publishes a confirmation and the sheet has a second step to reach. */
function confirmingView(): GlobalSettingsView {
  const design = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
  const priced = {
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  };
  return describeGlobalSettings({
    content: content,
    pricing: priceDesign(priced),
    offer: offerWholeKitchenTiers(priced),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: { materialTierId: MDF_TIER_ID },
    pending: { materialTierId: VENEER_TIER_ID },
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
}

function confirmStepMarkupAt(editability: {
  readonly isReadOnly: boolean;
  readonly disabledReason: string;
}): string {
  const view = confirmingView();
  const confirm = view.materialResetConfirm;
  if (!confirm) throw new Error("the fixture publishes no confirmation");
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: SURFACE_ID,
      view,
      editability,
      confirming: {
        view: confirm,
        onConfirm: () => undefined,
        onStepBack: () => undefined,
      },
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

function tagWithTestId(markup: string, testId: string): string {
  const found = [...markup.matchAll(/<(?:button|input)\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`data-testid="${testId}"`));
  if (!found) throw new Error(`no control carries data-testid="${testId}"`);
  return found;
}

describe("the confirm step, on a browser that may not write", () => {
  it("greys the action that commits, with the reason, exactly as the choosing step's does", () => {
    // **This fails today.** `ConfirmStep` is handed no `editability`, so *Schimbă materialul*
    // renders live and unexplained on a locked sheet — and its handler, `applyPending`, is the one
    // path into `applyWholeKitchenSettings` that carries no `isReadOnly` guard. §13.1's "greyed and
    // unclickable **with the reason**" and the sheet's own "a locked surface never reaches the
    // commit" both apply to this button: it is the same commit, one step further in.
    const confirm = tagWithTestId(
      confirmStepMarkupAt(LOCKED),
      "global-settings-confirm",
    );

    expect(confirm).toContain("disabled");
    expect(confirm).toContain(`title="${LOCKED.disabledReason}"`);
  });

  it("greys it too when the lock arrived after the sheet opened, which is how it is reached", () => {
    // The route that makes the case above more than a hypothetical. The trigger is disabled on a
    // locked load, so a `canWrite: false` visitor never opens the sheet at all; `canWrite: true`
    // with an `unauthorized` save is a sheet that opened legitimately and locked underneath.
    const confirm = tagWithTestId(
      confirmStepMarkupAt(LOCKED_MID_SESSION),
      "global-settings-confirm",
    );

    expect(confirm).toContain("disabled");
  });

  it("leaves the way back out of the step alone, because leaving is never locked", () => {
    // The other half of the rule, so the fix cannot be "disable both buttons": *Păstrează* is the
    // step's cancel and must stay live, exactly as *Renunță* does on the choosing step.
    const back = tagWithTestId(
      confirmStepMarkupAt(LOCKED),
      "global-settings-confirm-back",
    );

    expect(back).not.toContain("disabled");
  });

  it("states the reason once on the step, so a locked customer is told why before pressing", () => {
    // The choosing step renders `global-settings-read-only-reason` at the head of its body. The
    // confirm step replaces that body wholesale, so the sentence disappears at the exact moment the
    // customer is being asked to commit.
    const markup = confirmStepMarkupAt(LOCKED);

    expect(markup).toContain(LOCKED.disabledReason);
  });

  it("renders both actions live on a writable browser, so none of the above is unconditional", () => {
    const markup = confirmStepMarkupAt({
      isReadOnly: false,
      disabledReason: "",
    });

    expect(tagWithTestId(markup, "global-settings-confirm")).not.toContain(
      "disabled",
    );
    expect(tagWithTestId(markup, "global-settings-confirm-back")).not.toContain(
      "disabled",
    );
    expect(markup).not.toContain(ro.panel.readOnlyReason);
  });
});

describe("the tab ring inside a locked sheet", () => {
  it("keeps a stop on the confirm step too, so the trap is never empty on either step", () => {
    // Attack 6's question, asked of the step the wave's own test does not render. Both of this
    // step's buttons are stops today; once the commit is greyed, *Păstrează* is what keeps the ring
    // non-empty — which is why the test above insists it stays live.
    const markup = confirmStepMarkupAt(LOCKED);
    const stops = [...markup.matchAll(/<(?:button|input)\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) =>
        tag.startsWith("<button")
          ? !tag.includes("disabled")
          : tag.includes('type="radio"') &&
            /\bchecked\b/.test(tag) &&
            !tag.includes("disabled"),
      );

    expect(stops.length).toBeGreaterThan(0);
    expect(
      stops.some((tag) => tag.includes("global-settings-confirm-back")),
    ).toBe(true);
  });
});

describe("the store-connected sheet's access wiring", () => {
  const componentSource = readFileSync(
    resolve(import.meta.dirname, "../../src/settings/global-settings.tsx"),
    "utf8",
  );

  it("hands its editability to the surface, which no rendered test in a node runtime can see", () => {
    // `GlobalSettingsSurface.editability` is optional and **absent means writable**, and its doc
    // comment names `read-only-global-settings.test.ts` as what closes the risk. It does not: that
    // file renders `GlobalSettings` only with the sheet **shut** (no DOM, so `useState(false)` never
    // advances) and renders the open sheet by constructing `GlobalSettingsSurface` with the prop
    // itself. Deleting the prop from the call site below was measured to leave the entire suite
    // green.
    //
    // Reading the source is the weakest guard there is and it is the only one this runtime allows.
    // The assertion a browser would make instead is in
    // `tests/e2e/read-only-global-settings.e2e.spec.ts`.
    expect(componentSource).toMatch(
      /<GlobalSettingsSurface[\s\S]*?editability=\{editability\}/,
    );
  });

  it("guards the commit itself, on every handler that can reach it", () => {
    // The belt to that brace, and the half that is missing: `requestApply` returns early on a
    // locked surface, `applyPending` does not — and the confirm step calls `applyPending` directly.
    const guardedHandlers = [
      ...componentSource.matchAll(
        /function (requestApply|applyPending)\(\): void \{([\s\S]*?)\n {2}\}/g,
      ),
    ].map(([, name, body]) => ({
      name,
      isGuarded: (body ?? "").includes("editability.isReadOnly"),
    }));

    expect(guardedHandlers.map((one) => one.name).sort()).toEqual([
      "applyPending",
      "requestApply",
    ]);
    expect(
      guardedHandlers.filter((one) => !one.isGuarded).map((one) => one.name),
    ).toEqual([]);
  });
});
