// Driving the mounted replacement sheet as a customer does: the rows, the chooser, an option picked and applied, and the saves
// landed until the confirmation shows. Builds on `replacement-sheet-world.ts`, which owns the editor and the fake server.
import {
  advanceClock,
  byTestId,
  present,
  press,
  required,
  type Editor,
  type World,
} from "./replacement-sheet-world";

export function rowsOf(editor: Editor): HTMLElement[] {
  return [
    ...editor.container.querySelectorAll<HTMLElement>(
      '[data-testid="replacement-row"]',
    ),
  ];
}

/** The row about this kind of thing, by the label the screen draws on it, whatever order the domain lists the rows in. */
export function rowAbout(
  editor: Editor,
  kindLabel: string,
): HTMLElement | undefined {
  return rowsOf(editor).find((row) => row.textContent.includes(kindLabel));
}

export function controlOf(row: HTMLElement | undefined): HTMLElement | null {
  return row?.querySelector('[data-testid="replacement-choose"]') ?? null;
}

/** The lines of the confirmation, in the order they are drawn. */
export function confirmationLines(editor: Editor): string[] {
  return [
    ...editor.container.querySelectorAll(
      '[data-testid="replacement-confirmation"] span',
    ),
  ].map((line) => line.textContent);
}

export function optionNamed(editor: Editor, name: string): HTMLButtonElement {
  const found = [
    ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
  ].find((option) => option.textContent.includes(name));
  return present(found, `the option ${name}`);
}

/** Opens the chooser of this row, picks the option with this name and applies it, without landing the save. */
export function chooseInRow(
  row: HTMLElement | undefined,
  editor: Editor,
  name: string,
): void {
  press(present(controlOf(row), "the row's control"));
  press(optionNamed(editor, name));
  press(required(editor, "replacement-apply"));
}

/** Chooses the option with this name for the first row still owed that has a control, and applies it. */
export function chooseOption(editor: Editor, name: string): void {
  const owed = rowsOf(editor).find(
    (row) => row.dataset.resolved === "false" && controlOf(row) !== null,
  );
  chooseInRow(owed, editor, name);
}

/** Lands the saves the page makes, however many the coalescer spaces out, each at a revision of its own, and stops as soon as
 *  the confirmation shows: it goes by itself after a few seconds, so the clock must not run on past it. */
export async function landSavesUntilConfirmed(
  editor: Editor,
  world: World,
): Promise<void> {
  let revision = 2;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await advanceClock(1_000);
    while (world.savesWaiting() > 0) {
      await world.landSave(String(revision));
      revision += 1;
    }
    if (byTestId(editor, "replacement-confirmation") !== null) return;
  }
  throw new Error("no confirmation was shown once the saves had landed");
}
