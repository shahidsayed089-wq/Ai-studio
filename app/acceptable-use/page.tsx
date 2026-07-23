import LegalPage from "../legal/LegalPage";

export const metadata = { title: "Acceptable Use Policy · SHAZAN AI" };

export default function AcceptableUsePage() { return <LegalPage label="ACCEPTABLE USE" title="Create responsibly." summary="Use SHAZAN AI for lawful, consented and safe creative work. These restrictions apply to prompts, uploads, workflows, shares and generated assets." sections={[
  { title: "Never use the service for", items: ["Child sexual abuse material, sexual content involving minors, grooming or exploitation.", "Non-consensual intimate imagery, sexual deepfakes, harassment, stalking, doxxing or credible threats.", "Fraud, impersonation intended to deceive, phishing, malware, credential theft or evading security controls.", "Terrorist content, instructions for serious wrongdoing, or content that unlawfully promotes violence or hate.", "Infringing uploads, unauthorized biometric cloning, or processing personal data without a lawful basis."] },
  { title: "High-impact and deceptive uses", paragraphs: ["Do not misrepresent generated media as authentic evidence. Clearly disclose materially deceptive synthetic media where required. Do not use outputs as the sole basis for decisions about employment, credit, housing, education, insurance, healthcare, legal rights or other high-impact domains."] },
  { title: "Platform integrity", paragraphs: ["Do not probe other users' projects or assets, bypass credits, submit duplicate webhooks, overload endpoints, scrape private data, resell access without permission or attempt to extract server secrets. Security research requires prior written authorization."] },
  { title: "Enforcement", paragraphs: ["We may block content, cancel jobs, restrict features or suspend accounts when reasonably necessary to enforce this policy. Serious or repeated violations may be reported where legally required. Appeals require the verified production support channel, which remains a launch prerequisite."] },
]} />; }
