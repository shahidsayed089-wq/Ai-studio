import Link from "next/link";
import "./legal.css";

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };

const links = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Acceptable Use", "/acceptable-use"],
  ["Copyright / DMCA", "/dmca"],
  ["Refunds", "/refund-policy"],
];

export default function LegalPage({ label, title, summary, sections }: { label: string; title: string; summary: string; sections: LegalSection[] }) {
  return <main className="legal-shell">
    <header className="legal-header"><Link href="/"><span>✦</span><b>SHAZAN AI</b></Link><small>PUBLIC BETA LEGAL</small></header>
    <article className="legal-content">
      <small>{label}</small><h1>{title}</h1>
      <p className="legal-updated">Effective: 20 July 2026 · Last updated: 20 July 2026</p>
      <p className="legal-summary">{summary}</p>
      {sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items?.length ? <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>)}
      <nav className="legal-nav" aria-label="Legal policies">{links.map(([name, href]) => <Link href={href} key={href}>{name}</Link>)}</nav>
    </article>
  </main>;
}
