// What M7C wave C3 added to a generated kitchen, taken off again: the `top` steps, their insert commands
// and the placements they produced, and nothing else. This helper assumes a top insert leaves every other
// field of the document alone (`emptyColumns`, `columnExtents`, the plan); it does not check it. The check
// is the caller's digest: the digest tests reproduce the digests recorded before the top row over whole
// documents, which fails if that assumption is ever false.
interface LoggedStep {
  readonly role: string;
  readonly placementId?: string;
  readonly commands: readonly unknown[];
}

interface GenerationResult {
  readonly ok: boolean;
  readonly design?: { readonly placements: readonly { readonly id: string }[] };
  readonly log: {
    readonly steps: readonly LoggedStep[];
    readonly commands: readonly unknown[];
  };
}

/** `result` as generation made it before the top row: a copy, the input is never mutated. */
export function withTheTopRowTakenOff(result: unknown): unknown {
  const generated = result as GenerationResult;
  const topSteps = generated.log.steps.filter((step) => step.role === "top");
  if (topSteps.length === 0) return result;
  const topPlacementIds = new Set(topSteps.map((step) => step.placementId));
  const topCommands = new Set(
    topSteps.flatMap((step) => step.commands.map(commandKey)),
  );
  return {
    ...generated,
    ...(generated.design === undefined
      ? {}
      : {
          design: {
            ...generated.design,
            placements: generated.design.placements.filter(
              (placement) => !topPlacementIds.has(placement.id),
            ),
          },
        }),
    log: {
      ...generated.log,
      steps: generated.log.steps.filter((step) => step.role !== "top"),
      commands: generated.log.commands.filter(
        (command) => !topCommands.has(commandKey(command)),
      ),
    },
  };
}

function commandKey(command: unknown): string {
  return JSON.stringify(command);
}
