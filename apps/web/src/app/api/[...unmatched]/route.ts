/**
 * Every `/api` address no named route answers, whatever the method: an empty `404`, never a document, because Next's
 * prerendered `_not-found` page carries no CSP nonce. A named route keeps its address and its own `405`.
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
