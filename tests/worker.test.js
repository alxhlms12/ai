import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { extractArtifacts } from "../src/artifacts.js";

function request(path, { method = "GET", body, headers = {} } = {}, env = {}) {
  return worker.fetch(new Request(`https://openchat.test${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
}

test("public model list only exposes the configured allowlist", async () => {
  const response = await request("/api/models");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.models.length >= 3);
  assert.ok(data.models.some((model) => model.id === "@cf/zai-org/glm-4.7-flash"));
  assert.ok(data.models.every((model) => model.freeEligible === true));
  assert.ok(data.models.some((model) => model.thinking?.supported === false));
});

test("plugins endpoint reports modular defaults", async () => {
  const response = await request("/api/plugins");
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.plugins.some((plugin) => plugin.id === "web_proxy"));
  assert.ok(data.plugins.some((plugin) => plugin.id === "custom_instructions"));
});

test("native Workers AI binding works without an application API key", async () => {
  const fakeAI = {
    async run(model, options) {
      assert.equal(model, "@cf/zai-org/glm-4.7-flash");
      assert.ok(Array.isArray(options.messages));
      return { response: "Hello without a custom API key.", finish_reason: "stop" };
    }
  };
  const response = await request("/api/chat", {
    method: "POST",
    body: { model: "@cf/zai-org/glm-4.7-flash", stream: false, messages: [{ role: "user", content: "Hello" }] }
  }, { AI: fakeAI });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.text, "Hello without a custom API key.");
});

test("non-allowlisted model is rejected without running inference", async () => {
  const response = await request("/api/chat", {
    method: "POST",
    body: { model: "provider/paid-model", messages: [{ role: "user", content: "Hello" }] }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "MODEL_NOT_ALLOWED");
});

test("thinking controls are rejected when model metadata says unsupported", async () => {
  const response = await request("/api/chat", {
    method: "POST",
    body: { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", thinking: "high", messages: [{ role: "user", content: "Hello" }] }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "THINKING_UNSUPPORTED");
});

test("Web Proxy rejects plain HTTP without making a network request", async () => {
  const response = await request("/api/proxy", {
    method: "POST",
    body: { url: "http://example.com/" }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "PROXY_REQUEST_REJECTED");
});

test("Web Proxy blocks local destinations without making a network request", async () => {
  const response = await request("/api/proxy", {
    method: "POST",
    body: { url: "https://127.0.0.1/admin" }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "PROXY_REQUEST_REJECTED");
});

test("artifact extraction returns direct-download content with filename and MIME type", () => {
  const artifacts = extractArtifacts('Download this file:\n```python filename="hello.py"\nprint("hello")\n```');
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].name, "hello.py");
  assert.equal(artifacts[0].mime_type, "text/x-python");
  assert.equal(artifacts[0].delivery, "browser-download");
  assert.ok(artifacts[0].content_base64);
});

test("non-streaming chat returns one normalized JSON envelope and no duplicated events", async () => {
  const fakeAI = {
    async run(model, options) {
      return { response: "Hello from test model.", usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 }, finish_reason: "stop" };
    }
  };
  const response = await request("/api/chat", {
    method: "POST",
    body: { model: "@cf/zai-org/glm-4.7-flash", stream: false, messages: [{ role: "user", content: "Hello" }], plugins: { web_proxy: { enabled: false }, custom_instructions: { enabled: false } } }
  }, { AI: fakeAI });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.model, "@cf/zai-org/glm-4.7-flash");
  assert.equal(payload.text, "Hello from test model.");
  assert.deepEqual(payload.artifacts, []);
  assert.equal(payload.usage.total_tokens, 6);
  assert.deepEqual(payload.events, []);
  assert.equal(payload.error, null);
});

test("tool-call loop uses Workers AI binding call format and exposes proxy failures transparently", async () => {
  let calls = 0;
  const fakeAI = {
    async run(model, options) {
      calls++;
      if (options.tools && calls === 1) return { tool_calls: [{ name: "web_proxy_get", arguments: { url: "http://127.0.0.1/secret", purpose: "test guard" } }] };
      return { response: "The request was blocked by the proxy safety rules.", finish_reason: "stop" };
    }
  };
  const response = await request("/api/chat", {
    method: "POST",
    body: { model: "@cf/zai-org/glm-4.7-flash", stream: false, messages: [{ role: "user", content: "Fetch a local test URL" }], plugins: { web_proxy: { enabled: true }, custom_instructions: { enabled: false } } }
  }, { AI: fakeAI });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.text, /blocked/i);
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0].plugin, "web_proxy");
  assert.equal(payload.events[0].status, 0);
  assert.ok(payload.events[0].storage_key.startsWith("proxy-response-"));
  assert.equal(calls, 2);
});
