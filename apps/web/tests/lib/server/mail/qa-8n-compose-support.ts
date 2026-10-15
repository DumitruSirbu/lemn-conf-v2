import { createTransport } from "nodemailer";

import type { GmailMessageOptions } from "@/lib/server/mail/gmail-mail-sender";

export interface RawMessage {
  /** The whole message as the library composed it, nothing sent. */
  readonly raw: string;
  readonly headerBlock: string;
  readonly body: string;
  /** Lower-case header names in the order written. */
  readonly headerNames: readonly string[];
  readonly headers: ReadonlyMap<string, string>;
  readonly envelopeRecipients: readonly string[];
  readonly envelopeSender: string;
}

/** The headers a clean plain-text notice carries, and the only ones any message may carry. */
export const ALLOWED_HEADER_NAMES = Object.freeze([
  "content-transfer-encoding",
  "content-type",
  "date",
  "from",
  "message-id",
  "mime-version",
  "subject",
  "to",
]);

/**
 * The real composer through the library's own stream transport: the message is built and no socket opens. The
 * caller holds the network guard, since the library is imported here.
 */
export async function composeRaw(
  options: GmailMessageOptions,
): Promise<RawMessage> {
  const info = await createTransport({
    streamTransport: true,
    buffer: true,
  }).sendMail(options);
  const raw = (info.message as Buffer).toString("utf8");
  const separator = raw.search(/\r?\n\r?\n/);
  const headerBlock = separator === -1 ? raw : raw.slice(0, separator);
  const body =
    separator === -1 ? "" : raw.slice(separator).replace(/^\r?\n\r?\n/, "");
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const entries = unfolded.split(/\r?\n/).map((line) => {
    const colon = line.indexOf(":");
    return [
      line.slice(0, colon).toLowerCase(),
      line.slice(colon + 1).trim(),
    ] as const;
  });
  return {
    raw,
    headerBlock,
    body,
    headerNames: entries.map(([name]) => name),
    headers: new Map(entries),
    envelopeRecipients: info.envelope.to,
    envelopeSender: info.envelope.from as string,
  };
}

/** The text part as a reader would see it: the transfer encoding undone, line ends as `\n`. */
export function decodedBodyOf(composed: RawMessage): string {
  const encoding = (
    composed.headers.get("content-transfer-encoding") ?? "7bit"
  ).toLowerCase();
  const bytes = bodyBytes(composed.body, encoding);
  return bytes.toString("utf8").replace(/\r\n/g, "\n");
}

function bodyBytes(body: string, encoding: string): Buffer {
  if (encoding === "base64") return Buffer.from(body, "base64");
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  return Buffer.from(body, "utf8");
}

function decodeQuotedPrintable(body: string): Buffer {
  const joined = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < joined.length; index += 1) {
    const character = joined.charAt(index);
    const hex = joined.slice(index + 1, index + 3);
    if (character === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(character, "utf8"));
    }
  }
  return Buffer.from(bytes);
}
