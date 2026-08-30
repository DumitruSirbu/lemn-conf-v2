// `meta` fixtures for the panel model, per M4's Verification section: each section is driven purely
// from `meta`, so the fixtures are the whole input surface.
//
// The base fixture is a plain base cabinet with every flag on. Each named builder turns exactly the
// flags §9 names for that case, so a test reads as "a corner return has no finish, handle or width"
// rather than as a wall of literals.
import type {
  CatalogOffer,
  RejectionReason,
  SelectionMeta,
} from "@lemnaria/configurator-domain";

const BASE_CABINET_META: SelectionMeta = {
  id: "p0",
  label: "Corp bază 2 uși",
  empty: false,
  kind: "base_cabinet",
  band: "base",
  bandLabel: "bază",
  wall: "A",
  widthMm: 600,
  heightMm: 860,
  openWmm: 600,
  openHmm: 860,
  spanHmm: 860,
  sizesMm: [400, 600, 800],
  fixedWidth: false,
  canFinish: true,
  canHandle: true,
  canWidth: true,
  canReplace: true,
  canDelete: true,
  defaultHandle: "steel",
};

export function occupiedMeta(
  overrides: Partial<SelectionMeta> = {},
): SelectionMeta {
  return { ...BASE_CABINET_META, ...overrides };
}

/** An empty slot: §9 hides Finisaj, Mâner and Lățime, and its whole purpose is the offer list. */
export function slotMeta(
  overrides: Partial<SelectionMeta> = {},
): SelectionMeta {
  return {
    ...BASE_CABINET_META,
    id: "A|2.00:v0:0.00",
    label: "Spațiu liber",
    empty: true,
    kind: "void",
    widthMm: 700,
    heightMm: 860,
    openWmm: 700,
    openHmm: 860,
    sizesMm: [],
    canFinish: false,
    canHandle: false,
    canWidth: false,
    canDelete: false,
    ...overrides,
  };
}

/** §11 row 16: a corner return has no finish, no handle, no width, and no swap list. */
export function cornerReturnMeta(): SelectionMeta {
  return occupiedMeta({
    id: "p21",
    label: "Retur de colț",
    kind: "wall_cabinet",
    band: "wall",
    bandLabel: "suspendat",
    fixedWidth: true,
    canFinish: false,
    canHandle: false,
    canWidth: false,
    canReplace: false,
    canDelete: false,
    sizesMm: [],
    // §11 row 16's "refusal explains why", as a declared fact: a body that offers nothing never
    // produces a refusal, so the panel reads the reason off `meta` instead.
    structuralReason: "corner",
  });
}

/** ADR 0032: an offer carries a verdict. The default is `offered`, since these fixtures stand in for
 *  rows the panel renders as choosable; a refused one is built by passing a `verdict` override. */
export function offer(overrides: Partial<CatalogOffer> = {}): CatalogOffer {
  return {
    buildId: "base-cabinet",
    label: "Corp bază 2 uși",
    kind: "base_cabinet",
    band: "base",
    sizesMm: [400, 600, 800],
    // ADR 0033's amendment: the chips above are what a customer picks; this is what the body may be
    // built to. A plain cabinetry row's is one range, §2's floor to §7's ceiling (ADR 0035
    // decision 2), which is what this fixture stands in for. The chips are deliberately *not* the
    // twelve the catalogue derives: nothing in `describePanel` reads the catalogue, and a fixture
    // that copied it would be asserting the derivation rather than the rendering.
    widthRangesMm: [{ minMm: 300, maxMm: 800 }],
    isCurrent: false,
    verdict: { status: "offered", widthMm: 600, heightMm: 860 },
    ...overrides,
  };
}

export function offers(count: number): CatalogOffer[] {
  return Array.from({ length: count }, (_unused, index) =>
    offer({ buildId: `body-${String(index)}`, label: `Corp ${String(index)}` }),
  );
}

export const REFUSAL: RejectionReason = {
  code: "NOT_DELETABLE",
  params: { label: "Retur de colț" },
  message: "„Retur de colț” face parte din structura bucătăriei.",
};
