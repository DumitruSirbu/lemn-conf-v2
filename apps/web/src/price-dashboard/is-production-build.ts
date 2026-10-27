/** Whether this is a production build: the one place the server-side readers ask it. */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}
