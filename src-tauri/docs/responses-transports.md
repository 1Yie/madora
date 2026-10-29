# Custom Responses transports

Verified against first-party sources on 2026-10-29:

- [Responses WebSocket guide](https://developers.openai.com/api/docs/guides/websocket-mode):
  connect to `/v1/responses`, send a top-level `response.create` request using
  Responses create fields; omit `stream` and `background`; `store:false` works.
- [WebSocket events](https://developers.openai.com/api/reference/resources/responses/websocket-events):
  text arrives in `response.output_text.delta`; `response.completed` is success,
  while `response.failed`, `response.incomplete`, and `error` are failures.
  The published client-event contract documents `response.create`, not a
  Realtime-style `response.cancel`.
- [Official Node SDK auth](https://github.com/openai/openai-node/blob/master/src/resources/responses/ws-base.ts):
  the handshake uses `Authorization: Bearer <API key>`.
- [HTTP Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create):
  HTTP uses `POST /v1/responses`; streaming uses SSE.

`openai-responses` selects HTTP; `openai-codex` selects this documented Responses
WebSocket transport. The latter name does **not** implement ChatGPT subscription
OAuth, `chatgpt.com/backend-api/codex`, account headers, or undocumented provider
credentials. API/model access and compatibility remain the endpoint's responsibility.
GPT-5 Codex models use low-effort reasoning without a temperature parameter;
the existing GPT-5.6 and GPT-6 sampling rules are retained.

Both modes reuse FIM prompts, payload construction and response text extraction.
Origins, `/v1` bases, full `/responses` endpoints and reverse-proxy base paths are
accepted. URL userinfo, query strings and fragments are rejected, so keys belong
only in headers. HTTPS/WSS becomes WSS; HTTP/WS becomes WS only where the
existing HTTP security policy permits plaintext (loopback/private networks).
TLS uses WebPKI roots. Public-network plaintext WebSocket connections are rejected.

Each WebSocket request has its own connection and no server-side response chain
or reconnect/replay. Existing service cache keys include the custom protocol;
existing in-flight deduplication and cancellation drop the owned socket. Explicit
callback errors close it as well. A close/drop is only best-effort remote
cancellation; the API does not guarantee that server-side computation stops.
No invented cancel event is sent and no cancellation result is cached.

WebSocket limits: 10s connect, 30s idle read, 60s total; 1 MiB per frame, message,
request and accumulated output. Ping/Pong is handled; malformed JSON, binary
data, premature close, oversize frames, API errors and incomplete responses fail.
Custom Responses HTTP streaming also caps accumulated output at 1 MiB.
There is no persistent-connection performance benefit in this first implementation.
Local scripted HTTP/WebSocket tests validate the wire contract; they do not
claim live OpenAI API or ChatGPT/Codex OAuth interoperability.
