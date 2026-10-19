// Hands the browser a file it was given as a blob, through a temporary object URL and a temporary anchor. Nothing is
// kept: the anchor is gone as soon as it has been pressed and the URL is revoked when its lifetime ends.

/** How long the object URL outlives the press. A download the browser starts late (a save dialog left open, a slow disk)
 *  still reads the blob through this URL, so revoking it within seconds can cancel the download. */
const OBJECT_URL_LIFETIME_MS = 60_000;

export function saveFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  revokeAfterLifetimeOrPageHide(objectUrl);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  // Some Firefox versions ignore a click on an anchor that is not in the document.
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

/** Whichever comes first frees the blob: the lifetime ending, or the document going away. */
function revokeAfterLifetimeOrPageHide(objectUrl: string): void {
  const revoke = () => {
    window.clearTimeout(timer);
    window.removeEventListener("pagehide", revoke);
    URL.revokeObjectURL(objectUrl);
  };
  const timer = window.setTimeout(revoke, OBJECT_URL_LIFETIME_MS);
  window.addEventListener("pagehide", revoke);
}
