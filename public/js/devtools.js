import { state } from "./state.js";
import { dbAll, dbPut, dbClear } from "./storage.js";
import { proxyGet } from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const sizeLabel = (size = 0) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;
const timeLabel = (time = 0) => time < 1000 ? `${time} ms` : `${(time / 1000).toFixed(2)} s`;
let abortController = null;

export async function loadDevtools() {
  try {
    const saved = await dbAll("proxyResponses");
    const byId = new Map([...saved, ...state.requests].map((entry) => [entry.id || entry.storage_key, entry]));
    state.requests = [...byId.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  } catch {}
  return state.requests;
}

export async function recordActivity(event) {
  if (!event) return;
  const record = { ...event, id: event.id || event.storage_key || crypto.randomUUID(), timestamp: event.timestamp || Date.now() };
  state.requests = [record, ...state.requests.filter((item) => item.id !== record.id)].slice(0, 100);
  state.selectedRequestId = record.id;
  try { await dbPut("proxyResponses", record); } catch {}
  updateDevtoolsCount();
  window.dispatchEvent(new CustomEvent("openchat:request-recorded", { detail: record }));
}
export function updateDevtoolsCount() {
  const count = $("#devtoolsCount");
  if (count) count.textContent = String(state.requests.length);
}

export function openDevtools() {
  const mount = $("#devtoolsMount");
  if (!mount) return;
  state.activeDevTab = state.activeDevTab || "requests";
  mount.innerHTML = `<section class="devtools-panel" role="dialog" aria-label="OpenChat DevTools"><header class="devtools-head"><span class="devtools-title-mark">▤</span><strong>OpenChat DevTools</strong><small id="devtoolsTotal">${state.requests.length} captured</small><span class="grow"></span><button class="icon-button" id="devtoolsExport" title="Export DevTools history"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></svg></button><button class="icon-button" id="devtoolsClear" title="Clear response history"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></button><button class="icon-button" id="devtoolsClose" aria-label="Close DevTools"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><nav class="devtools-tabs"><button class="devtools-tab ${state.activeDevTab === "requests" ? "active" : ""}" data-devtab="requests">Requests</button><button class="devtools-tab ${state.activeDevTab === "headers" ? "active" : ""}" data-devtab="headers">Headers</button><button class="devtools-tab ${state.activeDevTab === "body" ? "active" : ""}" data-devtab="body">Body preview</button><button class="devtools-tab ${state.activeDevTab === "timing" ? "active" : ""}" data-devtab="timing">Timing & size</button><button class="devtools-tab ${state.activeDevTab === "test" ? "active" : ""}" data-devtab="test">Test GET</button></nav><div class="devtools-content" id="devtoolsContent"></div></section>`;
  $("#devtoolsClose", mount).addEventListener("click", () => { abortController?.abort(); mount.innerHTML = ""; });
  $("#devtoolsExport", mount).addEventListener("click", () => downloadBlob(JSON.stringify(state.requests, null, 2), "openchat-devtools.json", "application/json"));
  $("#devtoolsClear", mount).addEventListener("click", async () => {
    if (!confirm("Clear all locally stored proxy snapshots?")) return;
    state.requests = []; state.selectedRequestId = null;
    try { await dbClear("proxyResponses"); } catch {}
    updateDevtoolsCount(); openDevtools();
  });
  mount.querySelectorAll("[data-devtab]").forEach((button) => button.addEventListener("click", () => { state.activeDevTab = button.dataset.devtab; openDevtools(); }));
  renderPanelContent();
}

function selectedRequest() { return state.requests.find((item) => item.id === state.selectedRequestId) || state.requests[0] || null; }
function renderPanelContent() {
  const mount = $("#devtoolsContent");
  if (!mount) return;
  const tab = state.activeDevTab;
  if (tab === "test") { renderTestRequest(mount); return; }
  if (tab === "requests") {
    if (!state.requests.length) {
      mount.innerHTML = `<div class="empty-state">No proxy responses yet.<br>Enable Web Proxy and ask OpenChat to compare public sources, or use Test GET to inspect a public HTTPS URL directly.</div>`;
      return;
    }
    mount.innerHTML = `<div class="devtools-layout"><div class="devtools-list">${state.requests.map((request) => `<button class="request-item ${request.id === state.selectedRequestId ? "selected" : ""}" data-request="${escapeHtml(request.id)}"><div class="request-topline"><span class="request-method">${escapeHtml(request.action || "GET")}</span><span class="request-status ${request.status >= 200 && request.status < 400 ? "status-success" : "status-failure"}">${escapeHtml(request.status || "ERR")}</span></div><div class="request-url">${escapeHtml(safeHostPath(request.url))}</div><div class="request-meta">${timeLabel(request.duration_ms || 0)} · ${sizeLabel(request.size_bytes || 0)}</div></button>`).join("")}</div><div class="devtools-inspector" id="requestDetails"></div></div>`;
    mount.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => { state.selectedRequestId = button.dataset.request; state.activeDevTab = "headers"; openDevtools(); }));
    renderRequestDetail($("#requestDetails", mount), selectedRequest(), "requests");
    return;
  }
  const request = selectedRequest();
  if (!request) { mount.innerHTML = `<div class="empty-state">Select a captured request to inspect it.</div>`; return; }
  renderRequestDetail(mount, request, tab);
}
function renderRequestDetail(container, request, tab) {
  if (!container || !request) return;
  const headerPairs = Object.entries(request.headers || {});
  if (tab === "headers" || tab === "requests") {
    container.innerHTML = `<div class="inspector-section"><h3>General</h3>${kv("Request URL", request.url)}${kv("Request Method", request.action || "GET")}${kv("Status Code", `${request.status || 0} ${request.statusText || ""}`)}${kv("Content type", request.content_type || "—")}${kv("Storage key", request.storage_key || request.id)}</div><div class="inspector-section"><h3>Response headers · ${headerPairs.length}</h3>${headerPairs.length ? headerPairs.map(([key, value]) => kv(key, value)).join("") : '<div class="empty-state">No response headers were recorded.</div>'}</div><div class="button-row" style="justify-content:flex-start"><button class="standard-button" id="inspectBodyButton">View body</button><button class="standard-button" id="downloadSnapshotButton">Download snapshot JSON</button></div>`;
    $("#inspectBodyButton", container)?.addEventListener("click", () => { state.activeDevTab = "body"; openDevtools(); });
    $("#downloadSnapshotButton", container)?.addEventListener("click", () => downloadBlob(JSON.stringify(request, null, 2), `${request.storage_key || "proxy-response"}.json`, "application/json"));
  } else if (tab === "body") {
    let body = request.body || "(empty response body)";
    try { const parsed = JSON.parse(body); body = JSON.stringify(parsed, null, 2); } catch {}
    container.innerHTML = `<div class="inspector-section"><h3>Response body</h3>${kv("Content type", request.content_type || "—")}${kv("Transferred body", sizeLabel(request.size_bytes || 0))}<pre class="body-preview">${escapeHtml(body)}</pre><div class="button-row" style="justify-content:flex-start;margin-top:9px"><button class="standard-button" id="downloadBodyButton">Download body</button><button class="standard-button" id="copyBodyButton">Copy body</button></div></div>`;
    $("#downloadBodyButton", container)?.addEventListener("click", () => downloadBlob(request.body || "", `${request.storage_key || "response"}.txt`, request.content_type || "text/plain"));
    $("#copyBodyButton", container)?.addEventListener("click", () => copyText(request.body || ""));
  } else {
    container.innerHTML = `<div class="inspector-section"><h3>Request timing</h3>${kv("Total duration", timeLabel(request.duration_ms || 0))}${kv("Method", request.action || "GET")}${kv("Status", `${request.status || 0} ${request.statusText || ""}`)}${kv("Captured at", new Date(request.timestamp || Date.now()).toLocaleString())}</div><div class="inspector-section"><h3>Transferred size</h3>${kv("Body size", sizeLabel(request.size_bytes || 0))}${kv("Exact bytes", request.size_bytes || 0)}${kv("Truncated preview", request.truncated ? "Yes" : "No")}</div><div class="inspector-section"><h3>Trace</h3>${kv("Plugin", request.plugin || "web_proxy")}${kv("Purpose", request.purpose || "—")}${kv("Storage key", request.storage_key || request.id)}</div>`;
  }
}
function renderTestRequest(container) {
  container.innerHTML = `<div class="inspector-section"><h3>Manual public GET request</h3><p class="setting-hint">This request runs through the same server-side Web Proxy limits as model-triggered calls. HTTPS only. Redirects are not followed automatically. Never put secrets in public URLs.</p><div class="setting-field"><div class="setting-label">URL</div><input class="setting-input" id="manualProxyUrl" placeholder="https://api.example.com/public.json" type="url"></div><div class="setting-field"><div class="setting-label">Purpose (optional)</div><input class="setting-input" id="manualProxyPurpose" placeholder="Compare public API response"></div><button class="standard-button primary" id="runManualProxy">Run GET <svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button><div id="manualProxyResult"></div></div>`;
  $("#runManualProxy", container).addEventListener("click", async () => {
    const url = $("#manualProxyUrl", container).value.trim();
    const purpose = $("#manualProxyPurpose", container).value.trim();
    const output = $("#manualProxyResult", container);
    if (!url) { output.innerHTML = `<div class="notice">Enter a URL first.</div>`; return; }
    const button = $("#runManualProxy", container); button.disabled = true; button.textContent = "Fetching…";
    abortController = new AbortController();
    try {
      const result = await proxyGet(url, purpose, abortController.signal);
      const event = result.event || { ...result, id: crypto.randomUUID(), plugin: "web_proxy", action: "GET", timestamp: Date.now() };
      await recordActivity(event);
      state.selectedRequestId = event.id;
      output.innerHTML = `<div class="notice">Web Proxy: GET ${escapeHtml(result.url)} | ${escapeHtml(result.status)} ${escapeHtml(result.statusText)} · ${escapeHtml(result.duration_ms)} ms · ${escapeHtml(sizeLabel(result.size_bytes))}</div><button class="standard-button" id="inspectManualResult">Inspect captured response</button>`;
      $("#inspectManualResult", output).addEventListener("click", () => { state.activeDevTab = "headers"; openDevtools(); });
    } catch (error) {
      output.innerHTML = `<div class="notice">${escapeHtml(error.message || "Request failed.")}</div>`;
    } finally { button.disabled = false; button.innerHTML = 'Run GET <svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'; }
  });
}
function kv(key, value) { return `<div class="inspector-kv"><div class="inspector-key">${escapeHtml(key)}</div><div class="inspector-value">${escapeHtml(value ?? "—")}</div></div>`; }
function safeHostPath(value) { try { const url = new URL(value); return url.host + url.pathname + url.search; } catch { return String(value || ""); } }
function downloadBlob(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); } catch { toast("Clipboard permission was not available."); } }
function toast(message) { const mount = $("#toastMount"); if (!mount) return; const el = document.createElement("div"); el.className = "toast"; el.textContent = message; mount.append(el); setTimeout(() => el.remove(), 2400); }
