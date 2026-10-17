import type { RawMessage } from "./qa-8n-compose-support";

/** One part of a composed message, its transfer encoding undone and its line ends written as `\n`. */
export interface MimePart {
  readonly headers: ReadonlyMap<string, string>;
  readonly decoded: string;
}

const BOUNDARY = /boundary="([^"]+)"/;

/**
 * The parts of a top-level `multipart/alternative` message, in the order written. Throws for any other message, so a
 * test reading parts cannot pass over a single-part one.
 */
export function alternativePartsOf(composed: RawMessage): MimePart[] {
  const contentType = composed.headers.get("content-type") ?? "";
  const boundary = BOUNDARY.exec(contentType)?.[1];
  if (
    !contentType.startsWith("multipart/alternative;") ||
    boundary === undefined
  )
    throw new Error("the message is not one multipart/alternative");
  const sections = composed.body.split(`--${boundary}`);
  if (!(sections.at(-1) ?? "").startsWith("--"))
    throw new Error("the multipart body has no closing delimiter");
  return sections.slice(1, -1).map(partOf);
}

function partOf(section: string): MimePart {
  const text = section.replace(/^\r?\n/, "");
  const separator = text.search(/\r?\n\r?\n/);
  const headerBlock = text.slice(0, separator);
  const body = text
    .slice(separator)
    .replace(/^\r?\n\r?\n/, "")
    .replace(/\r?\n$/, "");
  const headers = new Map(
    headerBlock
      .replace(/\r?\n[ \t]+/g, " ")
      .split(/\r?\n/)
      .map((line) => {
        const colon = line.indexOf(":");
        return [
          line.slice(0, colon).toLowerCase(),
          line.slice(colon + 1).trim(),
        ] as const;
      }),
  );
  const encoding = (
    headers.get("content-transfer-encoding") ?? "7bit"
  ).toLowerCase();
  return { headers, decoded: decoded(body, encoding).replace(/\r\n/g, "\n") };
}

function decoded(body: string, encoding: string): string {
  if (encoding === "base64")
    return Buffer.from(body, "base64").toString("utf8");
  if (encoding === "quoted-printable") return quotedPrintable(body);
  return body;
}

function quotedPrintable(body: string): string {
  const joined = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < joined.length; index += 1) {
    const hex = joined.slice(index + 1, index + 3);
    if (joined.charAt(index) === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(joined.charAt(index), "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}
