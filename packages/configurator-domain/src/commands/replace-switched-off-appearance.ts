// A switched-off colour or handle replaced at every level a design stores it, as one result (A-16).
// Two functions, not one taking a kind: they refuse with different codes and publish different effects, so a
// discriminator would be a flag argument. They take no catalogue: a stored occurrence on a body that takes no colour or
// handle is never read, so equality is the one rule. Availability is the caller's, as for the setters (ADR 0099).
import { designOffersFinish } from "../design-material.js";
import {
  HandleSchema,
  type CabinetBody,
  type Design,
  type DesignPlacement,
  type DesignSettings,
  type Handle,
} from "../design.js";
import { FinishSchema, sameFinish, type Finish } from "../materials.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  withSettings,
  type ColourReplacedEffect,
  type CommandResult,
  type HandleReplacedEffect,
} from "./command-result.js";

export interface ReplaceColourInput {
  readonly design: Design;
  readonly from: Finish;
  readonly to: Finish;
  readonly occurredAt: string;
}

export interface ReplaceHandleInput {
  readonly design: Design;
  readonly from: Handle;
  readonly to: Handle;
  readonly occurredAt: string;
}

/**
 * Rewrites `settings.finish` and each `body.finish` that is `from` to `to`. Refuses an invalid timestamp, then a
 * `from` that is no well-formed colour (a switched-off one is well-formed, and an absent one matches nothing) or a `to`
 * the design's material does not offer (`FINISH_NOT_OFFERED`, as `setGlobalFinish` does; an undeclared material offers
 * anything schema-valid, ADR 0078 decision 3), returning the design as given. Replacing a colour by itself, or one the
 * design does not store, is not a refusal and changes no stored value (`updatedAt` still moves).
 */
export function replaceColour(
  input: ReplaceColourInput,
): CommandResult<ColourReplacedEffect> {
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(input.design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  if (
    !FinishSchema.safeParse(input.from).success ||
    !designOffersFinish(input.design, input.to)
  ) {
    return refuse(input.design, { code: "FINISH_NOT_OFFERED", params: {} });
  }
  const { from, to } = input;
  const design = rewritten(input.design, input.occurredAt, {
    settings: (settings) =>
      settings.finish !== undefined && sameFinish(settings.finish, from)
        ? { ...settings, finish: to }
        : settings,
    body: (body) =>
      body.finish !== undefined && sameFinish(body.finish, from)
        ? { ...body, finish: to }
        : body,
  });
  return succeedWith(design, { type: "colour_replaced", from, to });
}

/**
 * Rewrites `settings.handle`, `settings.topRowHandle` and each `body.handle` that is `from` to `to`. Refuses an invalid
 * timestamp, then a `from` or `to` outside `HandleSchema` (`UNKNOWN_HANDLE`; an absent `from` would otherwise match every
 * absent handle), returning the design as given. A body with no handle of its
 * own is untouched, so it keeps following the kitchen's or the top row's.
 */
export function replaceHandle(
  input: ReplaceHandleInput,
): CommandResult<HandleReplacedEffect> {
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(input.design, { code: "INVALID_OCCURRED_AT", params: {} });
  }
  if (
    !HandleSchema.safeParse(input.from).success ||
    !HandleSchema.safeParse(input.to).success
  ) {
    return refuse(input.design, { code: "UNKNOWN_HANDLE", params: {} });
  }
  const { from, to } = input;
  const design = rewritten(input.design, input.occurredAt, {
    settings: (settings) => withHandlesReplaced(settings, from, to),
    body: (body) => (body.handle === from ? { ...body, handle: to } : body),
  });
  return succeedWith(design, { type: "handle_replaced", from, to });
}

/** The kitchen's handle and the top row's, each rewritten only when it is `from`; the same object when neither is. */
function withHandlesReplaced(
  settings: DesignSettings,
  from: Handle,
  to: Handle,
): DesignSettings {
  const stored = HANDLE_KEYS.filter((key) => settings[key] === from);
  if (stored.length === 0) return settings;
  return { ...settings, ...Object.fromEntries(stored.map((key) => [key, to])) };
}

const HANDLE_KEYS = ["handle", "topRowHandle"] as const;

/** How each level of the document is rewritten; each returns what it was given when nothing there is the item. */
interface LevelRewrites {
  readonly settings: (settings: DesignSettings) => DesignSettings;
  readonly body: (body: CabinetBody) => CabinetBody;
}

/**
 * The document with both levels rewritten, composed through `withSettings` and `withPlacements` so
 * `command-result.ts` stays the one place a command writes a new `Design`. A design with no `settings` does not gain
 * the key, and a cabinet nothing changed on is the very same object.
 */
function rewritten(
  design: Design,
  occurredAt: string,
  rewrites: LevelRewrites,
): Design {
  const withNewPlacements = withPlacements(
    design,
    design.placements.map((placement) => rewrittenBody(placement, rewrites)),
    occurredAt,
  );
  if (design.settings === undefined) return withNewPlacements;
  return withSettings(
    withNewPlacements,
    rewrites.settings(design.settings),
    occurredAt,
  );
}

function rewrittenBody(
  placement: DesignPlacement,
  rewrites: LevelRewrites,
): DesignPlacement {
  const body = rewrites.body(placement.body);
  return body === placement.body ? placement : { ...placement, body };
}
