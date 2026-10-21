import { state } from "./state.js";
import { openSettings } from "./settings.js";

export function buildPluginSettings() {
  return {
    web_proxy: { enabled: Boolean(state.settings.webProxy), prompt: state.settings.proxyInstructions || "" },
    custom_instructions: { enabled: Boolean(state.settings.customInstructionsEnabled), prompt: state.settings.customInstructions || "" }
  };
}
export function pluginCanRun(pluginId) {
  if (pluginId === "web_proxy") return Boolean(state.settings.webProxy);
  if (pluginId === "custom_instructions") return Boolean(state.settings.customInstructionsEnabled);
  return false;
}
export function openPluginManager(handlers = {}) { openSettings("plugins", handlers); }
export function enabledPluginCount() {
  return Number(Boolean(state.settings.webProxy)) + Number(Boolean(state.settings.customInstructionsEnabled));
}
