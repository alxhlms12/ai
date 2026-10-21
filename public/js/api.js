async function parseError(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  const error = payload?.error || {};
  const message = error.message || `Request failed (${response.status}).`;
  const result = new Error(message);
  result.code = error.code || "REQUEST_FAILED";
  result.status = response.status;
  throw result;
}
async function postJson(path, body, options = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) await parseError(response);
  return response;
}

export async function getModels() {
  const response = await fetch("/api/models", { cache: "no-store" });
  if (!response.ok) await parseError(response);
  return response.json();
}
export async function getPlugins() {
  const response = await fetch("/api/plugins", { cache: "no-store" });
  if (!response.ok) await parseError(response);
  return response.json();
}
export async function health() {
  const response = await fetch("/api/health", { cache: "no-store" });
  if (!response.ok) await parseError(response);
  return response.json();
}
export async function chatStream(body, handlers = {}) {
  const response = await postJson("/api/chat", body, { signal: handlers.signal });
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    if (payload.error) throw Object.assign(new Error(payload.error.message || "Inference failed."), { code: payload.error.code || "INFERENCE_FAILED" });
    if (payload.text) handlers.onDelta?.(payload.text);
    for (const event of payload.events || []) handlers.onActivity?.(event);
    handlers.onMeta?.({ model: payload.model, usage: payload.usage, finish_reason: payload.finish_reason });
    handlers.onDone?.(payload);
    return;
  }
  if (!response.body) throw new Error("The server did not return a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "error") throw Object.assign(new Error(event.error?.message || "Inference failed."), { code: event.error?.code || "INFERENCE_FAILED" });
        if (event.type === "delta") handlers.onDelta?.(event.text || "");
        else if (event.type === "activity") handlers.onActivity?.(event.event);
        else if (event.type === "meta") handlers.onMeta?.(event);
        else if (event.type === "done") handlers.onDone?.(event);
      }
    }
  } finally { try { reader.releaseLock(); } catch {} }
  if (buffer.trim()) {
    try { const event = JSON.parse(buffer); if (event.type === "done") handlers.onDone?.(event); } catch {}
  }
}
export async function generateImage(prompt, steps = 4, signal) {
  const response = await postJson("/api/image", { prompt, steps }, { signal });
  return response.blob();
}
export async function proxyGet(url, purpose = "Manual DevTools request", signal) {
  const response = await postJson("/api/proxy", { url, purpose }, { signal });
  return response.json();
}
