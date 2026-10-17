import { PUBLIC_ORIGIN_VARIABLE } from "../../../src/lib/server/public-origin-variable";

/**
 * What a suite's server is given so that the link in the shop's notice is under its own origin, never one the
 * runner's environment brought in from an env file. Set apart from the mail's names: the origin is not a mail
 * variable, and its absence only leaves the notice without its link.
 */
export function publicOriginEnvironmentOf(
  origin: string,
): Readonly<Record<typeof PUBLIC_ORIGIN_VARIABLE, string>> {
  return Object.freeze({ [PUBLIC_ORIGIN_VARIABLE]: origin });
}
