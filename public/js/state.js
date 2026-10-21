try {
  sessionStorage.removeItem("openchat:api-key");
  localStorage.removeItem("openchat:api-key");
  localStorage.removeItem("openchat:api-key-remembered:v1");
} catch {}

export const STORAGE_KEYS = {
  chats: "openchat:chats:v1",
  settings: "openchat:settings:v1"
};

export const defaults = {
  model: "@cf/zai-org/glm-4.7-flash",
  thinking: "auto",
  temperature: 0.6,
  maxTokens: 3072,
  stream: true,
  webProxy: true,
  customInstructionsEnabled: true,
  customInstructions: "Prefer clear, technically accurate answers. When writing code, include enough context to run it and explain any required setup.",
  proxyInstructions: "Use the Web Proxy when comparing public APIs or checking current public documentation.",
  accent: "#b7a5ff",
  bg: "#111116",
  panel: "#191920",
  sidebarColor: "#15151c",
  textColor: "#f3f1f8",
  font: "sans",
  radius: 16,
  motion: "spring",
  density: "comfortable",
  showActivity: true,
  confirmProxy: false
};

function safeLoad(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

export const state = {
  models: [],
  plugins: [],
  imageModel: "@cf/black-forest-labs/flux-1-schnell",
  chats: safeLoad(STORAGE_KEYS.chats, []),
  settings: { ...defaults, ...safeLoad(STORAGE_KEYS.settings, {}) },
  currentChatId: null,
  pendingAttachments: [],
  requests: [],
  selectedRequestId: null,
  activeDevTab: "requests",
  modalTab: "general",
  busy: false,
  abortController: null,
  toastTimer: null
};

export function persistChats() {
  try { localStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(state.chats)); }
  catch { window.dispatchEvent(new CustomEvent("openchat:storage-warning")); }
}
export function persistSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  } catch {}
}
export function chatById(id) { return state.chats.find((chat) => chat.id === id) || null; }
export function activeChat() { return chatById(state.currentChatId); }
export function createChat() {
  const chat = { id: crypto.randomUUID(), title: "New conversation", model: state.settings.model, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  state.chats.unshift(chat);
  state.currentChatId = chat.id;
  persistChats();
  return chat;
}
export function ensureChat() { return activeChat() || createChat(); }

export function applyAppearance() {
  const root = document.documentElement;
  root.style.setProperty("--accent", state.settings.accent || defaults.accent);
  root.style.setProperty("--bg", state.settings.bg || defaults.bg);
  root.style.setProperty("--panel", state.settings.panel || defaults.panel);
  root.style.setProperty("--sidebar", state.settings.sidebarColor || defaults.sidebarColor);
  root.style.setProperty("--text", state.settings.textColor || defaults.textColor);
  root.style.setProperty("--radius", `${Math.max(8, Math.min(24, Number(state.settings.radius) || 16))}px`);
  root.style.setProperty("--radius-small", `${Math.max(5, Math.min(14, (Number(state.settings.radius) || 16) * 0.62))}px`);
  root.style.setProperty("--font-body", state.settings.font === "system" ? "system-ui, sans-serif" : state.settings.font === "mono" ? 'ui-monospace, SFMono-Regular, Consolas, monospace' : '"DM Sans", system-ui, sans-serif');
  root.style.setProperty("--font-display", state.settings.font === "system" ? "system-ui, sans-serif" : state.settings.font === "mono" ? 'ui-monospace, SFMono-Regular, Consolas, monospace' : 'Manrope, "DM Sans", sans-serif');
  root.dataset.motion = state.settings.motion === "off" ? "off" : state.settings.motion === "subtle" ? "subtle" : "spring";
  root.dataset.density = state.settings.density || "comfortable";
  if (state.settings.motion === "off") root.classList.add("reduced-motion"); else root.classList.remove("reduced-motion");
}
