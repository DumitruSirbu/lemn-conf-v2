/**
 * One console call, flattened to the text a log drain would end up holding.
 *
 * Every designs-route line now leaves `emitDesignLogLine` as a label and a **structured object**
 * (`design-failure-log.ts`), so the `String(arg)` these captures used to do answers
 * `"[object Object]"` — a value that is short, control-character-free and contains no secret
 * whatever the caller sent. Assertions written against it would pass over a line that carried the
 * payload verbatim.
 *
 * The object's **values** are joined rather than `JSON.stringify`d, and that is the whole point of
 * the function: `JSON.stringify` escapes a control character to the two-character sequence `\n`, so
 * the forgery assertions — "no line this application writes may contain a raw newline" — would stop
 * being able to fail. Joining the values leaves every character exactly as the logger was handed it.
 */
export function flattenLogArguments(args: readonly unknown[]): string {
  return args.map(stringifyLogArgument).join(" ");
}

function stringifyLogArgument(argument: unknown): string {
  if (typeof argument !== "object" || argument === null)
    return String(argument);
  return Object.values(argument).map(String).join(" ");
}
