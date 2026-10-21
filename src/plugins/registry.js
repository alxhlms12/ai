import { webProxyPlugin } from "./web-proxy.js";
import { customInstructionsPlugin } from "./instructions.js";

const PLUGINS = [webProxyPlugin, customInstructionsPlugin];

export function listPlugins() {
  return PLUGINS.map((plugin) => plugin.manifest);
}

export function getEnabledPlugins(pluginSettings = {}) {
  return PLUGINS.filter((plugin) => {
    const current = pluginSettings[plugin.manifest.id];
    return current?.enabled ?? plugin.manifest.defaultEnabled ?? false;
  });
}

export function buildPluginInstructions(pluginSettings = {}) {
  return getEnabledPlugins(pluginSettings)
    .map((plugin) => {
      if (typeof plugin.buildInstructions === "function") return plugin.buildInstructions(pluginSettings[plugin.manifest.id] || {});
      return plugin.systemInstruction || "";
    })
    .filter(Boolean);
}

export function getToolPlugins(pluginSettings = {}) {
  return getEnabledPlugins(pluginSettings).filter((plugin) => Array.isArray(plugin.tools) && plugin.tools.length > 0);
}

export async function executePluginTool(name, args, context = {}) {
  for (const plugin of getEnabledPlugins(context.pluginSettings || {})) {
    if (plugin.tools?.some((tool) => tool.name === name)) {
      return plugin.execute(name, args, context);
    }
  }
  throw new Error(`Tool is not enabled or does not exist: ${name}`);
}
