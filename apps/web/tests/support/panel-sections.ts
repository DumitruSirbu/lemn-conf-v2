// Test-only. **The two finish controls, narrowed.**
//
// §9's Finisaj section is a union since wave 6R — a palette of swatches, or MDF's colour picker —
// so a test reading `chips` has to say which it expected. These do that in one place and throw
// with the section they actually found, so a fixture that changed material fails saying so rather
// than at a property that does not exist.
import type {
  PaletteSwatchSection,
  PanelSection,
  PanelView,
  RalPickerSection,
} from "@/panel/panel-model";

export function swatchSectionOf(
  source: PanelView | readonly PanelSection[],
): PaletteSwatchSection {
  const section = finishSectionOf(source);
  if (section.control === "ral-picker") {
    throw new Error(
      "expected a palette of swatches, found the RAL picker — this fixture is on MDF",
    );
  }
  return section;
}

export function pickerSectionOf(
  source: PanelView | readonly PanelSection[],
): RalPickerSection {
  const section = finishSectionOf(source);
  if (section.control !== "ral-picker") {
    throw new Error(
      `expected the RAL picker, found the ${section.control} — this fixture is not on MDF`,
    );
  }
  return section;
}

function finishSectionOf(source: PanelView | readonly PanelSection[]) {
  const sections = Array.isArray(source)
    ? (source as readonly PanelSection[])
    : sectionsOf(source as PanelView);
  const section = sections.find((one) => one.kind === "finish");
  if (section?.kind !== "finish") throw new Error("no finish section");
  return section;
}

function sectionsOf(view: PanelView): readonly PanelSection[] {
  if (view.kind !== "open") throw new Error("expected an open panel");
  return view.sections;
}
