/**
 * Every `/internal` address no named page answers, whatever the method: an empty `404`, never a document. Without it
 * Next serves its prerendered `_not-found` page, whose scripts carry no CSP nonce (8Q.4). `scene-shot` and
 * `mirror-shot` keep their own addresses, and their own `404` when the capture flag is off.
 */
function answerNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export {
  answerNotFound as DELETE,
  answerNotFound as GET,
  answerNotFound as OPTIONS,
  answerNotFound as PATCH,
  answerNotFound as POST,
  answerNotFound as PUT,
};
