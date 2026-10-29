# Mobile custom OpenAI protocols

## Official wire contract

- [OpenAI WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode):
  Responses WebSocket uses `/v1/responses`. Client messages are top-level
  `response.create` bodies, not Realtime API nested `response` objects.
  `stream` and `background` are not sent. Output uses Responses delta events and
  `response.completed`; `response.failed`, `response.incomplete`, `error`, and a
  disconnect without a terminal response are errors.
- [Official OpenAI SDK WebSocket base implementation](https://github.com/openai/openai-node/blob/master/src/resources/responses/ws-base.ts)
  defines the Responses endpoint and Bearer API-key authentication.
  This is the public API, not ChatGPT subscription OAuth.
- [React Native WebSocket implementation](https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/WebSocket/WebSocket.js)
  accepts `{ headers }` as its third constructor argument.
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was checked
  against this app's installed SDK before implementation.

## Behavior and limits

- `openai-responses`: HTTP JSON for `generateCompletion`, HTTP SSE for
  `streamCompletion`. Only HTTP(S) URLs are accepted.
- `openai-codex`: both APIs use one isolated WebSocket per completion. The
  non-streaming caller aggregates the same events. Each request closes its
  socket, removes listeners and clears its 60-second timer on success, error,
  timeout or cancellation. There is no unsupported `response.cancel` frame,
  no implicit conversation continuation, and no shared in-flight socket.
- An API key is sent only through authentication headers, never URL query,
  userinfo, frames or subprotocols. Web browsers cannot set handshake headers:
  WebSocket calls fail explicitly before connecting. Use Responses HTTP on Web
  (the endpoint must allow browser CORS).
- Public endpoints require HTTPS/WSS. Explicit plaintext endpoints are limited
  to loopback, RFC1918, link-local, IPv6 ULA and `.localhost`/`.local`/`.lan`,
  matching self-hosted local-network usage. URLs reject credentials, query and
  fragments; `/v1` and `/v1/responses` are not duplicated, and proxy prefixes
  are preserved.
- Requests, individual messages/SSE buffers, HTTP JSON bodies and accumulated
  output each have a 1 MiB UTF-8 limit. Counting does not require TextEncoder.
  Streaming HTTP readers enforce the limit while receiving. On RN runtimes
  without a reader/TextDecoder, `response.text()` is the compatibility fallback:
  it is checked before parsing, but the fetch implementation may already have
  buffered the whole body. This fallback cannot enforce a network-level memory
  bound. Native WebSocket implementations also receive a frame before JS can
  check its size.
- GPT-5 Codex models use low reasoning effort, at least 512 output tokens and no
  temperature. Settings keep the existing three serialized values and defaults;
  the two additions are `openai-responses` and `openai-codex`.
