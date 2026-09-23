// @vitest-environment happy-dom
//
// A client mount, not `renderToStaticMarkup`: zustand's React binding calls
// `selector(api.getInitialState())` for `useSyncExternalStore`'s server snapshot (`node_modules/
// zustand/react.js`), which is frozen at module load and never reflects a `hydrate()` call already
// made — so a *second* `renderToStaticMarkup` of the same tree cannot observe the first one's write
// and always re-triggers the guard. A real client tree (`createRoot`, rerendered under `act`) reads
// the live snapshot instead, which is what production does once hydration has run and is the only
// way to exercise "does this guard skip a second render" at all.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firstFrame = vi.hoisted(() => ({
  design: undefined as Design | undefined,
  variant: undefined as string | undefined,
}));

vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: (props: { variant?: string }) => {
    firstFrame.design = useConfiguratorStore.getState().design;
    firstFrame.variant = props.variant;
    return null;
  },
}));

const [{ SharedDesignView }, { useConfiguratorStore }] = await Promise.all([
  import("@/app/s/[token]/shared-design-view"),
  import("@/store/configurator-store"),
]);

let container: HTMLDivElement;
let root: Root;

/**
 * `token` stands in for `page.tsx`'s `key={token}` (criterion 13's fix): a distinct token is a
 * distinct mount, the same token is the same live instance — exactly what the page does with the
 * route's own token.
 *
 * **Wrapped in a stable parent `<div>`, deliberately.** `key` only changes reconciliation between
 * siblings under an unchanged parent (React's own rule); rendering `SharedDesignView` directly as
 * `root.render`'s own argument makes it the root with no parent to be a sibling under, so a `key`
 * there is inert and `root.render` would reconcile in place regardless — this wrapper is what makes
 * the fixture exercise the same remount `page.tsx`'s real parent tree gives it.
 */
function tree(design: Design, token: string) {
  return createElement(
    "div",
    null,
    createElement(SharedDesignView, { design, key: token }),
  );
}

function mount(design: Design, token: string): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(tree(design, token));
  });
}

function rerender(design: Design, token: string): void {
  act(() => {
    root.render(tree(design, token));
  });
}

beforeEach(() => {
  useConfiguratorStore.setState({
    design: KITCHEN_L_DESIGN,
    designId: null,
    revision: null,
    canWrite: true,
  });
  firstFrame.design = undefined;
  firstFrame.variant = undefined;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** M7 wave 7E3c D6/G5/G8: the share view's own hydrator. */
describe("SharedDesignView", () => {
  it("hydrates the store with the shared design before the editor renders, read-only", () => {
    const shared: Design = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "recipe-from-a-share-link",
    };

    mount(shared, "token-a");

    expect(firstFrame.design).toBe(shared);
    expect(firstFrame.variant).toBe("shared");
    expect(useConfiguratorStore.getState()).toMatchObject({
      design: shared,
      canWrite: false,
    });
  });

  it('mounts <ConfigureScreen variant="shared">, never the owner variant', () => {
    mount(KITCHEN_L_DESIGN, "token-a");

    expect(firstFrame.variant).toBe("shared");
  });

  it("re-hydrates a second share view visited in the same tab, under the same sentinel id (criterion 13)", () => {
    const first: Design = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "first-share-link",
    };
    const second: Design = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "second-share-link",
    };
    // Measured, not asserted here: keying does not silence React's "cannot update a component
    // while rendering a different component" warning in this harness. The outgoing instance's
    // `useSyncExternalStore` subscription is still live during the incoming instance's render (it
    // unsubscribes on commit, which is later), so the incoming instance's `hydrate()` still notifies
    // it mid-render, keyed or not — reproduced identically against `HydrateAndConfigure` itself, the
    // pattern this component followed. Silencing it needs a different mechanism than keying; left
    // for the coordinator (message 2026-09-23) rather than guessed at here.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mount(first, "token-a");
    const firstDesignId = useConfiguratorStore.getState().designId;

    // A different token, as a real back/forward between two share views gives `page.tsx`'s
    // `key={token}` — this unmounts the first instance and mounts a fresh one, rather than
    // rerendering the same live component with new props.
    rerender(second, "token-b");
    const secondDesignId = useConfiguratorStore.getState().designId;

    expect(useConfiguratorStore.getState().design).toBe(second);
    expect(firstDesignId).toBe(secondDesignId);

    consoleError.mockRestore();
  });

  it("does not re-hydrate a second render of the same mounted instance handed the same design object", () => {
    const shared: Design = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "held-across-two-renders",
    };

    mount(shared, "token-a");
    const afterFirst = useConfiguratorStore.getState();

    rerender(shared, "token-a");
    const afterSecond = useConfiguratorStore.getState();

    // Zustand's `set` always produces a fresh state object; an unchanged reference here is what
    // proves the guard skipped `hydrate` on the second render rather than merely producing an
    // equal-looking one.
    expect(afterSecond).toBe(afterFirst);
  });
});
