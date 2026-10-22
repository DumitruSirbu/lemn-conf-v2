// Renders a hook inside a real React root and hands back what it returned, as the DOM tests of this project render a
// component: `react-dom/client` driven through `act` (there is no testing library in this workspace). The latest return
// value is `result.current`; `rerender` runs the hook again with new props.
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export interface RenderedHook<Result> {
  readonly result: { current: Result };
  /** Renders again with whatever the hook's closure now reads, as a parent passing new props would. */
  readonly rerender: () => void;
  readonly unmount: () => void;
}

export function renderHook<Result>(
  useHook: () => Result,
  wrap: (children: ReactNode) => ReactNode = (children) => children,
): RenderedHook<Result> {
  const result = { current: undefined as Result };
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  function Probe(): null {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(wrap(createElement(Probe)));
  });
  return {
    result,
    rerender: () => {
      act(() => {
        root.render(wrap(createElement(Probe)));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Lets pending promise continuations run inside `act`, so state set by an awaited request has been rendered. */
export async function flushPromises(rounds = 3): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
