// Hands the browser a file it was given as a blob, through a temporary object URL and a temporary anchor. Nothing is
// kept: the anchor is gone as soon as it has been pressed and the URL is revoked soon after.

/** How long the object URL outlives the press. Some browsers cancel a download whose URL is revoked in the same tick. */
const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export function saveFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  // Some Firefox versions ignore a click on an anchor that is not in the document.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, OBJECT_URL_REVOKE_DELAY_MS);
}
