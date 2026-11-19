import { createHash } from "node:crypto";
import { z } from "zod/v4";
import type { EditorialSource } from "./editorialSource";

const researchSourceUrl = z.string().trim().min(1).max(2048).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      context.addIssue({ code: "custom", message: "Research source URLs must be public HTTP(S) URLs without credentials" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Research source URL is invalid" });
  }
});
export const researchSourcesSchema = z.object({
  urls: z.array(researchSourceUrl).max(10),
  instructions: z.string().trim().max(4000),
}).strict();
export type ResearchSources = z.infer<typeof researchSourcesSchema>;

const normalizedRestrictionUrl = (input: string) => {
  const url = new URL(input);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
};

/** A configured URL is both a directly fetched page and a discovery root. */
export function isWithinResearchSources(candidate: string, sources?: ResearchSources | null) {
  if (!sources?.urls.length) return true;
  let url: URL;
  try { url = normalizedRestrictionUrl(candidate); } catch { return false; }
  return sources.urls.some(input => {
    const root = normalizedRestrictionUrl(input);
    if (url.protocol !== root.protocol || url.hostname !== root.hostname || url.port !== root.port) return false;
    const pathAllowed = root.pathname === "/" || url.pathname === root.pathname || url.pathname.startsWith(`${root.pathname}/`);
    if (!pathAllowed) return false;
    // A configured query identifies a specific resource and must not broaden discovery.
    return !root.search || url.search === root.search;
  });
}

// Draft edits are not provider output: concise human drafts may be incomplete.
// Strict evidence/classification checks remain at the publication boundary.
export const futureWorkReviewInput = z.object({
  action: z.enum(["approve","reject","edit","unpublish","restore"]), revision: z.number().int().positive(),
  reason: z.string().max(2000).optional(),
  changes: z.object({
    title: z.string().trim().min(1).max(250), summary: z.string().trim().min(1).max(2000),
    skills: z.array(z.string().trim().min(1).max(120)).max(12),
    organization: z.string().trim().min(1).max(200), programName: z.string().trim().min(1).max(250),
    description: z.string().trim().min(1).max(500),
  }).partial().strict().optional(),
}).strict().refine(v => v.action !== "edit" || !!v.changes && Object.keys(v.changes).length>0,"Edits need changed fields");

export const horizons = [
  { year: 2030, label: "Data-backed outlook", disclaimer: "" },
  { year: 2050, label: "Structural forecast", disclaimer: "" },
  { year: 2100, label: "Scenario / speculative thinking", disclaimer: "This is expert speculation, not a forecast." },
];
// Conservative, inspectable authenticity policy. Unknown publishers are rejected;
// a model cannot grant itself credibility. Subdomains share a single identity.
const publishers: Record<string, string> = {
  "weforum.org": "World Economic Forum", "oecd.org": "OECD", "ilo.org": "International Labour Organization",
  "imf.org": "IMF", "worldbank.org": "World Bank", "mckinsey.com": "McKinsey",
  "deloitte.com": "Deloitte", "pwc.com": "PwC", "gartner.com": "Gartner",
  "hbr.org": "Harvard Business Review", "mit.edu": "MIT", "stanford.edu": "Stanford",
  "ox.ac.uk": "University of Oxford", "cfainstitute.org": "CFA Institute",
  "reuters.com": "Reuters", "ft.com": "Financial Times", "brookings.edu": "Brookings",
  "ibm.com": "IBM", "microsoft.com": "Microsoft", "accenture.com": "Accenture",
  "harvard.edu": "Harvard University", "insead.edu": "INSEAD",
};
export function publisherIdentity(url: string) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  return Object.keys(publishers).find(domain => host === domain || host.endsWith(`.${domain}`)) ?? null;
}
export function sourceEvidence(source: EditorialSource, months: number, now = new Date()) {
  const publisher = publisherIdentity(source.url);
  if (!publisher) throw new Error("Unverified publisher: institutional authenticity not established");
  if (source.text.length < 600) throw new Error("Insufficient fetched evidence");
  if (/access denied|verify you are human|enable javascript and cookies|captcha/i.test(source.title)) throw new Error("Access wall, not accessible evidence");
  const date = source.date ? new Date(source.date) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error("Source publication date unavailable in fetched page");
  const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  if (date > now || date < cutoff) throw new Error("Source publication date outside configured window");
  return {
    url: source.url, title: source.title, publisher, publisherName: publishers[publisher],
    publishedAt: date.toISOString(), fetchedAt: now.toISOString(),
    excerpt: source.text.slice(0, 14000), author: source.author ?? null,
    authenticity: `Fetched public content on verified institutional publisher domain ${publisher}; author ${source.author || "not provided"}`,
    contentHash: createHash("sha256").update(source.text).digest("hex"),
    verification: {
      method: "dns-pinned-http", finalUrl: source.url, publisherIdentity: publisher,
      fetchedAt: now.toISOString(),
      excerptHash: createHash("sha256").update(source.text.slice(0,14000)).digest("hex"),
    },
  };
}
export function validResearchEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, any>;
  try {
    const url = new URL(source.url);
    const publisher = publisherIdentity(source.url);
    const published = new Date(source.publishedAt).getTime();
    const fetched = new Date(source.fetchedAt).getTime();
    if (!["http:","https:"].includes(url.protocol) || url.username || url.password || !publisher ||
        source.publisher !== publisher || typeof source.title !== "string" || !source.title.trim() ||
        typeof source.publishedAt !== "string" || typeof source.fetchedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(source.publishedAt) || !/^\d{4}-\d{2}-\d{2}T/.test(source.fetchedAt) ||
        !/^[a-f0-9]{64}$/.test(source.contentHash) ||
        typeof source.excerpt !== "string" || source.excerpt.length < 600 ||
        !Number.isFinite(published) || !Number.isFinite(fetched) || published > fetched ||
        fetched > Date.now()+60_000) return false;
    // Older research records predate the explicit verification object. They must
    // still satisfy the deterministic domain/date/hash/evidence checks; approval
    // separately requires their independently persisted accepted fetch receipt.
    if (!source.verification) return true;
    const v = source.verification;
    return v.method === "dns-pinned-http" && v.finalUrl === source.url &&
      v.publisherIdentity === publisher && v.fetchedAt === source.fetchedAt &&
      v.excerptHash === createHash("sha256").update(source.excerpt).digest("hex");
  } catch { return false; }
}
export function eligiblePublishedProgram(data: Record<string, any>) {
  return data.classification === "accept" && data.relevant === true &&
    typeof data.organization === "string" && !!data.organization.trim() &&
    typeof data.programName === "string" && !!data.programName.trim() &&
    Array.isArray(data.sources) && data.sources.length > 0 &&
    data.sources.every((source: any) => !!source.verification && validResearchEvidence(source));
}
export function nextRunAt(id: string, now = new Date()) {
  const next = new Date(now);
  if (id === "news") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + (id === "2100" ? 12 : id === "2050" ? 6 : 1));
  return next;
}
export const programClassifierInstructions = `Classify programs by what they teach, not their institution's prestige.
ACCEPT: "AI for Finance Leaders" explicitly teaches future AI transformation of finance leadership.
REJECT: "Finance for Non-Finance Managers" teaches generic current operational finance.
ACCEPT: "Leading Digital Transformation" with evidenced emerging-technology organizational transformation.
REJECT: "Excel Basics" and standard accounting certifications: operational training.
UNCERTAIN: "Leadership Academy" without a retrieved curriculum; do not infer a future focus.
Return classification accept|reject|uncertain and an evidence-grounded rationale.`;