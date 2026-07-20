import { calculateWorkflowCost, mockProgressForAge } from "../workflow-domain.js";

/**
 * Deterministic provider used by development, automated tests and production
 * smoke tests. It never calls an external service and never receives secrets.
 */
export class MockProviderAdapter {
  key = "mock";

  validateConfiguration() {
    return { ok: true, mode: "demo", secretRequired: false };
  }

  validateInput({ workflow } = {}) {
    const cost = calculateWorkflowCost(workflow, this.key);
    return cost.ok ? { ok: true } : { ok: false, error: cost.error };
  }

  estimateProviderCost() {
    return { ok: true, currency: "USD", amount: 0 };
  }

  estimateCreditCost({ workflow } = {}) {
    return calculateWorkflowCost(workflow, this.key);
  }

  async submitJob({ jobId, workflowHash }) {
    return { providerRequestId: `mock_${jobId}`, accepted: true, workflowHash };
  }

  async getJobStatus({ createdAt, forceFailure = false }) {
    const age = Math.max(0, Math.floor(Date.now() / 1000) - Number(createdAt || 0));
    const progress = mockProgressForAge(age);
    if (forceFailure && progress.status === "completed") return { status: "failed", progress: 100, error: "Mock Provider forced failure" };
    return progress;
  }

  async cancelJob({ providerRequestId }) {
    return { providerRequestId, status: "cancelled" };
  }

  normalizeResult(result) {
    return {
      provider: this.key,
      mode: "demo",
      label: "Demo Output — no paid AI model was called.",
      status: result?.status || "completed",
      contentType: result?.contentType || "application/json",
      filename: result?.filename || "shazan-mock-result.json",
      body: result?.body || JSON.stringify(result || {}),
    };
  }

  normalizeError(error) {
    return { code: "DEMO_PROVIDER_ERROR", message: error instanceof Error ? error.message : "Demo Provider failed" };
  }

  handleWebhook(payload) {
    return { accepted: true, payload };
  }

  async verifyWebhook() {
    return true;
  }

  async checkAvailability() {
    return { available: true, mode: "demo" };
  }

  calculateCost(workflow) {
    return calculateWorkflowCost(workflow, this.key);
  }
}

export const mockProvider = new MockProviderAdapter();
