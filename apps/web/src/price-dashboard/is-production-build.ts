/**
 * Whether this is a production build: the one place the server-side readers ask it.
 *
 * A module that a browser bundle contains does not ask it. It spells `process.env.NODE_ENV === "production"` out where it
 * chooses between nothing and a stand-in client: the bundler replaces that literal and drops the branch with the dynamic
 * import behind it, while a call into this module is not folded and would ship the stand-in's chunk.
 */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}
