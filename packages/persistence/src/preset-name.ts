import { isShowablePresetName } from "@lemnaria/configurator-domain";

/** What a stored name is shown as: itself, or `undefined` (the generated name) when it fails the name rule. A row written
 *  by hand, or by an older build, never makes a listing throw for its name. */
export function showablePresetName(stored: unknown): string | undefined {
  return isShowablePresetName(stored) ? stored : undefined;
}
