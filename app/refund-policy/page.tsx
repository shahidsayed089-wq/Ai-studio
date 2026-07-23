import LegalPage from "../legal/LegalPage";

export const metadata = { title: "Refund Policy · SHAZAN AI" };

export default function RefundPolicyPage() { return <LegalPage label="REFUND POLICY" title="No surprise billing." summary="The current public beta does not accept payments. New accounts receive 500 non-transferable welcome credits with no cash value." sections={[
  { title: "Current beta", paragraphs: ["Stripe and credit purchases are server-disabled. Because no money is accepted, there is currently no paid purchase to refund. Welcome credits cannot be redeemed, transferred or exchanged for money."] },
  { title: "Generation credit behavior", paragraphs: ["A generation estimate is reserved atomically when a job starts. Credits are charged exactly once only after success. Permanently failed or cancelled jobs automatically release the reservation. Retrying creates a separate idempotent reservation and never double-charges the original job."] },
  { title: "Before payments are enabled", paragraphs: ["This policy will be updated with package prices, eligibility windows, processing times, taxes and a monitored billing contact. Statutory refund and cancellation rights will apply where required. Payments must remain disabled until that policy and the complete payment test suite have been approved."] },
  { title: "Disputes", paragraphs: ["If a ledger entry appears incorrect during beta, preserve the job ID and ledger entry ID for support review. Administrative adjustments require a reason and create an audit log; they are not a substitute for legally required refunds after payments are introduced."] },
]} />; }
