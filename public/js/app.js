import { state, applyAppearance, persistChats, persistSettings, activeChat, createChat, ensureChat } from "./state.js";
import { getModels, getPlugins, health, chatStream, generateImage } from "./api.js";
import { addFiles, getAttachment, removeAttachment, resolveMessageContent } from "./attachments.js";
import { renderMarkdown, base64Decode, getArtifactCandidates, extensionForLanguage } from "./markdown.js";
import { installMotion } from "./motion.js";
import { openSettings } from "./settings.js";
import { buildPluginSettings, enabledPluginCount } from "./plugins.js";
import { loadDevtools, openDevtools, recordActivity, updateDevtoolsCount } from "./devtools.js";
import { dbPut, dbGet, dbClear } from "./storage.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const fmtBytes = (size = 0) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;
const svg = (path) => `<svg viewBox="0 0 24 24">${path}</svg>`;
const iconFile = svg('<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7"/>');

function toast(message, tone = "info") {
  const mount = $("#toastMount");
  if (!mount) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${svg(tone === "error" ? '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>' : '<path d="m5 12 4 4L19 6"/>')}<span>${escapeHtml(message)}</span>`;
  mount.append(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(6px) scale(.98)"; setTimeout(() => el.remove(), 220); }, 2700);
}
window.addEventListener("openchat:storage-warning", () => toast("Local chat history is full. Export or delete old conversations.", "error"));
window.addEventListener("openchat:request-recorded", () => renderSidebarCounts());

function currentModel() { return state.models.find((model) => model.id === state.settings.model) || state.models[0] || { name: state.settings.model, tools: false, vision: false, thinking: { supported: false } }; }
function modelSupportsThinking() { return Boolean(currentModel()?.thinking?.supported); }
function modelSupportsVision() { return Boolean(currentModel()?.vision); }
function modelSupportsTools() { return Boolean(currentModel()?.tools); }

function renderChatList() {
  const list = $("#conversationList");
  const query = state.chatSearch || "";
  const chats = state.chats.filter((chat) => !query || (chat.title || "").toLowerCase().includes(query.toLowerCase()));
  list.innerHTML = chats.map((chat, index) => `<div class="conversation-row ${chat.id === state.currentChatId ? "active" : ""}" data-chat-id="${escapeHtml(chat.id)}" style="animation-delay:${Math.min(index * 18, 140)}ms"><span class="conversation-symbol">${chat.id === state.currentChatId ? "◉" : "◌"}</span><span class="conversation-name">${escapeHtml(chat.title || "New conversation")}</span><button class="conversation-delete" data-delete-chat="${escapeHtml(chat.id)}" aria-label="Delete ${escapeHtml(chat.title || "conversation")}" title="Delete conversation">×</button></div>`).join("");
  list.querySelectorAll("[data-chat-id]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("[data-delete-chat]")) return;
    state.currentChatId = row.dataset.chatId;
    renderAll();
    closeSidebarOnMobile();
  }));
  list.querySelectorAll("[data-delete-chat]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const chat = state.chats.find((item) => item.id === button.dataset.deleteChat);
    if (!chat) return;
    state.chats = state.chats.filter((item) => item.id !== chat.id);
    if (state.currentChatId === chat.id) state.currentChatId = state.chats[0]?.id || null;
    persistChats();
    renderAll();
    toast("Conversation deleted");
  }));
}

function renderModelControls() {
  const selected = currentModel();
  const select = $("#quickModel");
  select.innerHTML = state.models.map((model) => `<option value="${escapeHtml(model.id)}" ${model.id === state.settings.model ? "selected" : ""}>${escapeHtml(model.name)}</option>`).join("");
  select.value = state.settings.model;
  $("#topModelName").textContent = selected.name || selected.id;
  $("#activeModelSubtitle").textContent = `${selected.name || selected.id} · Workers AI`;
  const thinkingButton = $("#thinkingChip");
  thinkingButton.disabled = !modelSupportsThinking() || state.busy;
  thinkingButton.style.opacity = modelSupportsThinking() ? "1" : ".36";
  thinkingButton.title = modelSupportsThinking() ? "Change thinking level in Settings" : "Thinking controls aren't supported by this model";
  $("#thinkingChipText").textContent = modelSupportsThinking() ? `Thinking · ${capitalize(state.settings.thinking)}` : "Thinking · N/A";
  $("#proxyQuickToggle").classList.toggle("active-tool", state.settings.webProxy && modelSupportsTools());
  $("#proxyQuickToggle").style.opacity = modelSupportsTools() ? "1" : ".34";
  $("#proxyQuickToggle").disabled = !modelSupportsTools() || state.busy;
}
function capitalize(value) { return String(value || "auto").charAt(0).toUpperCase() + String(value || "auto").slice(1); }

function renderWelcome() {
  return `<section class="welcome-view"><div class="welcome-icon">✳</div><h1>What are we<br><span class="gradient-text">working on today?</span></h1><p>A modular AI workspace with streaming answers, browser-native artifacts, image generation, and visible plugin execution.</p><div class="suggestion-grid"><button class="suggestion-card" data-suggest="Compare two public JSON APIs using the Web Proxy plugin. Show status codes and explain the differences."><span class="suggestion-icon">${svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>')}</span><strong>Compare public APIs</strong><small>Inspect endpoints with a live request trace.</small></button><button class="suggestion-card" data-suggest="Write a complete, runnable Python file that reads a JSON file, summarizes the top-level fields, and reports helpful errors. Include a named code block I can download."><span class="suggestion-icon">${svg('<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>')}</span><strong>Generate a file</strong><small>Create source code and download it directly.</small></button><button class="suggestion-card" data-suggest="Explain how ReadableStream works in Cloudflare Workers, with a practical code example."><span class="suggestion-icon">${svg('<path d="M4 5h16M4 10h11M4 15h16M4 20h8"/>')}</span><strong>Explore a concept</strong><small>Get a structured answer with Markdown.</small></button><button class="suggestion-card" data-suggest="Help me create a visually detailed prompt for an abstract violet glass-and-metal app icon. Do not generate the image yet; prepare the prompt."><span class="suggestion-icon">${svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>')}</span><strong>Start a visual idea</strong><small>Prepare a prompt, then use image generation.</small></button></div></section>`;
}
function renderUserMessage(message) {
  const files = (message.attachments || []).map((file) => `<div class="file-pill">${iconFile}<span>${escapeHtml(file.name)}</span><span style="color:var(--muted-2)">${escapeHtml(file.sizeLabel || fmtBytes(file.size))}</span></div>`).join("");
  return `<article class="message-row user" data-message-id="${escapeHtml(message.id)}"><div class="user-bubble">${escapeHtml(message.content || "").replace(/\n/g, "<br>")}${files ? `<div class="user-files">${files}</div>` : ""}</div></article>`;
}
function activityMarkup(events) {
  if (!events?.length || !state.settings.showActivity) return "";
  return `<section class="activity-card"><header class="activity-head"><span style="color:var(--accent)">↗</span> Live plugin activity <span class="grow"></span><small>${events.length} event${events.length === 1 ? "" : "s"}</small><button class="activity-inspect" data-open-devtools>DevTools ↗</button></header>${events.map((event) => `<div class="activity-row"><span class="activity-symbol">${svg('<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>')}</span><div class="activity-main"><div class="activity-title">${escapeHtml(event.plugin === "web_proxy" ? `Web Proxy: ${event.action || "GET"} ${event.url || ""}` : `${event.plugin || "Plugin"}: ${event.action || "execute"}`)}</div><div class="activity-detail"><span class="${event.status >= 200 && event.status < 400 ? "status-success" : "status-failure"}">${escapeHtml(event.statusText || (event.status ? "Response" : "ERROR"))} ${escapeHtml(event.status || "")}</span><span>·</span><span>${escapeHtml(event.duration_ms || 0)} ms</span><span>·</span><span>${escapeHtml(fmtBytes(event.size_bytes || 0))}</span><span>·</span><span>${escapeHtml(event.storage_key || "not stored")}</span></div></div></div>`).join("")}</section>`;
}
function artifactMarkup(content, suppliedArtifacts = []) {
  let artifacts = suppliedArtifacts || [];
  if (!artifacts.length) artifacts = getArtifactCandidates(content).map((item) => ({ ...item, content_base64: encodeUtf8Base64(item.content), size_bytes: new TextEncoder().encode(item.content).length }));
  if (!artifacts.length) return "";
  return `<div class="artifact-grid">${artifacts.map((artifact) => {
    const encoded = artifact.content_base64 || encodeUtf8Base64(artifact.content || "");
    const size = artifact.size_bytes ?? new TextEncoder().encode(artifact.content || "").length;
    return `<div class="artifact-card"><div class="artifact-icon">${iconFile}</div><div class="artifact-copy"><div class="artifact-name">${escapeHtml(artifact.name)}</div><div class="artifact-meta">${escapeHtml(artifact.mime_type || artifact.language || "file")} · ${fmtBytes(size)} · local file</div></div><button class="artifact-download" title="Download ${escapeHtml(artifact.name)}" aria-label="Download ${escapeHtml(artifact.name)}" data-artifact-download="${encoded}" data-artifact-name="${encodeURIComponent(artifact.name)}" data-artifact-type="${escapeHtml(artifact.mime_type || "text/plain;charset=utf-8")}">${svg('<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>')}</button></div>`;
  }).join("")}</div>`;
}
function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text); let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function renderAssistantMessage(message) {
  const content = message.content ? renderMarkdown(message.content) : message.pending ? `<div class="typing-dots"><span></span><span></span><span></span></div>` : "";
  const cursor = message.pending ? " is-streaming" : "";
  const image = message.imageArtifactId ? `<div class="generated-image-frame"><img class="generated-image" data-image-artifact="${escapeHtml(message.imageArtifactId)}" alt="Generated image"/><div class="message-footer"><button data-download-image="${escapeHtml(message.imageArtifactId)}">${svg('<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>')} Download image</button></div></div>` : "";
  return `<article class="message-row assistant${cursor}" data-message-id="${escapeHtml(message.id)}"><div class="assistant-heading"><span class="assistant-avatar">✳</span><span>OpenChat</span><span class="assistant-label-status">${message.pending ? "Generating" : message.usage?.total_tokens ? `${message.usage.total_tokens} tokens` : ""}</span></div><div class="assistant-bubble"><div class="markdown-body assistant-content">${content}</div>${image}${artifactMarkup(message.content || "", message.artifacts || [])}${activityMarkup(message.events || [])}</div><footer class="message-footer"><button data-copy-message="${escapeHtml(message.id)}">${svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>')} Copy</button><button data-export-message="${escapeHtml(message.id)}">${svg('<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>')} Export .md</button></footer></article>`;
}
function renderAll({ scroll = true } = {}) {
  renderChatList();
  const chat = activeChat();
  $("#activeChatTitle").textContent = chat?.title || "New conversation";
  renderModelControls();
  const container = $("#chatContent");
  if (!chat || !chat.messages.length) container.innerHTML = renderWelcome();
  else container.innerHTML = chat.messages.map((message) => message.role === "user" ? renderUserMessage(message) : renderAssistantMessage(message)).join("");
  renderAttachmentStrip(); renderSidebarCounts(); hydrateGeneratedImages();
  if (scroll) requestAnimationFrame(() => { const pane = $("#chatScroll"); pane.scrollTo({ top: pane.scrollHeight, behavior: state.settings.motion === "off" ? "auto" : "smooth" }); });
}
function updateMessage(message) {
  let node = $(`[data-message-id="${CSS.escape(message.id)}"]`, $("#chatContent"));
  if (!node) { renderAll(); node = $(`[data-message-id="${CSS.escape(message.id)}"]`, $("#chatContent")); }
  if (!node || message.role === "user") return;
  const bubble = $(".assistant-bubble", node);
  if (bubble) {
    const content = $(".assistant-content", bubble);
    if (content) content.innerHTML = message.content ? renderMarkdown(message.content) : message.pending ? `<div class="typing-dots"><span></span><span></span><span></span></div>` : "";
    let artifacts = $(".artifact-grid", bubble);
    const markup = artifactMarkup(message.content || "", message.artifacts || []);
    if (artifacts) artifacts.remove();
    if (markup) bubble.insertAdjacentHTML("beforeend", markup);
    let activity = $(".activity-card", bubble);
    const activityHTML = activityMarkup(message.events || []);
    if (activity) activity.remove();
    if (activityHTML) bubble.insertAdjacentHTML("beforeend", activityHTML);
    if (message.imageArtifactId && !$("[data-image-artifact]", bubble)) bubble.insertAdjacentHTML("beforeend", renderAssistantMessage({ ...message, content: "" }).match(/<div class="generated-image-frame">[\s\S]*?<\/div><\/div>/)?.[0] || "");
  }
  node.classList.toggle("is-streaming", Boolean(message.pending));
  const status = $(".assistant-label-status", node);
  if (status) status.textContent = message.pending ? "Generating" : message.usage?.total_tokens ? `${message.usage.total_tokens} tokens` : "";
  if (!message.pending) node.animate?.([{ opacity: 0.94, transform: "translateY(2px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "ease-out" });
  requestAnimationFrame(() => { const pane = $("#chatScroll"); if (pane.scrollHeight - pane.scrollTop - pane.clientHeight < 260) pane.scrollTo({ top: pane.scrollHeight, behavior: state.settings.motion === "off" ? "auto" : "smooth" }); });
}
function renderAttachmentStrip() {
  const strip = $("#attachmentStrip");
  strip.innerHTML = state.pendingAttachments.map((attachment) => `<div class="attachment-pill" title="${escapeHtml(attachment.detail || "")}">${iconFile}<span class="attachment-label">${escapeHtml(attachment.name)}</span><span class="attachment-size">${escapeHtml(attachment.sizeLabel)}</span><button data-remove-pending="${escapeHtml(attachment.id)}" title="Remove attachment" aria-label="Remove ${escapeHtml(attachment.name)}">×</button></div>`).join("");
  strip.querySelectorAll("[data-remove-pending]").forEach((button) => button.addEventListener("click", async () => {
    const fileId = button.dataset.removePending;
    state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== fileId);
    try { await removeAttachment(fileId); } catch {}
    renderAttachmentStrip();
  }));
}
function renderSidebarCounts() {
  $("#pluginStatusText").textContent = `${enabledPluginCount()} enabled`;
  $("#devtoolsCount").textContent = String(state.requests.length);
  updateDevtoolsCount();
}
function hydrateGeneratedImages() {
  $$("[data-image-artifact]").forEach(async (image) => {
    if (image.dataset.hydrated) return;
    image.dataset.hydrated = "true";
    try {
      const file = await getAttachment(image.dataset.imageArtifact);
      if (file?.blob) { image.src = URL.createObjectURL(file.blob); image.addEventListener("load", () => image.classList.add("loaded"), { once: true }); }
    } catch {}
  });
}
function renderUserMessageNode(text, attachments = []) {
  const message = { id: crypto.randomUUID(), role: "user", content: text, attachments: attachments.map(({ id, name, size, sizeLabel, mime_type }) => ({ id, name, size, sizeLabel, mime_type })) };
  return message;
}
function closeSidebarOnMobile() { if (window.matchMedia("(max-width: 700px)").matches) { $("#sidebar").classList.remove("open"); $("#mobileScrim").classList.remove("visible"); } }
function openSidebar() { $("#sidebar").classList.add("open"); $("#mobileScrim").classList.add("visible"); }

async function modelMessagesForChat(chat, model) {
  const history = chat.messages.filter((message) => ["user", "assistant"].includes(message.role) && !message.pending).slice(-24);
  const output = [];
  for (const message of history) {
    if (message.role === "user" && message.attachments?.length) {
      const content = await resolveMessageContent(message, Boolean(model.vision));
      output.push({ role: message.role, content });
    } else output.push({ role: message.role, content: String(message.content || "") });
  }
  return output;
}
function setBusy(busy) {
  state.busy = busy;
  const button = $("#sendButton");
  button.innerHTML = busy ? svg('<rect x="7" y="7" width="10" height="10" rx="2"/>') : svg('<path d="M12 19V5M6 11l6-6 6 6"/>');
  button.title = busy ? "Stop generation" : "Send (Enter)";
  button.setAttribute("aria-label", busy ? "Stop generation" : "Send message");
  $("#generateImageButton").disabled = busy;
  $("#quickModel").disabled = busy;
  $("#proxyQuickToggle").disabled = busy || !modelSupportsTools();
  $("#thinkingChip").disabled = busy || !modelSupportsThinking();
}

async function sendMessage() {
  if (state.busy) { state.abortController?.abort(); return; }
  const input = $("#promptInput");
  const text = input.value.trim();
  const attachments = [...state.pendingAttachments];
  if (!text && !attachments.length) return;
  if (text.length > 50_000) { toast("Messages are limited to 50,000 characters.", "error"); return; }
  const chat = ensureChat();
  const userMessage = renderUserMessageNode(text || "Please inspect the attached file(s).", attachments);
  chat.messages.push(userMessage);
  if (chat.title === "New conversation") {
    chat.title = (text || attachments[0]?.name || "New conversation").replace(/\s+/g, " ").slice(0, 46);
  }
  chat.updatedAt = Date.now();
  chat.model = state.settings.model;
  state.pendingAttachments = [];
  input.value = ""; resizePrompt(); renderAll(); persistChats();
  const assistant = { id: crypto.randomUUID(), role: "assistant", content: "", pending: true, artifacts: [], events: [], usage: null };
  chat.messages.push(assistant); renderAll({ scroll: true });
  state.abortController = new AbortController(); setBusy(true);
  try {
    const messages = await modelMessagesForChat(chat, currentModel());
    const body = {
      model: state.settings.model,
      thinking: modelSupportsThinking() ? state.settings.thinking : "auto",
      temperature: state.settings.temperature,
      max_tokens: state.settings.maxTokens,
      stream: state.settings.stream,
      plugins: buildPluginSettings(),
      messages
    };
    const serialized = JSON.stringify(body);
    if (serialized.length > 1_420_000) throw new Error("This request contains too much attachment data. Remove an image or upload a smaller file and try again.");
    await chatStream(body, {
      signal: state.abortController.signal,
      onDelta(delta) {
        assistant.content += delta;
        updateMessage(assistant);
      },
      async onActivity(event) {
        if (!event) return;
        // Store full bounded response snapshots in IndexedDB/DevTools, while chat
        // history only keeps the lightweight activity summary to avoid duplicating
        // large response bodies into localStorage.
        await recordActivity(event);
        const summary = { ...event };
        delete summary.body;
        delete summary.body_preview;
        delete summary.headers;
        const existingIndex = assistant.events.findIndex((item) => item.id === summary.id || item.storage_key === summary.storage_key);
        if (existingIndex >= 0) assistant.events[existingIndex] = summary;
        else assistant.events.push(summary);
        updateMessage(assistant);
      },
      onMeta(meta) { assistant.usage = meta.usage || null; updateMessage(assistant); },
      onDone(meta) { assistant.pending = false; assistant.usage = meta.usage || assistant.usage; assistant.artifacts = meta.artifacts || assistant.artifacts || []; assistant.finish_reason = meta.finish_reason || "stop"; }
    });
    assistant.pending = false;
    if (!assistant.content.trim()) assistant.content = "The model returned an empty response.";
    chat.updatedAt = Date.now();
    persistChats(); renderAll();
  } catch (error) {
    assistant.pending = false;
    if (error.name === "AbortError") {
      if (!assistant.content.trim()) assistant.content = "Generation stopped.";
      else assistant.content += "\n\n*Generation stopped.*";
    } else {
      assistant.content = `**Request failed**\n\n${error.message || "Unknown error."}\n\nCheck your Worker deployment, the AI binding, the model allowlist, and your Workers AI quota.`;
      toast(error.message || "Request failed", "error");
    }
    persistChats(); renderAll();
  } finally { state.abortController = null; setBusy(false); renderModelControls(); }
}

async function makeImage() {
  if (state.busy) return;
  const input = $("#promptInput");
  const prompt = input.value.trim();
  if (!prompt) { toast("Enter an image prompt first."); input.focus(); return; }
  if (prompt.length > 2048) { toast("Image prompts are limited to 2,048 characters.", "error"); return; }
  const chat = ensureChat();
  const user = { id: crypto.randomUUID(), role: "user", content: `Generate an image: ${prompt}`, attachments: [] };
  const assistant = { id: crypto.randomUUID(), role: "assistant", content: "Generating image with FLUX.1 Schnell…", pending: true, events: [], usage: null };
  chat.messages.push(user, assistant);
  if (chat.title === "New conversation") chat.title = `Image · ${prompt.slice(0, 30)}`;
  input.value = ""; resizePrompt(); persistChats(); renderAll(); setBusy(true); state.abortController = new AbortController();
  try {
    const blob = await generateImage(prompt, 4, state.abortController.signal);
    const imageId = crypto.randomUUID();
    await dbPut("attachments", { id: imageId, name: "generated-image.jpg", size: blob.size, sizeLabel: fmtBytes(blob.size), mime_type: "image/jpeg", kind: "generated-image", blob, addedAt: Date.now() });
    assistant.content = "Image generated. It is stored in this browser and can be downloaded directly.";
    assistant.imageArtifactId = imageId;
    assistant.pending = false;
    persistChats(); renderAll(); toast("Image generated");
  } catch (error) {
    assistant.pending = false;
    assistant.content = `**Image generation failed**\n\n${error.message || "Unknown error."}`;
    persistChats(); renderAll(); toast(error.message || "Image generation failed", "error");
  } finally { state.abortController = null; setBusy(false); }
}

async function addPendingFiles(files) {
  try {
    const existingImageBytes = state.pendingAttachments.filter((item) => item.kind === "image").reduce((sum, item) => sum + item.size, 0);
    const selectedImageBytes = [...files].filter((file) => file.type.startsWith("image/")).reduce((sum, item) => sum + item.size, 0);
    if (existingImageBytes + selectedImageBytes > 700 * 1024) throw new Error("Keep total image attachments under 700 KB per request so the Worker payload stays bounded.");
    const items = await addFiles(files);
    state.pendingAttachments.push(...items);
    renderAttachmentStrip();
    if (items.length) toast(`${items.length} file${items.length === 1 ? "" : "s"} parsed locally`);
  } catch (error) { toast(error.message || "Could not attach file", "error"); }
}

function downloadBlob(content, filename, type = "text/plain;charset=utf-8") {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}
async function downloadGeneratedImage(imageId) {
  const item = await getAttachment(imageId);
  if (!item?.blob) { toast("This generated image is no longer available locally.", "error"); return; }
  downloadBlob(item.blob, item.name || "openchat-image.jpg", item.mime_type || "image/jpeg");
}
async function downloadArtifact(encoded, filename, type) {
  try { downloadBlob(base64Decode(encoded), filename || "generated.txt", type || "text/plain;charset=utf-8"); toast(`Downloading ${filename || "artifact"}`); }
  catch { toast("Could not decode generated file.", "error"); }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
  catch { toast("Clipboard access wasn't available.", "error"); }
}

async function handleChatAction(event) {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.matches("[data-suggest]")) { $("#promptInput").value = target.dataset.suggest; resizePrompt(); $("#promptInput").focus(); return; }
  if (target.hasAttribute("data-code-copy")) { try { await copyText(base64Decode(target.dataset.codeCopy)); } catch { toast("Could not decode code.", "error"); } return; }
  if (target.hasAttribute("data-code-download")) {
    await downloadArtifact(target.dataset.codeDownload, decodeURIComponent(target.dataset.codeName || "generated.txt"), `text/plain;charset=utf-8`); return;
  }
  if (target.hasAttribute("data-artifact-download")) { await downloadArtifact(target.dataset.artifactDownload, decodeURIComponent(target.dataset.artifactName || "generated.txt"), target.dataset.artifactType || "text/plain;charset=utf-8"); return; }
  if (target.hasAttribute("data-copy-message")) {
    const message = activeChat()?.messages.find((item) => item.id === target.dataset.copyMessage); if (message) await copyText(message.content || ""); return;
  }
  if (target.hasAttribute("data-export-message")) {
    const message = activeChat()?.messages.find((item) => item.id === target.dataset.exportMessage); if (message) downloadBlob(message.content || "", "openchat-response.md", "text/markdown;charset=utf-8"); return;
  }
  if (target.hasAttribute("data-download-image")) { await downloadGeneratedImage(target.dataset.downloadImage); return; }
  if (target.hasAttribute("data-open-devtools")) { openDevtools(); return; }
}

function resizePrompt() {
  const prompt = $("#promptInput");
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 170)}px`;
}
function configureEvents() {
  $("#newChat").addEventListener("click", () => { state.chatSearch = ""; createChat(); renderAll(); $("#promptInput").focus(); closeSidebarOnMobile(); });
  $("#sendButton").addEventListener("click", sendMessage);
  $("#promptInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); } });
  $("#promptInput").addEventListener("input", resizePrompt);
  $("#attachButton").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", async (event) => { await addPendingFiles(event.target.files); event.target.value = ""; });
  $("#generateImageButton").addEventListener("click", makeImage);
  $("#quickModel").addEventListener("change", () => {
    state.settings.model = $("#quickModel").value;
    if (!modelSupportsThinking()) state.settings.thinking = "auto";
    persistSettings(); renderModelControls(); const chat = activeChat(); if (chat) chat.model = state.settings.model;
    toast(`Model set to ${currentModel().name}`);
  });
  $("#topModelButton").addEventListener("click", () => openSettings("models", settingsHandlers()));
  $("#thinkingChip").addEventListener("click", () => openSettings("general", settingsHandlers()));
  $("#proxyQuickToggle").addEventListener("click", () => { state.settings.webProxy = !state.settings.webProxy; persistSettings(); renderModelControls(); renderSidebarCounts(); toast(`Web Proxy ${state.settings.webProxy ? "enabled" : "disabled"}`); });
  $("#settingsButton").addEventListener("click", () => openSettings("general", settingsHandlers()));
  $("#topSettings").addEventListener("click", () => openSettings("appearance", settingsHandlers()));
  $("#pluginsButton").addEventListener("click", () => openSettings("plugins", settingsHandlers()));
  $("#devtoolsButton").addEventListener("click", openDevtools);
  $("#openSidebar").addEventListener("click", openSidebar);
  $("#closeSidebar").addEventListener("click", closeSidebarOnMobile);
  $("#mobileScrim").addEventListener("click", closeSidebarOnMobile);
  $("#searchChats").addEventListener("click", () => {
    const query = window.prompt("Search conversation titles", state.chatSearch || "");
    if (query === null) return;
    state.chatSearch = query.trim(); renderChatList();
  });
  $("#chatContent").addEventListener("click", handleChatAction);
  $("#composerWrap").addEventListener("dragover", (event) => { event.preventDefault(); $("#dropOverlay").classList.add("visible"); $("#composerWrap").classList.add("drag-active"); });
  $("#composerWrap").addEventListener("dragleave", (event) => { if (!$("#composerWrap").contains(event.relatedTarget)) { $("#dropOverlay").classList.remove("visible"); $("#composerWrap").classList.remove("drag-active"); } });
  $("#composerWrap").addEventListener("drop", async (event) => { event.preventDefault(); $("#dropOverlay").classList.remove("visible"); $("#composerWrap").classList.remove("drag-active"); if (event.dataTransfer?.files?.length) await addPendingFiles(event.dataTransfer.files); });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); createChat(); renderAll(); $("#promptInput").focus(); }
    if ((event.ctrlKey || event.metaKey) && event.key === ",") { event.preventDefault(); openSettings("general", settingsHandlers()); }
    if (event.key === "Escape") { if ($("#devtoolsMount").firstElementChild) $("#devtoolsMount").innerHTML = ""; closeSidebarOnMobile(); }
  });
  window.addEventListener("resize", () => { if (window.innerWidth > 700) { $("#sidebar").classList.remove("open"); $("#mobileScrim").classList.remove("visible"); } });
}

function settingsHandlers() {
  return {
    onSaved() { renderAll(); toast("Settings saved"); },
    onToast: toast,
    async onDataAction(action) {
      if (action === "chats") downloadBlob(JSON.stringify(state.chats, null, 2), "openchat-conversations.json", "application/json");
      else if (action === "settings") downloadBlob(JSON.stringify(state.settings, null, 2), "openchat-settings.json", "application/json");
      else if (action === "devtools") downloadBlob(JSON.stringify(state.requests, null, 2), "openchat-devtools.json", "application/json");
      else if (action === "clear-chats") {
        if (!confirm("Delete all chat history in this browser?")) return;
        state.chats = []; state.currentChatId = null; persistChats(); createChat(); renderAll(); toast("Conversation history cleared");
      } else if (action === "clear-files") {
        if (!confirm("Delete uploaded and generated local files?")) return;
        await dbClear("attachments"); state.pendingAttachments = []; renderAttachmentStrip(); toast("Local attachments cleared");
      } else if (action === "clear-proxy") {
        if (!confirm("Delete stored Web Proxy response snapshots?")) return;
        await dbClear("proxyResponses"); state.requests = []; state.selectedRequestId = null; renderSidebarCounts(); toast("Proxy history cleared");
      } else if (action === "clear-all") {
        if (!confirm("Reset local OpenChat chats, files, proxy snapshots, and settings?")) return;
        await dbClear("attachments"); await dbClear("proxyResponses"); state.chats = []; state.currentChatId = null; state.pendingAttachments = []; state.requests = []; localStorage.removeItem("openchat:settings:v1"); persistChats(); createChat(); renderAll(); toast("Local OpenChat reset");
      }
    }
  };
}

async function init() {
  applyAppearance(); installMotion(); configureEvents();
  try {
    const [modelData, pluginData] = await Promise.all([getModels(), getPlugins()]);
    state.models = modelData.models || [];
    state.plugins = pluginData.plugins || [];
    state.imageModel = modelData.image_model || state.imageModel;
    if (!state.models.some((model) => model.id === state.settings.model)) state.settings.model = state.models.find((model) => model.default)?.id || state.models[0]?.id;
  } catch (error) {
    toast(`Could not load Worker metadata: ${error.message}`, "error");
    state.models = [
      { id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash", vendor: "Z.ai", thinking: { supported: true }, tools: true, vision: false, default: true },
      { id: "@cf/google/gemma-4-26b-a4b-it", name: "Gemma 4 26B", vendor: "Google", thinking: { supported: true }, tools: true, vision: true },
      { id: "@cf/nvidia/nemotron-3-120b-a12b", name: "Nemotron 3 Super", vendor: "NVIDIA", thinking: { supported: true }, tools: true, vision: false }
    ];
  }
  if (!state.chats.length) createChat();
  if (!state.currentChatId || !state.chats.some((chat) => chat.id === state.currentChatId)) state.currentChatId = state.chats[0]?.id || createChat().id;
  try { await loadDevtools(); } catch {}
  renderAll();
  health().then(() => { const indicator = $(".status-indicator"); if (indicator) indicator.title = "Worker health check passed"; }).catch(() => { const indicator = $(".status-indicator"); if (indicator) { indicator.title = "Worker is reachable only if API calls succeed"; indicator.style.opacity = ".65"; } });
}

init();
