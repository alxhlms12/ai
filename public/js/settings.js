import { state, persistSettings, applyAppearance } from "./state.js";

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const ICONS = {
  general: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></svg>',
  models: '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
  appearance: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
  plugins: '<svg viewBox="0 0 24 24"><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
  data: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>'
};
let escapeHandlerInstalled = false;
const TABS = [
  ["general", "General"], ["models", "Models"], ["appearance", "Appearance"], ["plugins", "Plugins"], ["data", "Data & privacy"]
];

function settingField(label, inner, hint = "", full = false) {
  return `<div class="setting-field ${full ? "full" : ""}"><div class="setting-label">${label}</div>${inner}${hint ? `<div class="setting-hint">${hint}</div>` : ""}</div>`;
}
function selectOptions(options, selected) {
  return options.map((item) => {
    const [value, label, disabled] = item;
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}
function toggleRow(id, title, description, checked) {
  return `<div class="toggle-row"><div class="toggle-copy"><div class="toggle-title">${title}</div><div class="toggle-desc">${description}</div></div><label class="switch"><input id="${id}" type="checkbox" ${checked ? "checked" : ""}><span></span></label></div>`;
}
export function openSettings(tab = "general", handlers = {}) {
  state.modalTab = tab;
  renderModal(handlers);
}
function renderModal(handlers) {
  const mount = $("#modalMount");
  mount.innerHTML = `<div class="modal-backdrop" id="settingsBackdrop"><section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"><header class="modal-header"><div class="modal-header-icon">${ICONS[state.modalTab] || ICONS.general}</div><div><h2 id="settingsTitle">${state.modalTab === "plugins" ? "Plugin manager" : "Settings"}</h2><p>Customize every part of your OpenChat workspace.</p></div><div class="grow"></div><button class="icon-button" data-close-settings aria-label="Close settings"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="modal-body"><nav class="modal-tabs">${TABS.map(([id, label]) => `<button class="modal-tab ${state.modalTab === id ? "active" : ""}" data-settings-tab="${id}">${label}</button>`).join("")}</nav><div id="settingsPane"></div><div class="modal-actions"><button class="standard-button" id="settingsReset">Reset ${state.modalTab === "appearance" ? "appearance" : "section"}</button><div class="button-row"><button class="standard-button" data-close-settings>Cancel</button><button class="standard-button primary" id="settingsSave">Save changes <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></button></div></div></div></section></div>`;
  mount.querySelectorAll("[data-close-settings]").forEach((button) => button.addEventListener("click", () => closeSettings()));
  $("#settingsBackdrop").addEventListener("click", (event) => { if (event.target.id === "settingsBackdrop") closeSettings(); });
  mount.querySelectorAll("[data-settings-tab]").forEach((button) => button.addEventListener("click", () => { state.modalTab = button.dataset.settingsTab; renderModal(handlers); }));
  renderPane(handlers);
  $("#settingsSave").addEventListener("click", () => savePane(handlers));
  $("#settingsReset").addEventListener("click", () => resetCurrentTab(handlers));
  if (!escapeHandlerInstalled) { document.addEventListener("keydown", escapeSettings); escapeHandlerInstalled = true; }
}
function escapeSettings(event) { if (event.key === "Escape" && $("#settingsBackdrop")) closeSettings(); }
function closeSettings() {
  if (state.__appearanceSnapshot) {
    Object.assign(state.settings, state.__appearanceSnapshot);
    state.__appearanceSnapshot = null;
    applyAppearance();
  }
  $("#modalMount").innerHTML = "";
}

function renderPane(handlers) {
  const pane = $("#settingsPane");
  if (!pane) return;
  if (state.modalTab === "general") pane.innerHTML = renderGeneral();
  else if (state.modalTab === "models") pane.innerHTML = renderModels();
  else if (state.modalTab === "appearance") pane.innerHTML = renderAppearance();
  else if (state.modalTab === "plugins") pane.innerHTML = renderPlugins();
  else pane.innerHTML = renderData();
  const modelSelect = $("#settingModel");
  if (modelSelect) modelSelect.addEventListener("change", () => updateThinkingAvailability());
  const thinkingToggle = $("#settingThinking");
  if (thinkingToggle) updateThinkingAvailability();
  const range = $("#settingTemperature");
  if (range) range.addEventListener("input", () => { $("#temperatureValue").textContent = Number(range.value).toFixed(1); });
  const appearanceInputs = pane.querySelectorAll("[data-appearance-live]");
  appearanceInputs.forEach((input) => input.addEventListener("input", () => applyLivePreview()));
  if (state.modalTab === "appearance") restoreColorTextFields();
  pane.querySelectorAll("[data-appearance-swatch]").forEach((button) => button.addEventListener("click", () => {
    const [field, value] = button.dataset.appearanceSwatch.split(":");
    const input = $(`#setting-${field}`);
    if (input) { input.value = value; applyLivePreview(); }
  }));
  pane.querySelectorAll("[data-export-action]").forEach((button) => button.addEventListener("click", () => handlers.onDataAction?.(button.dataset.exportAction)));
}

function renderGeneral() {
  const m = state.models.find((model) => model.id === state.settings.model) || state.models[0];
  const modelOptions = state.models.map((model) => [model.id, `${model.name} · ${model.vendor}`]);
  const thinkingLevels = m?.thinking?.levels || ["auto"];
  const thinkModes = [["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([value, label]) => [value, label, !thinkingLevels.includes(value)]);
  return `<div class="notice">OpenChat uses a server-side model allowlist. The daily free Neuron allocation is shared across eligible requests; it is not an unlimited free tier. Some account/model configurations can still return quota or access errors.</div><div class="settings-layout">${settingField("Default model", `<select class="setting-select" id="settingModel">${selectOptions(modelOptions, state.settings.model)}</select>`, "Changing models also updates which reasoning, vision, and plugin controls are available.")}${settingField("Thinking level", `<select class="setting-select" id="settingThinking">${selectOptions(thinkModes, state.settings.thinking)}</select><div class="setting-hint" id="thinkingSupportHint"></div>`, "The control is disabled for models that don't advertise compatible reasoning controls.")}${settingField("Temperature", `<div class="range-line"><input id="settingTemperature" type="range" min="0" max="2" step="0.1" value="${Number(state.settings.temperature)}" class="setting-input"><span class="range-value" id="temperatureValue">${Number(state.settings.temperature).toFixed(1)}</span></div>`, "Lower values are more deterministic; higher values are more varied.")}${settingField("Maximum output tokens", `<select class="setting-select" id="settingMaxTokens">${selectOptions([[512,"512 tokens"],[1024,"1,024 tokens"],[2048,"2,048 tokens"],[3072,"3,072 tokens"],[4096,"4,096 tokens"],[8192,"8,192 tokens"]], state.settings.maxTokens)}</select>`)}<div class="setting-field full">${toggleRow("settingStreaming", "Stream responses as they generate", "Progressively updates the message body and live plugin activity.", state.settings.stream)}</div></div>`;
}
function updateThinkingAvailability() {
  const model = state.models.find((item) => item.id === $("#settingModel")?.value);
  const supported = Boolean(model?.thinking?.supported);
  const levels = model?.thinking?.levels || ["auto"];
  const control = $("#settingThinking");
  const hint = $("#thinkingSupportHint");
  if (control) {
    control.disabled = !supported;
    [...control.options].forEach((option) => { option.disabled = !levels.includes(option.value); });
    if (!supported || !levels.includes(state.settings.thinking)) control.value = "auto";
    else control.value = state.settings.thinking || "auto";
  }
  if (hint) hint.textContent = supported ? `Available for this model. ${levels.filter((level) => level !== "auto").join(", ") || "Auto only"} controls are exposed.` : "Not supported by this model · disabled";
  const color = supported ? "var(--muted)" : "var(--muted-2)";
  if (control) control.style.opacity = supported ? "1" : ".38";
  if (hint) hint.style.color = color;
}
function renderModels() {
  return `<div class="notice">These models are intentionally listed only when they are considered eligible for Cloudflare's shared free allocation. Availability and billing terms can change; verify the current Workers AI pricing/catalog before production use.</div>${state.models.map((model) => `<div class="plugin-card"><div class="plugin-card-header"><div class="plugin-card-icon">${model.vision ? "▧" : model.thinking?.supported ? "◇" : "✳"}</div><div class="plugin-card-info"><div class="plugin-card-title">${escapeHtml(model.name)}</div><div class="plugin-card-version">${escapeHtml(model.id)}</div></div><span class="plugin-badge">Free allocation eligible</span></div><div class="plugin-card-description">${escapeHtml(model.description)}</div><div class="plugin-badges"><span class="plugin-badge">Reasoning ${model.thinking?.supported ? "✓" : "—"}</span><span class="plugin-badge">Tools ${model.tools ? "✓" : "—"}</span><span class="plugin-badge">Vision ${model.vision ? "✓" : "—"}</span></div></div>`).join("")}<div class="setting-field full"><div class="setting-label">Image generation model</div><input class="setting-input" value="${escapeHtml(state.imageModel)}" disabled><div class="setting-hint">FLUX.1 Schnell is routed through a separate image endpoint; image requests also use your Workers AI allocation.</div></div>`;
}
function colorField(id, title, value, hint) {
  return `<div class="setting-field"><div class="setting-label">${title}</div><div class="color-input-row"><input type="color" id="setting-${id}" value="${escapeHtml(value)}" data-appearance-live><input class="setting-input" id="setting-${id}-text" value="${escapeHtml(value)}" aria-label="${title} hex value" maxlength="7"></div>${hint ? `<div class="setting-hint">${hint}</div>` : ""}</div>`;
}
function renderAppearance() {
  const palette = ["#b7a5ff", "#7fbcff", "#63d9c4", "#f3a7c8", "#e6be78", "#ff8f7c", "#e7edf5", "#b0de86"];
  return `<div class="setting-field full"><div class="setting-label">Accent presets</div><div class="swatch-row">${palette.map((color) => `<button class="swatch" style="background:${color}" title="Use ${color}" data-appearance-swatch="accent:${color}" aria-label="Set accent ${color}"></button>`).join("")}</div><div class="setting-hint">Accents apply to buttons, focus rings, icons, activity highlights, and motion details.</div></div><div class="settings-layout">${colorField("accent", "Accent color", state.settings.accent, "Main interface highlight color.")}${colorField("bg", "App background", state.settings.bg, "Outer workspace and canvas.")}${colorField("panel", "Panel / card color", state.settings.panel, "Conversation cards, composer, dialogs.")}${colorField("sidebarColor", "Sidebar color", state.settings.sidebarColor, "Conversation navigation rail.")}${colorField("textColor", "Primary text color", state.settings.textColor, "Main text foreground.")}${settingField("Corner roundness", `<div class="range-line"><input class="setting-input" id="settingRadius" type="range" min="8" max="24" step="1" value="${Number(state.settings.radius)}" data-appearance-live><span class="range-value" id="radiusValue">${Number(state.settings.radius)} px</span></div>`, "Adjust cards, bubbles, and dialogs together.")}${settingField("Font", `<select class="setting-select" id="settingFont" data-appearance-live>${selectOptions([["sans","Modern Sans"],["system","System UI"],["mono","Monospace" ]],state.settings.font)}</select>`)}${settingField("Animation style", `<select class="setting-select" id="settingMotion" data-appearance-live>${selectOptions([["spring","Spring · expressive"],["subtle","Subtle · restrained"],["off","Off · minimal motion"]],state.settings.motion)}</select>`, "Includes button presses, modal entrances, message transitions, hover effects, and background details.")}${settingField("Layout density", `<select class="setting-select" id="settingDensity" data-appearance-live>${selectOptions([["comfortable","Comfortable"],["compact","Compact"]],state.settings.density)}</select>`)}</div><div class="notice">Live preview: changes update the interface immediately. Press Save to persist them; Cancel restores the saved appearance.</div>`;
}
function renderPlugins() {
  const proxy = state.plugins.find((plugin) => plugin.id === "web_proxy") || { id: "web_proxy", name: "Web Proxy", version: "1.0.0", description: "Fetch public HTTPS URLs through a transparent tool interface.", capabilities: ["http.get", "response.inspect"] };
  const custom = state.plugins.find((plugin) => plugin.id === "custom_instructions") || { id: "custom_instructions", name: "Custom Instructions", version: "1.0.0", description: "Append user instructions to the model system prompt.", capabilities: ["system_prompt.append"] };
  return `<div class="notice">Plugins can provide tools, contribute system instructions, and display live activity. Plugin code runs on the Worker, not in the browser. New plugins can be registered under <code>src/plugins/registry.js</code>.</div><div class="plugin-card"><div class="plugin-card-header"><div class="plugin-card-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></div><div class="plugin-card-info"><div class="plugin-card-title">${escapeHtml(proxy.name)}</div><div class="plugin-card-version">v${escapeHtml(proxy.version)} · Tool plugin</div></div><label class="switch"><input id="settingWebProxy" type="checkbox" ${state.settings.webProxy ? "checked" : ""}><span></span></label></div><div class="plugin-card-description">${escapeHtml(proxy.description)}</div><div class="plugin-badges">${(proxy.capabilities || []).map((capability) => `<span class="plugin-badge">${escapeHtml(capability)}</span>`).join("")}</div><div class="setting-field" style="margin:12px 0 0"><div class="setting-label">Web Proxy instructions</div><textarea class="setting-textarea" id="settingProxyInstructions" maxlength="4000">${escapeHtml(state.settings.proxyInstructions || "")}</textarea><div class="setting-hint">Added to the model's system prompt when the Web Proxy plugin is enabled. Tool use is capped and each request appears in DevTools.</div></div></div><div class="plugin-card"><div class="plugin-card-header"><div class="plugin-card-icon">✎</div><div class="plugin-card-info"><div class="plugin-card-title">${escapeHtml(custom.name)}</div><div class="plugin-card-version">v${escapeHtml(custom.version)} · Prompt plugin</div></div><label class="switch"><input id="settingCustomInstructionsEnabled" type="checkbox" ${state.settings.customInstructionsEnabled ? "checked" : ""}><span></span></label></div><div class="plugin-card-description">${escapeHtml(custom.description)}</div><div class="plugin-badges">${(custom.capabilities || []).map((capability) => `<span class="plugin-badge">${escapeHtml(capability)}</span>`).join("")}</div><div class="setting-field" style="margin:12px 0 0"><div class="setting-label">Custom instructions</div><textarea class="setting-textarea" id="settingCustomInstructions" maxlength="8000">${escapeHtml(state.settings.customInstructions || "")}</textarea><div class="setting-hint">This is sent as additional system instructions on each turn. It does not override platform safety rules.</div></div></div><div class="setting-field full">${toggleRow("settingShowActivity", "Show tool activity inline", "Render Web Proxy GET requests and status updates inside the conversation.", state.settings.showActivity)}</div>`;
}
function renderData() {
  return `<div class="notice">Chats and appearance settings are stored in this browser's localStorage. Uploaded files and DevTools response snapshots are stored locally in IndexedDB. File artifacts are built as browser Blob downloads and are not uploaded to a file host.</div><div class="setting-field full"><div class="setting-label">Export</div><div class="button-row" style="justify-content:flex-start;flex-wrap:wrap"><button class="standard-button" data-export-action="chats">Export conversations JSON</button><button class="standard-button" data-export-action="settings">Export settings JSON</button><button class="standard-button" data-export-action="devtools">Export DevTools JSON</button></div></div><div class="setting-field full"><div class="setting-label">Local data cleanup</div><div class="setting-hint">Clear chat history, uploaded attachments, proxy snapshots, or all local configuration. These actions do not delete Cloudflare account data.</div><div class="button-row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:4px"><button class="standard-button" data-export-action="clear-chats">Clear chats</button><button class="standard-button" data-export-action="clear-files">Clear uploaded files</button><button class="standard-button" data-export-action="clear-proxy">Clear proxy history</button><button class="standard-button danger" data-export-action="clear-all">Reset local OpenChat</button></div></div>`;
}

function getColor(id, fallback) {
  const value = $(`#setting-${id}`)?.value || fallback;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
function readAppearance() {
  state.settings.accent = getColor("accent", state.settings.accent);
  state.settings.bg = getColor("bg", state.settings.bg);
  state.settings.panel = getColor("panel", state.settings.panel);
  state.settings.sidebarColor = getColor("sidebarColor", state.settings.sidebarColor);
  state.settings.textColor = getColor("textColor", state.settings.textColor);
  state.settings.radius = Number($("#settingRadius")?.value || state.settings.radius);
  state.settings.font = $("#settingFont")?.value || state.settings.font;
  state.settings.motion = $("#settingMotion")?.value || state.settings.motion;
  state.settings.density = $("#settingDensity")?.value || state.settings.density;
}
function applyLivePreview() {
  const hexFields = ["accent", "bg", "panel", "sidebarColor", "textColor"];
  for (const id of hexFields) {
    const color = $(`#setting-${id}`);
    const text = $(`#setting-${id}-text`);
    if (color && text) {
      if (document.activeElement === text && /^#[\da-fA-F]{6}$/.test(text.value)) color.value = text.value;
      else text.value = color.value;
    }
  }
  const radius = $("#settingRadius");
  if (radius && $("#radiusValue")) $("#radiusValue").textContent = `${radius.value} px`;
  const previous = { ...state.settings };
  readAppearance(); applyAppearance();
  // Keep current values live but use a snapshot that Cancel can restore.
  if (!state.__appearanceSnapshot) state.__appearanceSnapshot = previous;
}
function restoreColorTextFields() {
  for (const id of ["accent", "bg", "panel", "sidebarColor", "textColor"]) {
    const color = $(`#setting-${id}`), text = $(`#setting-${id}-text`);
    if (!color || !text) continue;
    color.addEventListener("input", () => { text.value = color.value; applyLivePreview(); });
    text.addEventListener("input", () => { if (/^#[\da-fA-F]{6}$/.test(text.value)) { color.value = text.value; applyLivePreview(); } });
  }
}
function savePane(handlers) {
  const model = $("#settingModel");
  if (model) state.settings.model = model.value;
  const thinking = $("#settingThinking");
  const activeModel = state.models.find((item) => item.id === state.settings.model);
  state.settings.thinking = activeModel?.thinking?.supported && thinking && !thinking.disabled ? thinking.value : "auto";
  const temperature = $("#settingTemperature"); if (temperature) state.settings.temperature = Number(temperature.value);
  const maxTokens = $("#settingMaxTokens"); if (maxTokens) state.settings.maxTokens = Number(maxTokens.value);
  const stream = $("#settingStreaming"); if (stream) state.settings.stream = stream.checked;
  const webProxy = $("#settingWebProxy"); if (webProxy) state.settings.webProxy = webProxy.checked;
  const customEnabled = $("#settingCustomInstructionsEnabled"); if (customEnabled) state.settings.customInstructionsEnabled = customEnabled.checked;
  const custom = $("#settingCustomInstructions"); if (custom) state.settings.customInstructions = custom.value.trim().slice(0, 8000);
  const proxyInstructions = $("#settingProxyInstructions"); if (proxyInstructions) state.settings.proxyInstructions = proxyInstructions.value.trim().slice(0, 4000);
  const showActivity = $("#settingShowActivity"); if (showActivity) state.settings.showActivity = showActivity.checked;
  if (state.modalTab === "appearance") readAppearance();
  state.__appearanceSnapshot = null;
  persistSettings(); applyAppearance();
  closeSettings();
  handlers.onSaved?.();
}
function resetCurrentTab(handlers) {
  if (state.modalTab === "appearance") {
    Object.assign(state.settings, { accent: "#b7a5ff", bg: "#111116", panel: "#191920", sidebarColor: "#15151c", textColor: "#f3f1f8", radius: 16, font: "sans", motion: "spring", density: "comfortable" });
    state.__appearanceSnapshot = null; applyAppearance(); persistSettings(); renderModal(handlers); handlers.onSaved?.();
  } else {
    closeSettings();
    handlers.onToast?.("No changes from this section were saved.");
  }
}
