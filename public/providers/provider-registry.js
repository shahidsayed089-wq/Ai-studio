import { mockProvider } from "./mock-provider.js";
import { falProvider } from "./fal-provider.js";

const LIVE_PROVIDER_TOOLS = Object.freeze({
  fal: ["FLUX 2 Pro", "Kling 3", "Veo", "image/video utilities"],
  kie: ["Seedance", "Kling", "Suno", "Nano Banana", "Grok Imagine"],
  openai: ["GPT Image", "GPT Realtime Voice"],
  google: ["Veo", "Lyria", "Gemini"],
  xai: ["Grok Imagine"],
  heygen: ["Avatar IV", "Digital Twin"],
  runway: ["Runway video models"],
  muapi: ["Image, video and utility models"],
});

class DisabledLiveProviderAdapter {
  constructor(key) { this.key = key; }
  unavailable() { throw new Error(`${this.key} live adapter requires an enabled queue consumer and server-side secret.`); }
  validateConfiguration() { return { ok: false, error: `${this.key} is disabled until staging verification passes.` }; }
  validateInput() { return this.validateConfiguration(); }
  estimateProviderCost() { return this.unavailable(); }
  estimateCreditCost() { return this.unavailable(); }
  async submitJob() { return this.unavailable(); }
  async getJobStatus() { return this.unavailable(); }
  async cancelJob() { return this.unavailable(); }
  normalizeResult(result) { return result; }
  normalizeError() { return { code: "PROVIDER_DISABLED", message: `${this.key} is not live.` }; }
  handleWebhook() { return this.unavailable(); }
  async verifyWebhook() { return false; }
  async checkAvailability() { return { available: false, mode: "disabled" }; }
  calculateCost() { return this.unavailable(); }
}

const adapters = new Map([["mock", mockProvider], ["fal", falProvider]]);
for (const key of Object.keys(LIVE_PROVIDER_TOOLS)) {
  if (!adapters.has(key)) adapters.set(key, new DisabledLiveProviderAdapter(key));
}

export const getProviderAdapter = (key) => adapters.get(String(key || "").toLowerCase()) || null;
export const listProviderAdapters = () => [...adapters.keys()].map((key) => ({ key, tools: LIVE_PROVIDER_TOOLS[key] || ["Deterministic full workflow"] }));
