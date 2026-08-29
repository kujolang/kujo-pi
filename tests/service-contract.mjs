import assert from "node:assert/strict";
import { createServer } from "node:http";
import { boundedResponse, fetchWithRetry, sameOriginUrl } from "../src/core.mjs";

let retries = 0;
const server = createServer((request, response) => {
  if (request.url === "/retry" && ++retries < 3) {
    response.writeHead(503).end("retry");
    return;
  }
  if (request.url === "/auth") {
    const accepted = request.headers.authorization === "Bearer fixture-token" && request.headers["x-kujo-audience"] === "fixture-audience";
    response.writeHead(accepted ? 200 : 401, { "content-type": "application/json" }).end(accepted ? '{"ok":true}' : '{"error":"unauthorized"}');
    return;
  }
  if (request.url === "/redirect") {
    response.writeHead(302, { location: "http://example.com/" }).end();
    return;
  }
  if (request.url === "/large") {
    response.writeHead(200).end("x".repeat(100_000));
    return;
  }
  if (request.url === "/malformed") {
    response.writeHead(200, { "content-type": "application/json" }).end("{not-json");
    return;
  }
  if (request.url === "/slow") {
    setTimeout(() => response.writeHead(200).end("slow"), 500);
    return;
  }
  response.writeHead(200).end("ok");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
try {
  const retried = await fetchWithRetry((signal) => fetch(sameOriginUrl(base, "/retry"), { signal }), undefined, 3, 1_000);
  assert.equal(retried.status, 200);
  assert.equal(retries, 3);

  const denied = await fetch(sameOriginUrl(base, "/auth"));
  assert.equal(denied.status, 401);
  const accepted = await fetch(sameOriginUrl(base, "/auth"), { headers: { authorization: "Bearer fixture-token", "x-kujo-audience": "fixture-audience" } });
  assert.equal(accepted.status, 200);

  await assert.rejects(fetch(sameOriginUrl(base, "/redirect"), { redirect: "error" }));
  const large = await fetch(sameOriginUrl(base, "/large"));
  assert.match(await boundedResponse(large, 1_000), /output truncated at 1000 characters/);
  const malformed = await fetch(sameOriginUrl(base, "/malformed"));
  assert.equal(await boundedResponse(malformed), "{not-json");
  await assert.rejects(fetchWithRetry((signal) => fetch(sameOriginUrl(base, "/slow"), { signal }), undefined, 1, 25), /abort|timeout/i);
  assert.equal(sameOriginUrl("https://watchdog.example.test", "/health").protocol, "https:");
  assert.throws(() => sameOriginUrl("http://watchdog.example.test", "/health"), /HTTPS/);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("service policy and failure fixture validation passed");
