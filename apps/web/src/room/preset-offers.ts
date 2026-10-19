// What Step 1 offers for a room, from the listing to the ordered offers (ADR 0109 decision 4): read the listing, then
// adapt each candidate to the room once, in a probe lease, inside one time budget. It is the browser's half of
// `evaluatePresetOffers`, taken apart so that it can stop: that function is one synchronous call over every candidate,
// and a phone cannot be asked to hold the main thread for a number of adaptations nobody has timed. Here each candidate
// is one task, the thread is handed back between them, and a candidate is not started if it could end past the budget.
//
// Every path ends in a list, possibly an empty one, and none rejects: "no presets" is the answer to every failure, so
// Step 1 goes on to composition exactly as it does with an empty library.
import {
  adaptPresetToRoom,
  matchPresets,
  orderPresetOffers,
  presetRoomOf,
  type BodyProbeFactory,
  type DesignRoom,
  type PresetOffer,
} from "@lemnaria/configurator-domain";

import type { PresetSummary } from "@/preset/preset-summary-wire";

import {
  fetchPresetListing,
  type ListingUnavailableReason,
} from "./preset-listing";

/** An offer the screen can draw: the adapted design `Select` writes, what the card declares, and the listed preset. */
export type ListedPresetOffer = PresetOffer<PresetSummary>;

/**
 * The whole of one visit's wait, from the tap: the read, the adapter's chunk and the adaptations. Past it the offers
 * that finished are what is offered. The read has its own, shorter bound (`LISTING_TIMEOUT_MS`).
 */
export const PRESET_OFFERS_BUDGET_MS = 5_000;

/** Grepped for in a platform log view, as `[generation]` is. */
const PRESETS_LOG_LABEL = "[presets]";

export interface PresetOffersRequest {
  readonly room: DesignRoom;
  /** Aborted when the customer leaves the composition or the screen goes: the run then ends with nothing. */
  readonly signal: AbortSignal;
  /** Lends the probe factory; it is `use-generation.ts`'s, the one module that names the adapter. */
  readonly loadProbeFactory: () => Promise<BodyProbeFactory>;
}

/** The offers for `request.room`: ordered by ADR 0109 Amendment A4, empty on every failure. Never rejects. */
export async function loadPresetOffers(
  request: PresetOffersRequest,
): Promise<readonly ListedPresetOffer[]> {
  const startedAt = performance.now();
  try {
    return await offersWithinBudget(request, startedAt);
  } catch {
    reportNoPresets("evaluation-failed");
    return [];
  }
}

async function offersWithinBudget(
  request: PresetOffersRequest,
  startedAt: number,
): Promise<readonly ListedPresetOffer[]> {
  const { room, signal } = request;
  const listing = await fetchPresetListing({ room, signal });
  if (listing.kind === "unavailable") {
    reportUnavailableListing(listing.reason);
    return [];
  }
  // An empty library, today's common case, costs no lease and does not even fetch the adapter's chunk.
  if (listing.presets.length === 0) return [];

  const deadline = startedAt + PRESET_OFFERS_BUDGET_MS;
  const probeAt = await withinTheBudget(request.loadProbeFactory(), deadline);
  if (signal.aborted) return [];
  if (probeAt === undefined) {
    reportNoPresets("adapter-late-or-failed");
    return [];
  }
  return evaluatePresetsWithinBudget({
    room,
    presets: listing.presets,
    probeAt,
    deadline,
    signal,
  });
}

interface BudgetedEvaluation {
  readonly room: DesignRoom;
  readonly presets: readonly PresetSummary[];
  readonly probeAt: BodyProbeFactory;
  /** On the `performance.now()` clock, in milliseconds. */
  readonly deadline: number;
  readonly signal: AbortSignal;
}

/**
 * The listing's candidates adapted to the room, one per task, then ordered. A candidate is skipped when the clock plus
 * the slowest one so far would pass the deadline, so the budget is overrun by a mis-estimate and not by a whole
 * candidate. What finished before that, or before the customer left, is what is returned. Each adaptation leases its
 * probe and gives it back before it returns (ADR 0076), so stopping between candidates leaks nothing.
 */
async function evaluatePresetsWithinBudget(
  input: BudgetedEvaluation,
): Promise<readonly ListedPresetOffer[]> {
  const { room, presets, probeAt, deadline, signal } = input;
  const occurredAt = new Date().toISOString();
  const candidates = matchPresets(presetRoomOf({ room }), presets);
  const offers: ListedPresetOffer[] = [];
  let slowestMs = 0;

  for (const preset of candidates) {
    if (signal.aborted) return [];
    if (performance.now() + slowestMs > deadline) break;
    const startedAt = performance.now();
    const adaptation = adaptPresetToRoom({ preset, room, occurredAt, probeAt });
    slowestMs = Math.max(slowestMs, performance.now() - startedAt);
    if (adaptation.ok) {
      offers.push({
        preset,
        design: adaptation.design,
        changes: adaptation.changes,
      });
    }
    await handBackTheMainThread();
  }
  return signal.aborted ? [] : orderPresetOffers(offers);
}

/** `work`, or `undefined` once the deadline passes first or `work` fails. A chunk that never arrives ends the wait. */
async function withinTheBudget<Value>(
  work: Promise<Value>,
  deadline: number,
): Promise<Value | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<undefined>((resolve) => {
    timer = setTimeout(
      () => {
        resolve(undefined);
      },
      Math.max(0, deadline - performance.now()),
    );
  });
  try {
    return await Promise.race([work, expiry]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** One task boundary: input and paint run between two candidates. */
function handBackTheMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** An abort is the customer leaving, not a failure, so it is not reported. */
function reportUnavailableListing(reason: ListingUnavailableReason): void {
  if (reason !== "aborted") reportNoPresets(reason);
}

/**
 * Written down in the shape `use-generation.ts` writes its lines, with a category and nothing of the body: the listing
 * is untrusted text and nothing of it belongs in a log. `console` is the whole transport, and nothing may escape.
 */
function reportNoPresets(reason: string): void {
  try {
    console.warn(PRESETS_LOG_LABEL, { event: "presets-unavailable", reason });
  } catch {
    // A diagnostic that throws would end a run that was only meant to be quiet.
  }
}
