// Test-only. `makeKit` bakes its procedural maps on a real 2D canvas; these suites run in node and
// never rasterise anything, so they supply this recorder instead. It implements exactly the 2D
// context surface `kitchen-parts` touches — nothing draws.
//
// A deliberate second copy of `packages/three-adapter/tests/support/headless-canvas.ts`: that one
// lives under another package's `tests/`, which is not published and cannot be imported from here.
// Both exist only so a kit can be built without a browser; neither carries a product rule, so there
// is nothing here for the two to drift *about*.

interface StubGradient {
  addColorStop: (offset: number, color: string) => void;
}

function createStubContext(): CanvasRenderingContext2D {
  const gradient: StubGradient = { addColorStop: () => undefined };
  const context = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    fillRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return context as unknown as CanvasRenderingContext2D;
}

export function createHeadlessCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => createStubContext(),
  };
  return canvas as unknown as HTMLCanvasElement;
}
