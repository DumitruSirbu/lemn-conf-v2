// Test-only. The reference bakes its procedural maps on a real 2D canvas; the structural-parity
// suite runs in node and never rasterises anything, so it supplies this recorder instead. It
// implements exactly the 2D context surface `kitchen-parts` and `stage` touch — nothing draws.
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

/** The reference kit reaches for `document.createElement('canvas')` with no injection seam, so
 *  running it side by side with the port needs a document that answers that one call. */
export function installHeadlessDocument(): void {
  const existing = (globalThis as { document?: unknown }).document;
  if (existing) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => createHeadlessCanvas() },
  });
}
