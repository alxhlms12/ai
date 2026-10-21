// Keep this list intentionally small. It is an allowlist, not a billing guarantee.
// Cloudflare's eligibility, availability, and daily neuron limits are account-controlled.
export const CHAT_MODELS = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash",
    vendor: "Z.ai",
    description: "Fast multilingual chat, reasoning, and tool use",
    freeEligible: true,
    thinking: { supported: true, parameter: "reasoning_effort", levels: ["auto", "low", "medium", "high"] },
    tools: true,
    vision: false,
    default: true
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B",
    vendor: "Google",
    description: "Multimodal model with reasoning and function calling",
    freeEligible: true,
    thinking: { supported: true, parameter: "reasoning_effort", levels: ["auto", "low", "medium", "high"] },
    tools: true,
    vision: true,
    default: false
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    name: "Llama 3.3 70B Fast",
    vendor: "Meta",
    description: "General-purpose chat with function calling",
    freeEligible: true,
    thinking: { supported: false, parameter: null, levels: ["auto"] },
    tools: true,
    vision: false,
    default: false
  },
  {
    id: "@cf/nvidia/nemotron-3-120b-a12b",
    name: "Nemotron 3 Super 120B",
    vendor: "NVIDIA",
    description: "Agentic reasoning and tool-use model",
    freeEligible: true,
    thinking: { supported: true, parameter: "nemotron", levels: ["auto", "low", "medium"] },
    tools: true,
    vision: false,
    default: false
  }
];

export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export function findChatModel(id) {
  return CHAT_MODELS.find((model) => model.id === id) || null;
}

export function publicModelList() {
  return CHAT_MODELS.map(({ id, name, vendor, description, freeEligible, thinking, tools, vision, default: isDefault }) => ({
    id, name, vendor, description, freeEligible, thinking, tools, vision, default: isDefault
  }));
}
