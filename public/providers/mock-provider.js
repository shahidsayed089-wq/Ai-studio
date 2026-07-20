import { calculateWorkflowCost, mockProgressForAge } from "../workflow-domain.js";

/**
 * Deterministic provider used by development, automated tests and production
 * smoke tests. It never calls an external service and never receives secrets.
 */
export class MockProviderAdapter {
  key = "mock";

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
      status: result?.status || "completed",
      contentType: result?.contentType || "application/json",
      filename: result?.filename || "shazan-mock-result.json",
      body: result?.body || JSON.stringify(result || {}),
    };
  }

  calculateCost(workflow) {
    return calculateWorkflowCost(workflow, this.key);
  }
}

export const mockProvider = new MockProviderAdapter();
