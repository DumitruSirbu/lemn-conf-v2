/**
 * Every `/internal` address no named page answers, whatever the method: an empty `404`, never a document, because
 * Next's prerendered `_not-found` page carries no CSP nonce. `scene-shot` and `mirror-shot` keep their own addresses.
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
