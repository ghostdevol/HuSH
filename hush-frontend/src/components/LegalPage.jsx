import React from 'react';
import { LEGAL_DOCS } from '../legal';

// Renders one of the legal documents (rules / privacy / terms) as a
// full-screen reading view. The markdown is ours and small, so a tiny
// renderer covers it: # / ## / ### headings, - bullets, **bold**,
// *italic*, paragraphs.

function renderInline(text, keyPrefix) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) parts.push(<strong key={`${keyPrefix}-${i}`} className="font-bold text-white">{token.slice(2, -2)}</strong>);
    else parts.push(<em key={`${keyPrefix}-${i}`}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Markdown({ md }) {
  const blocks = [];
  const lines = md.split('\n');
  let list = null;
  const flushList = () => {
    if (list) { blocks.push(list); list = null; }
  };
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith('- ')) {
      if (!list) list = { type: 'ul', items: [] };
      list.items.push(t.slice(2));
      return;
    }
    flushList();
    if (!t) return;
    if (t.startsWith('### ')) blocks.push({ type: 'h3', text: t.slice(4) });
    else if (t.startsWith('## ')) blocks.push({ type: 'h2', text: t.slice(3) });
    else if (t.startsWith('# ')) blocks.push({ type: 'h1', text: t.slice(2) });
    else blocks.push({ type: 'p', text: t });
  });
  flushList();
  return (
    <div>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <h1 key={i} className="mb-1 text-xl font-black text-white">{renderInline(b.text, i)}</h1>;
        if (b.type === 'h2') return <h2 key={i} className="mb-1.5 mt-5 text-sm font-black uppercase tracking-wide text-rose-300">{renderInline(b.text, i)}</h2>;
        if (b.type === 'h3') return <h3 key={i} className="mb-1 mt-4 text-sm font-bold text-slate-100">{renderInline(b.text, i)}</h3>;
        if (b.type === 'ul') {
          return (
            <ul key={i} className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
              {b.items.map((item, j) => <li key={j}>{renderInline(item, `${i}-${j}`)}</li>)}
            </ul>
          );
        }
        return <p key={i} className="mb-2 text-sm leading-relaxed text-slate-300">{renderInline(b.text, i)}</p>;
      })}
    </div>
  );
}

export default function LegalPage({ doc, onClose }) {
  const entry = LEGAL_DOCS[doc] || LEGAL_DOCS.rules;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#05070d]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-4">
        <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200">
          ← Back
        </button>
        <span className="text-sm font-black tracking-wide text-white">HuSH {entry.title}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl p-5 pb-12">
          <Markdown md={entry.md} />
        </div>
      </div>
    </div>
  );
}
