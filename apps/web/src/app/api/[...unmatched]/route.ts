/**
 * Every `/api` address no named route answers, whatever the method: an empty `404`, never a document. Without it Next
 * serves its prerendered `_not-found` page, whose scripts carry no CSP nonce (8Q.4). A named route keeps its address,
 * and a method it does not export keeps its own `405`: a more specific path wins over this catch-all.
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
