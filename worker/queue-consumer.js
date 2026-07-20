import { ensureWorkflowSchema, processPersistentJob, sendOperationalAlert } from "../public/workflow-api.js";

const terminal = new Set(["completed", "failed", "cancelled"]);

const worker = {
  async queue(batch, env) {
    await ensureWorkflowSchema(env.DB);
    for (const message of batch.messages) {
      try {
        const { jobId, userId } = message.body || {};
        if (!jobId || !userId) { message.ack(); continue; }
        const job = await processPersistentJob(env, jobId, userId);
        if (!job || terminal.has(job.status)) message.ack();
        else message.retry({ delaySeconds: job.status === "queued" ? 2 : 8 });
      } catch (error) {
        await sendOperationalAlert(env, { severity: "error", type: "queue_message_failed", job_id: message.body?.jobId, provider: message.body?.provider, status: "retrying", message: String(error?.message || "Queue message processing failed").slice(0, 500) });
        message.retry({ delaySeconds: Math.min(300, 2 ** Math.min(8, message.attempts || 1)) });
      }
    }
  },

  async scheduled(_controller, env) {
    await ensureWorkflowSchema(env.DB);
    const timestamp = Math.floor(Date.now() / 1000);
    await env.DB.prepare("DELETE FROM shazan_job_leases_v1 WHERE leased_until<=?").bind(timestamp).run();
    const pending = await env.DB.prepare("SELECT id,user_id FROM shazan_jobs_v1 WHERE status IN ('queued','processing') ORDER BY updated_at ASC LIMIT 50").all();
    for (const job of pending.results || []) {
      const updated = await processPersistentJob(env, job.id, job.user_id);
      if (updated && !terminal.has(updated.status) && env.WORKFLOW_QUEUE?.send) {
        await env.WORKFLOW_QUEUE.send({ jobId: updated.id, userId: updated.user_id, provider: updated.provider_key }, { contentType: "json", delaySeconds: updated.status === "queued" ? 2 : 8 });
      }
    }
  },

  async fetch(_request, env) {
    await ensureWorkflowSchema(env.DB);
    const [pending, activeLeases] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS value FROM shazan_jobs_v1 WHERE status IN ('queued','processing')"),
      env.DB.prepare("SELECT COUNT(*) AS value FROM shazan_job_leases_v1 WHERE leased_until>?").bind(Math.floor(Date.now() / 1000)),
    ]);
    return Response.json({ status: "ok", service: "SHAZAN queue consumer", pending: Number(pending?.results?.[0]?.value || 0), active_leases: Number(activeLeases?.results?.[0]?.value || 0) });
  },
};

export default worker;
