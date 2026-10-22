import { expect, type Page } from "@playwright/test";

/** The step the editor is: the pill reads "2/4", where Step 1 reads "1/4" (`configure.stepPill`). */
const EDITOR_STEP_PILL = "2/4";

/**
 * The editor's top bar is on screen. Waited for through the step pill, which is drawn whole at every width, and not
 * through the title: the title is the row's give of last resort (ADR 0104 decision 9, give D), and the account
 * control (M8B Lot 2 U3) leaves it no width on a phone. Whether the title may vanish there is one test's question
 * (`top-bar.e2e.spec.ts`), not the precondition of every spec that needs the editor open.
 */
export async function expectEditorTopBarShown(
  page: Page,
  options?: { readonly timeout?: number },
): Promise<void> {
  await expect(page.getByTestId("top-bar-step")).toHaveText(
    EDITOR_STEP_PILL,
    options,
  );
}
