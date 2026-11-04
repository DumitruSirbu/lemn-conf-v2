// A lifecycle client for the DOM tests that judges the way a server would, with the stand-in's own judgement (the domain's
// `judgeAvailabilityChange`), and records every call, so a test can say what was sent and, as often, that nothing was.
import type {
  AvailabilityOutcome,
  ItemLifecycleClient,
  UsageRead,
} from "@/price-dashboard/item-lifecycle-client";
import {
  inMemoryItemLifecycleClient,
  type ItemLifecycleSeed,
} from "@/price-dashboard/item-lifecycle-stand-in-client";
import type { AvailabilityRequestWire } from "@/price-dashboard/price-dashboard-wire-contract";

export type LifecycleCall =
  | { readonly kind: "setActive"; readonly request: AvailabilityRequestWire }
  | { readonly kind: "readUsage"; readonly itemCount: number }
  | { readonly kind: "readAvailability" };

export interface RecordingLifecycleClient {
  readonly client: ItemLifecycleClient;
  readonly calls: LifecycleCall[];
  /** The next write is answered with this instead of being judged, once. */
  readonly answerNextWriteWith: (outcome: AvailabilityOutcome) => void;
  /** Another actor writes behind the screen: the revision moves with no call from it. */
  readonly writeBehindTheScreen: (
    request: Omit<AvailabilityRequestWire, "expectedRevision">,
  ) => Promise<void>;
  /** The next count is answered with this instead of the seed's, once. */
  readonly answerNextUsageWith: (read: UsageRead) => void;
  /** The next count waits for `release()`. */
  readonly holdNextUsage: () => () => void;
  /** The next write waits for `release()`. */
  readonly holdNextWrite: () => () => void;
}

export function recordingLifecycleClient(
  seed: ItemLifecycleSeed,
): RecordingLifecycleClient {
  const inner = inMemoryItemLifecycleClient(seed);
  const calls: LifecycleCall[] = [];
  let forcedWrite: AvailabilityOutcome | undefined;
  let forcedUsage: UsageRead | undefined;
  let heldUsage: Promise<void> | undefined;
  let heldWrite: Promise<void> | undefined;

  const client: ItemLifecycleClient = {
    canWrite: inner.canWrite,
    setActive: async (request) => {
      calls.push({ kind: "setActive", request });
      const waiting = heldWrite;
      heldWrite = undefined;
      await waiting;
      const forced = forcedWrite;
      forcedWrite = undefined;
      return forced ?? inner.setActive(request);
    },
    readUsage: async (items) => {
      calls.push({ kind: "readUsage", itemCount: items.length });
      const waiting = heldUsage;
      heldUsage = undefined;
      await waiting;
      const forced = forcedUsage;
      forcedUsage = undefined;
      return forced ?? inner.readUsage(items);
    },
    readAvailability: () => {
      calls.push({ kind: "readAvailability" });
      return inner.readAvailability();
    },
  };

  const holdOnce = (): { promise: Promise<void>; release: () => void } => {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };

  return {
    client,
    calls,
    answerNextWriteWith: (outcome) => {
      forcedWrite = outcome;
    },
    writeBehindTheScreen: async (request) => {
      const current = await inner.readAvailability();
      await inner.setActive({
        ...request,
        expectedRevision: current?.revision ?? "",
      });
    },
    answerNextUsageWith: (read) => {
      forcedUsage = read;
    },
    holdNextUsage: () => {
      const { promise, release } = holdOnce();
      heldUsage = promise;
      return release;
    },
    holdNextWrite: () => {
      const { promise, release } = holdOnce();
      heldWrite = promise;
      return release;
    },
  };
}
