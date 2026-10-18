// The presets Step 1 can offer for the room just continued from: the state P8's list reads, and the one handler-driven
// start that fills it. Its rules, which are `use-generation.ts`'s own:
// 1. A run starts from the tap that asked for it, never from an effect (ADR 0139 decision 4): `reactStrictMode` runs
//    an effect twice, which would read the listing twice and build two sets of kits.
// 2. The listing and the offers live in this hook's state and nowhere else: no store outside the screen, no URL, no
//    cookie, no web storage. They end with the visit, and `clear` ends them sooner (the customer left the composition).
// 3. Nothing here can hold composition up or show an error. A run that fails, times out or is left behind ends in
//    `none`, which is what an empty library ends in, and composition does not wait for either.
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadPresetOffers, type ListedPresetOffer } from "./preset-offers";
import { loadProbeFactory } from "./use-generation";

/**
 * Where the read and the evaluation have got to. `ready` means at least one offer; `none` is every other end,
 * a failure included, so a screen never has to tell "nothing fits" from "could not ask".
 */
export type PresetOffersStatus = "idle" | "loading" | "ready" | "none";

export interface PresetOffersState {
  readonly status: PresetOffersStatus;
  /** In the order the card list shows them (ADR 0109 Amendment A4); empty unless `status` is `ready`. */
  readonly offers: readonly ListedPresetOffer[];
}

export interface PresetOffers {
  readonly state: PresetOffersState;
  /** Reads the listing for `room` and evaluates it, once: a run already going is abandoned for this one. */
  readonly begin: (room: DesignRoom) => void;
  /** Ends the run and forgets its offers: a pure state clear, idempotent. */
  readonly clear: () => void;
}

const NO_OFFERS: readonly ListedPresetOffer[] = [];

const IDLE: PresetOffersState = { status: "idle", offers: NO_OFFERS };
const LOADING: PresetOffersState = { status: "loading", offers: NO_OFFERS };
const NONE: PresetOffersState = { status: "none", offers: NO_OFFERS };

/** The run that may still write its answer: a later `begin`, a `clear` and the screen going all retire it. */
interface LiveRun {
  readonly token: number;
  readonly abort: AbortController;
}

export function usePresets(): PresetOffers {
  const [state, setState] = useState<PresetOffersState>(IDLE);
  const liveRun = useRef<LiveRun | undefined>(undefined);
  const lastToken = useRef(0);

  const retire = useCallback(() => {
    liveRun.current?.abort.abort();
    liveRun.current = undefined;
  }, []);

  const clear = useCallback(() => {
    retire();
    setState(IDLE);
  }, [retire]);

  // The screen going away, whether by unmount or by Next hiding the route inside `<Activity>`, ends the visit.
  useEffect(() => clear, [clear]);

  const begin = useCallback(
    (room: DesignRoom) => {
      retire();
      lastToken.current += 1;
      const run: LiveRun = {
        token: lastToken.current,
        abort: new AbortController(),
      };
      liveRun.current = run;
      setState(LOADING);

      void loadPresetOffers({
        room,
        signal: run.abort.signal,
        loadProbeFactory,
      }).then((offers) => {
        if (liveRun.current?.token !== run.token) return;
        liveRun.current = undefined;
        setState(offers.length === 0 ? NONE : { status: "ready", offers });
      });
    },
    [retire],
  );

  return { state, begin, clear };
}
