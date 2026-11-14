"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DesignSchema,
  type KitchenViewed3dVersion,
} from "@lemnaria/configurator-domain";

import {
  classifySignedInAnswer,
  type AccountAnswer,
} from "@/account/account-answer";

import type { ShownDesign } from "./shown-design";
import {
  askStaffRoute,
  failureOf,
  type StaffReadFailure,
} from "./staff-read-request";
import { raiseStaffSessionExpired } from "./staff-session-expiry";
import { ownValueOf } from "./staff-kitchens-wire-reading";

// The endpoint writes the audit row, so a read is asked once and again only on a retry (ADR 0180).

const STAFF_KITCHENS_ENDPOINT = "/api/staff/kitchens";
const UNREADABLE_STATUS = 422;
const UNREADABLE_CODE = "STAFF_KITCHEN_UNREADABLE";
const SOURCES: readonly ShownDesign["source"][] = ["as-sent", "current"];

export type StaffKitchen3dState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly failure: StaffReadFailure }
  /** The one refusal: no such kitchen, or not one staff may open. */
  | { readonly phase: "not-found" }
  | { readonly phase: "forbidden" }
  /** The kitchen exists and may be read, but holds no copy this build can show. */
  | { readonly phase: "unreadable" }
  | { readonly phase: "ready"; readonly shown: ShownDesign };

export interface StaffKitchen3dReading {
  readonly state: StaffKitchen3dState;
  readonly retry: () => void;
}

type Step =
  | { readonly kind: "state"; readonly state: StaffKitchen3dState }
  | { readonly kind: "sign-in" }
  | { readonly kind: "aborted" };

/** What was read, and for which kitchen and copy: an answer is shown only beside the arguments it answered. */
interface HeldReading {
  readonly designId: string;
  readonly version: KitchenViewed3dVersion | undefined;
  readonly state: StaffKitchen3dState;
}

const LOADING: StaffKitchen3dState = { phase: "loading" };

export function useStaffKitchen3d({
  designId,
  version,
}: {
  readonly designId: string;
  readonly version: KitchenViewed3dVersion | undefined;
}): StaffKitchen3dReading {
  const [held, setHeld] = useState<HeldReading>({
    designId,
    version,
    state: LOADING,
  });
  const controllerRef = useRef<AbortController | undefined>(undefined);

  const read = useCallback(
    function read(): void {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      void readKitchen3d({ designId, version }, controller.signal).then(
        (step) => {
          if (step.kind === "aborted") return;
          if (step.kind === "sign-in") {
            raiseStaffSessionExpired({
              askAgain: () => {
                if (!controller.signal.aborted) read();
              },
            });
            return;
          }
          setHeld({ designId, version, state: step.state });
        },
      );
    },
    [designId, version],
  );

  useEffect(() => {
    read();
    return () => {
      controllerRef.current?.abort();
    };
  }, [read]);

  const retry = useCallback(() => {
    setHeld({ designId, version, state: LOADING });
    read();
  }, [designId, version, read]);

  const isForThisRequest =
    held.designId === designId && held.version === version;
  return { state: isForThisRequest ? held.state : LOADING, retry };
}

async function readKitchen3d(
  request: {
    readonly designId: string;
    readonly version: KitchenViewed3dVersion | undefined;
  },
  signal: AbortSignal,
): Promise<Step> {
  const reading = await askStaffRoute(addressOf(request), signal);
  switch (reading.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "offline":
      return stateStep({ phase: "failed", failure: { kind: "offline" } });
    case "answered":
      return stepOf(reading.answer);
  }
}

function addressOf({
  designId,
  version,
}: {
  readonly designId: string;
  readonly version: KitchenViewed3dVersion | undefined;
}): string {
  const path = `${STAFF_KITCHENS_ENDPOINT}/${encodeURIComponent(designId)}/3d`;
  return version === undefined ? path : `${path}?version=${version}`;
}

function stepOf(answer: AccountAnswer): Step {
  if (isUnreadableAnswer(answer)) return stateStep({ phase: "unreadable" });
  const outcome = classifySignedInAnswer("staff-kitchen", answer);
  switch (outcome.kind) {
    case "received":
      return stateStep(readyOrFailed(outcome.body));
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return stateStep({ phase: "forbidden" });
    case "kitchen-unavailable":
      return stateStep({ phase: "not-found" });
    default:
      return stateStep({ phase: "failed", failure: failureOf(outcome) });
  }
}

function isUnreadableAnswer(answer: AccountAnswer): boolean {
  return (
    answer.status === UNREADABLE_STATUS &&
    ownValueOf(answer.body, "code") === UNREADABLE_CODE
  );
}

/** The design and its source, or a failure when the body is not exactly that: a document this build cannot read must
 *  not reach the scene. */
function readyOrFailed(body: unknown): StaffKitchen3dState {
  const design = DesignSchema.safeParse(ownValueOf(body, "design"));
  const source = ownValueOf(body, "source");
  if (!design.success || !isShownSource(source)) {
    return { phase: "failed", failure: { kind: "failed" } };
  }
  return {
    phase: "ready",
    shown: { design: design.data, source },
  };
}

function isShownSource(value: unknown): value is ShownDesign["source"] {
  return SOURCES.some((known) => known === value);
}

function stateStep(state: StaffKitchen3dState): Step {
  return { kind: "state", state };
}
