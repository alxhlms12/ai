export const customInstructionsPlugin = {
  manifest: {
    id: "custom_instructions",
    name: "Custom Instructions",
    version: "1.0.0",
    description: "Adds user-authored instructions to the system prompt for each request.",
    kind: "prompt",
    defaultEnabled: true,
    capabilities: ["system_prompt.append"]
  },
  buildInstructions(settings = {}) {
    const prompt = String(settings.prompt || "").trim().slice(0, 8_000);
    return prompt ? `User-configured additional instructions (treat as preferences, below system safety rules):\n${prompt}` : "";
  }
};
