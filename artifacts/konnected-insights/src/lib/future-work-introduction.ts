import type { FwFunction } from './api-future-work';

const framing: Record<string, string> = {
  finance: 'For finance teams, the central questions concern capital allocation, financial controls and the judgement needed to turn data into decisions.',
  marketing: 'For marketing teams, the focus is on understanding audiences, building trust and evaluating how changing tools affect creative work and measurement.',
  hr: 'For HR teams, the focus is on workforce planning, skills development and the policies that shape fair and effective work.',
  operations: 'For operations teams, the focus is on resilient delivery, process design and the coordination of people, systems and resources.',
  sales: 'For sales teams, the central questions concern customer relationships, commercial judgement and how tools support the selling process.',
  'technology-it': 'For technology and IT teams, the focus is on reliable infrastructure, secure systems and the skills and governance needed to adopt new technology responsibly.',
  grc: 'For governance, risk and compliance teams, the focus is on accountability, oversight and translating changing requirements into effective controls.',
};

const boilerplate = new Set([
  'Choose a time horizon to read the available published research.',
  'Technology looks at tools and systems; the Field lens looks at how professional practice and work are organized.',
].map(text => text.toLowerCase()));

/** Derive display copy only: never rewrite the saved editorial fields. */
export function functionIntroduction(fn: Pick<FwFunction, 'slug' | 'name' | 'description' | 'presentation'>): string[] {
  const seen = new Set<string>();
  const clean = (value?: string) => (value ?? '').trim().split(/(?<=[.!?])\s+/).filter(sentence => {
    const key = sentence.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || boilerplate.has(key) || seen.has(key) ||
      /^explore the future of .+ through technology, professional practice and three time horizons\.$/.test(key)) return false;
    seen.add(key);
    return true;
  }).join(' ');
  const short = clean(fn.presentation?.shortIntroduction);
  const overview = clean(fn.presentation?.sectionIntroductions?.overview);
  // Without a distinct explicit overview, the saved description supplied the
  // former Overview section. Preserve it even when a subheading is present.
  const description = overview ? '' : clean(fn.description);
  const paragraphs = [short, overview || description].filter(Boolean);
  if (!overview && !description) {
    const fallback = clean(framing[fn.slug] ??
      `For ${fn.name.trim() || 'this business function'}, the focus is on how people, tools and working practices support its responsibilities and decisions.`);
    if (fallback) paragraphs.push(fallback);
  }
  return paragraphs;
}