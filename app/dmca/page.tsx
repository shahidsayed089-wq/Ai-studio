import LegalPage from "../legal/LegalPage";

export const metadata = { title: "Copyright and DMCA · SHAZAN AI" };

export default function DmcaPage() { return <LegalPage label="COPYRIGHT / DMCA" title="Respect creative rights." summary="SHAZAN AI responds to sufficiently detailed copyright reports and expects users to upload only material they are authorized to process." sections={[
  { title: "Submitting a notice", items: ["Identify the copyrighted work and the allegedly infringing material with enough detail to locate it.", "Provide your name, contact information and a statement of good-faith belief that the use is not authorized.", "State under penalty of perjury that the notice is accurate and you are authorized to act, then provide a physical or electronic signature.", "Send the notice to the verified copyright contact published by the operator before unrestricted public launch."] },
  { title: "Counter-notice", paragraphs: ["If material was removed by mistake or misidentification, the affected user may submit identification of the removed material, a statement under penalty of perjury, consent to the appropriate jurisdiction where required, contact information and signature. Valid counter-notices may be forwarded to the claimant."] },
  { title: "Repeat infringement", paragraphs: ["Accounts associated with repeated, substantiated infringement may be suspended or terminated in appropriate circumstances. False notices may create legal liability. SHAZAN AI does not decide ownership disputes and may preserve relevant records as required by law."] },
  { title: "Launch contact requirement", paragraphs: ["A monitored agent name, postal address and email for copyright notices have not yet been verified in production. This page is functional, but that operational contact is a launch blocker and must be published before the service is declared Public Beta Ready."] },
]} />; }
