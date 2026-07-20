import { mockProvider } from "./mock-provider.js";

const LIVE_PROVIDER_TOOLS = Object.freeze({
  fal: ["FLUX 2 Pro", "Kling 3", "Veo", "image/video utilities"],
  kie: ["Seedance", "Kling", "Suno", "Nano Banana", "Grok Imagine"],
  openai: ["GPT Image", "GPT Realtime Voice"],
  google: ["Veo", "Lyria", "Gemini"],
  xai: ["Grok Imagine"],
  heygen: ["Avatar IV", "Digital Twin"],
});

class DisabledLiveProviderAdapter {
  constructor(key) { this.key = key; }
  unavailable() { throw new Error(`${this.key} live adapter requires an enabled queue consumer and server-side secret.`); }
  async submitJob() { return this.unavailable(); }
  async getJobStatus() { return this.unavailable(); }
  async cancelJob() { return this.unavailable(); }
  normalizeResult(result) { return result; }
  calculateCost() { return this.unavailable(); }
}

const adapters = new Map([["mock", mockProvider]]);
for (const key of Object.keys(LIVE_PROVIDER_TOOLS)) adapters.set(key, new DisabledLiveProviderAdapter(key));

export const getProviderAdapter = (key) => adapters.get(String(key || "").toLowerCase()) || null;
export const listProviderAdapters = () => [...adapters.keys()].map((key) => ({ key, tools: LIVE_PROVIDER_TOOLS[key] || ["Deterministic full workflow"] }));
