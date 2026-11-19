import { db, editorialItemsTable, type NewEditorialItem } from "@workspace/db";
import { and, eq, lte, or, sql } from "drizzle-orm";

type SeedItem = NewEditorialItem;

const published = (
  collection: SeedItem["collection"],
  slug: string,
  title: string,
  sortOrder: number,
  data: Record<string, unknown>,
): SeedItem => ({ collection, slug, title, sortOrder, data, status: "published" });

const newsletters = [
  ["future-is-longer", "Why I believe the future is longer (and why you should plan for it)", "Longer healthy lives fundamentally reshape the traditional trajectory of retirement and work. We must re-evaluate how we structure our careers and organizations for a radically extended horizon.", "https://www.linkedin.com/posts/varunmalik2017_why-i-believe-the-future-is-longer-and-why-activity-7402220081092530176-h2Z3", "/editorial/sourced/dubai-night.jpg", { name: "Varun Malik", image: "/original/varun-malik.jpg" }, "Foresight"],
  ["gravity-of-ecosystems", "The “Gravity” of Ecosystems: Why the AI Race Is Being Redefined", "How AI ecosystems and deep infrastructure gravity can outweigh isolated foundational model benchmarks. The structural advantage lies in interconnected data networks, not just raw compute.", "https://www.linkedin.com/posts/varunmalik2017_exponentialstrategy-futureofwork-aiinfrastructure-activity-7429759128409034752-fRIB", "/editorial/generated/ai-professions.jpg", { name: "Varun Malik", image: "/original/varun-malik.jpg" }, "Technology"],
  ["ai-landscape-democratizing", "The AI landscape isn't just shifting - it's democratizing.", "Unprecedented frontier AI access is democratizing capability, placing exponential power in the hands of individual operators. The barrier to entry for cognitive work has permanently collapsed.", "https://www.linkedin.com/posts/varunmalik2017_futureofwork-artificialintelligence-claudeai-activity-7462004081381810176-BGan", "/editorial/generated/future-people.jpg", { name: "Varun Malik", image: "/original/varun-malik.jpg" }, "Future of Work"],
  ["disruptive-demographic-age", "We talk constantly about diversity in the workplace, but we are completely ignoring the most disruptive demographic shift in history: Age.", "Longevity and multi-generational teams make age one of the most critical and under-discussed future-of-work questions. Organizations are unprepared for five generations collaborating simultaneously.", "https://www.linkedin.com/posts/varunmalik2017_futureofwork-longevity-leadership-activity-7451857390443839488-4rGC", "/editorial/sourced/team-collaboration.jpg", { name: "Varun Malik", image: "/original/varun-malik.jpg" }, "Leadership"],
  ["one-person-enterprise", "The One-Person Enterprise", "The AI-augmented individual operator is emerging as a structural alternative to the traditional firm. How hyper-capability is rewriting the economics of scale.", "https://www.linkedin.com/posts/kons%C3%A4lid%C3%B6n_kons%C3%A4lid%C3%B6n-ai-series-activity-7463491352224227329-n1oa", "/editorial/generated/future-work-hero.jpg", { name: "Konsälidön" }, "Operations"],
  ["agentic-ai-economy", "The Agentic AI economy", "The era of paying for hours worked is quietly ending. We are moving toward a paradigm where autonomous agents trade value and execute complex supply chain transactions.", "https://www.linkedin.com/posts/kons%C3%A4lid%C3%B6n_the-era-of-paying-for-hours-worked-is-quietly-activity-7462762736993656834-QJvn", "/editorial/generated/future-finance.jpg", { name: "Konsälidön" }, "Economics"],
] as const;

const masterclasses = [
  ["future-is-longer", "Why I believe the future is longer (and why you should plan for it)", "Why I believe the future is longer (and why you should plan for it)", "Longer healthy lives fundamentally reshape the traditional trajectory of retirement and work. A tactical look at longevity.", "/editorial/generated/future-work-hero.jpg", "Longer healthy lives fundamentally reshape the traditional trajectory of retirement and work. As healthspan increases alongside lifespan, the standard three-stage model (learn, work, retire) breaks down.", "Organizations must re-evaluate how they structure career pathways and continuous learning for a radically extended horizon. Individuals must prepare for multi-chapter careers requiring regular skill reinvention.", "https://www.linkedin.com/posts/varunmalik2017_why-i-believe-the-future-is-longer-and-why-activity-7402220081092530176-h2Z3"],
  ["gravity-of-ecosystems", "The “Gravity” of Ecosystems", "The “Gravity” of Ecosystems: Why the AI Race Is Being Redefined", "How AI ecosystems and deep infrastructure gravity can outweigh isolated foundational model benchmarks.", "/editorial/generated/ai-professions.jpg", "The AI landscape is shifting focus from isolated foundational model benchmarks to deep infrastructure gravity. Structural advantage now lies in interconnected data networks and distribution ecosystems.", "Enterprises competing in the AI era must look beyond adopting the \"smartest\" model and focus on building gravity—proprietary data ecosystems that naturally attract developers, users, and integration partners.", "https://www.linkedin.com/posts/varunmalik2017_exponentialstrategy-futureofwork-aiinfrastructure-activity-7429759128409034752-fRIB"],
  ["ai-landscape-democratizing", "The AI landscape isn't just shifting - it's democratizing", "The AI landscape isn't just shifting - it's democratizing.", "Unprecedented frontier AI access is placing exponential power in the hands of individual operators.", "/editorial/generated/future-people.jpg", "Unprecedented frontier AI access is placing exponential power in the hands of individual operators. The barrier to entry for complex cognitive work has permanently collapsed.", "The traditional value of specialized knowledge workers is transitioning toward problem formulation and systems orchestration. Small, highly capable teams equipped with autonomous agents can now rival the output of massive legacy departments.", "https://www.linkedin.com/posts/varunmalik2017_futureofwork-artificialintelligence-claudeai-activity-7462004081381810176-BGan"],
  ["disruptive-demographic-age", "The most disruptive demographic shift in history: Age", "We talk constantly about diversity in the workplace, but we are completely ignoring the most disruptive demographic shift in history: Age.", "Longevity and multi-generational teams make age one of the most critical and under-discussed future-of-work questions.", "/editorial/generated/future-finance.jpg", "Longevity and multi-generational teams make age one of the most critical and under-discussed future-of-work questions. We are entering an era where five generations will collaborate simultaneously.", "HR, leadership, and operational models built for rigid age-based hierarchies will fail. Organizations need new frameworks for managing cognitive diversity, knowledge transfer, and cross-generational productivity without relying on traditional seniority markers.", "https://www.linkedin.com/posts/varunmalik2017_futureofwork-longevity-leadership-activity-7451857390443839488-4rGC"],
] as const;

const futureFunctions = [
  ["marketing", "Marketing", "From broadcasting to hyper-personalized, autonomous engagement.", "/editorial/generated/ai-professions.jpg"],
  ["finance", "Finance", "From historical reporting to real-time, predictive capital allocation.", "/editorial/generated/future-finance.jpg"],
  ["hr", "Human Resources", "From compliance and payroll to cognitive capability management.", "/editorial/generated/future-people.jpg"],
  ["governance-risk-compliance", "Governance, Risk & Compliance", "From rigid frameworks to dynamic, algorithm-assisted risk modeling.", "/editorial/generated/future-work-hero.jpg"],
] as const;

const sectionTemplates = (title: string) => [
  { title: "History of the Profession", text: `A comprehensive look back at the origins of ${title}, how the function established its foundational paradigms, and the historical inflection points that defined its role in the 20th-century enterprise.`, status: "Research brief currently in development by our contributor network." },
  { title: "Career Paths Within It", text: `The traditional ladders and lateral movements that have defined success in ${title}. We examine the core competencies that got leaders to where they are today.`, status: "Curated career trajectory mapping in progress." },
  { title: "What's Changing & What's Next", text: `The exponential technologies and cultural shifts forcing a rewrite of the ${title} playbook. How autonomous systems, decentralized networks, and changing workforce expectations are rendering legacy playbooks obsolete.`, status: "Foresight analysis pending peer review." },
  { title: "Implications", text: "What this transformation means for industries at large, how companies must adapt their structures, and the new cognitive demands placed on individual operators.", status: "Impact models currently being finalized." },
  { title: "Leading Organizations", text: `The enterprises, startups, and institutions actively authoring the next chapter of ${title}. Case studies in early adoption and successful transformation.`, status: "Case studies under curation." },
];

const talks = [
  ["Strategy", "PK-gk1jdvMM", "Transformation of the Healthcare industry and future outlook"],
  ["Strategy", "DPkb0dzhkPM", "Sustainability – Moving from risk to opportunity"],
  ["Marketing & Sales", "AGRqC8oTvek", "The benefit of working with sales enablement"],
  ["Strategy", "FkEAyfgcQes", "Sharpen your Decision Making - Transform your Business"],
  ["Human Capital", "pZQL_5LRsCE", "Quality of Mind - Future Fit"],
  ["Accounting & Finance", "xB9Ty5_bR-0", "Raising Private Equity, Unraveling the world of Venture Financing"],
  ["Digital", "m7uSuKA4PiE", "Leveraging the power of Big Data & Analytics"],
  ["Marketing & Sales", "KexBjShvl8g", "The Secret Recipe for a Winning Loyalty Program"],
  ["Marketing & Sales", "3d-62eZLr3w", "How to create coherence between sales and marketing?"],
  ["Strategy", "kMOgFXpPRUs", "Breaking through gravity to transform the impact of a new strategy"],
  ["Operations", "5nmuE1gWJHs", "Unlocking value by transforming Operational Efficiencies - from Steps to Leaps"],
] as const;

const contributors = [
  ["savi", "Savi", "Co-Founder", "/contributors/savi.svg", "Core Team", true],
  ["vivaan", "Vivaan", "Co-Founder", "/contributors/vivaan.svg", "Core Team", true],
  ["varun-malik", "Varun Malik", "Advisor", "/original/varun-malik.jpg", "Core Team", false],
  ["raj-vattikuti", "Raj Vattikuti", "Contributor", "/original/raj-vattikuti.jpg", "Contributors", false],
  ["vanessa-ugatti", "Vanessa Ugatti", "Contributor", "/original/vanessa-ugatti.jpg", "Contributors", false],
  ["mads-winther", "Mads Winther", "Contributor", "/original/mads-winther.jpg", "Contributors", false],
  ["piers-thurston", "Piers Thurston", "Contributor", "/original/piers-thurston.png", "Contributors", false],
  ["herve-marchet", "Herve Marchet", "Contributor", "/original/herve-marchet.jpg", "Contributors", false],
  ["javier-velasquez", "Javier Velasquez", "Contributor", "/original/javier-velasquez.jpg", "Contributors", false],
  ["anne-marie-thodsen", "Anne Marie Thodsen", "Contributor", "/original/anne-marie-thodsen.jpg", "Contributors", false],
  ["rajiv-narang", "Rajiv Narang", "Contributor", "/original/rajiv-narang.jpg", "Contributors", false],
] as const;

const varunArticles = [
  { title: "Why I believe the future is longer (and why you should plan for it)", excerpt: "Longer healthy lives fundamentally reshape the traditional trajectory of retirement and work.", url: "https://www.linkedin.com/posts/varunmalik2017_why-i-believe-the-future-is-longer-and-why-activity-7402220081092530176-h2Z3", category: "Foresight" },
  { title: "The “Gravity” of Ecosystems: Why the AI Race Is Being Redefined", excerpt: "How AI ecosystems and deep infrastructure gravity can outweigh isolated foundational model benchmarks.", url: "https://www.linkedin.com/posts/varunmalik2017_exponentialstrategy-futureofwork-aiinfrastructure-activity-7429759128409034752-fRIB", category: "Technology" },
];

const contributorLinkedInProfiles: Record<string, string> = {
  "varun-malik": "https://www.linkedin.com/in/varunmalik2017",
  "raj-vattikuti": "https://www.linkedin.com/in/raj-vattikuti-071993122",
  "vanessa-ugatti": "https://www.linkedin.com/in/vanessa-ugatti-legal-pricing",
  "mads-winther": "https://www.linkedin.com/in/mads-winther-19b8811",
  "piers-thurston": "https://www.linkedin.com/in/piersthurston",
  "herve-marchet": "https://www.linkedin.com/in/hervemarchet",
  "javier-velasquez": "https://www.linkedin.com/in/javier-velasquez-game",
  "anne-marie-thodsen": "https://www.linkedin.com/in/annemariedrud",
  "rajiv-narang": "https://www.linkedin.com/in/rajivnarangofficial",
};

const communities = [
  ["the-konsalidon-ecosystem", "The Konsälidön Ecosystem", "Speaking, board, consulting, job opportunities", "https://me.konsalidon.com/ecosystem"],
  ["delivery-ecosystem", "Delivery Ecosystem", "Project and change leaders, opportunities, events, and peer practice", "https://me.konsalidon.com/projects-ecosystem"],
  ["dealflow-ecosystem", "Dealflow Ecosystem", "Transaction advisors and capital allocators, buying/selling businesses and investment", "https://me.konsalidon.com/deals-ecosystem"],
  ["frontier-ecosystem", "Frontier Ecosystem", "Emerging-tech operators, founders, partners, opportunities, briefings, and events", "https://me.konsalidon.com/tech-ecosystem"],
  ["story-ecosystem", "Story Ecosystem", "Senior marketers, future of brands and attention", "https://me.konsalidon.com/marketing-ecosystem"],
  ["people-ecosystem", "People Ecosystem", "HR and people-practice, future of work and organising humans well", "https://me.konsalidon.com/hr-ecosystem"],
  ["capital-ecosystem", "Capital Ecosystem", "Finance leaders, peer roundtables and future of function", "https://me.konsalidon.com/finance-ecosystem"],
  ["foresight-ecosystem", "Foresight Ecosystem", "Strategy professionals, next decade and defining moves", "https://me.konsalidon.com/strategy-ecosystem"],
  ["trust-ecosystem", "Trust Ecosystem", "GRC professionals, structural integrity", "https://me.konsalidon.com/grc-ecosystem"],
  ["sourcing-ecosystem", "Sourcing Ecosystem", "Procurement and supply-side, how value flows", "https://me.konsalidon.com/procurement-ecosystem"],
  ["industry-ecosystem", "Industry Ecosystem", "Manufacturing, future of making and automation", "https://me.konsalidon.com/manufacturing-ecosystem"],
  ["longevity-ecosystem", "Longevity Ecosystem", "Healthspan, longevity, biotech", "https://me.konsalidon.com/long-bio-ecosystem"],
  ["growth-ecosystem", "Growth Ecosystem", "Commercial, sales, revenue, engineering growth", "https://me.konsalidon.com/commercial-ecosystem"],
] as const;

export const editorialSeedItems: SeedItem[] = [
  ...newsletters.map(([slug, title, excerpt, url, image, author, category], index) =>
    published("newsletters", slug, title, index, { excerpt, url, image, author, category })),
  ...masterclasses.map(([slug, title, detailTitle, excerpt, image, framing, implications, url], index) =>
    published("masterclasses", slug, title, index, { detailTitle, category: "Masterclass", excerpt, image, author: { name: "Varun Malik", image: "/original/varun-malik.jpg" }, framing, implications, url, authorName: "Varun Malik" })),
  ...futureFunctions.map(([slug, title, desc, img], index) =>
    published("future-work", slug, title, index, { id: slug, name: title, desc, img, sections: sectionTemplates(title) })),
  ...talks.map(([topic, id, title], index) => published("talks", id.toLowerCase().replace(/_/g, "-"), title, index, { topic, id })),
  ...contributors.map(([slug, name, role, image, group, isPlaceholder], index) =>
    published("contributors", slug, name, index, {
      name, role, image, group, isPlaceholder, isNamedProspect: isPlaceholder,
      ...(contributorLinkedInProfiles[slug] ? { linkedinUrl: contributorLinkedInProfiles[slug] } : {}),
      ...(slug === "varun-malik" ? {
        articles: varunArticles,
      } : {}),
    })),
  ...communities.map(([slug, name, desc, url], index) =>
    published("communities", slug, name, index, { name, desc, url })),
];

type LegacyProspectFingerprint = {
  slug: string;
  title: string;
  sortOrder: number;
  data: Record<string, unknown>;
};

const legacyProspect = (
  slug: string,
  title: string,
  role: string,
  image: string,
  sortOrder: number,
  group: string,
): LegacyProspectFingerprint => ({
  slug,
  title,
  sortOrder,
  data: {
    name: title,
    role,
    image,
    group,
    isPlaceholder: true,
    isNamedProspect: true,
  },
});

/**
 * These are the complete payloads emitted by the old seed. "Network
 * Contributors" was used by an earlier release and "Contributors" by the
 * latest one. Matching the whole payload avoids deleting an editor's record
 * merely because it reuses a historical slug.
 */
export const legacyUnauthorizedProspectFingerprints: LegacyProspectFingerprint[] = [
  ...["Network Contributors", "Contributors"].flatMap((group) => [
    legacyProspect("chandni", "Chandni", "Contributor", "/contributors/chandni.svg", 3, group),
    legacyProspect("kuljeet", "Kuljeet", "Contributor", "/contributors/kuljeet.svg", 4, group),
    legacyProspect("abdul", "Abdul", "Contributor (Newsletter)", "/contributors/abdul.svg", 5, group),
    legacyProspect("ahmed", "Ahmed", "Contributor (Newsletter)", "/contributors/ahmed.svg", 6, group),
    legacyProspect("pranata", "Pranata", "Contributor (Insights)", "/contributors/pranata.svg", 7, group),
  ]),
];

// Only records created by a release before this cleanup are eligible. A later
// explicit re-addition is therefore not a permanently blacklisted slug.
export const legacyUnauthorizedProspectCutoff = new Date("2026-09-19T16:40:00.000Z");

export type LegacyProspectCandidate = {
  collection: string;
  slug: string;
  title: string;
  status: string;
  sortOrder: number;
  data: Record<string, unknown>;
  version: number;
  sourceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const sameJson = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

export function isLegacyUnauthorizedSeededProspect(item: LegacyProspectCandidate): boolean {
  if (
    item.collection !== "contributors"
    || item.status !== "published"
    || item.version !== 1
    || item.sourceId
    || item.createdAt.getTime() !== item.updatedAt.getTime()
    || item.createdAt > legacyUnauthorizedProspectCutoff
  ) {
    return false;
  }

  return legacyUnauthorizedProspectFingerprints.some((fingerprint) =>
    fingerprint.slug === item.slug
    && fingerprint.title === item.title
    && fingerprint.sortOrder === item.sortOrder
    && sameJson(fingerprint.data, item.data));
}

async function removeLegacyUnauthorizedSeededProspects(): Promise<void> {
  await db
    .delete(editorialItemsTable)
    .where(and(
      eq(editorialItemsTable.collection, "contributors"),
      eq(editorialItemsTable.status, "published"),
      eq(editorialItemsTable.version, 1),
      sql`${editorialItemsTable.sourceId} IS NULL`,
      sql`${editorialItemsTable.createdAt} = ${editorialItemsTable.updatedAt}`,
      lte(editorialItemsTable.createdAt, legacyUnauthorizedProspectCutoff),
      or(...legacyUnauthorizedProspectFingerprints.map((fingerprint) => and(
        eq(editorialItemsTable.slug, fingerprint.slug),
        eq(editorialItemsTable.title, fingerprint.title),
        eq(editorialItemsTable.sortOrder, fingerprint.sortOrder),
        eq(editorialItemsTable.data, fingerprint.data),
      ))),
    ));
}

/** Inserts missing approved records only; existing editorial edits always win. */
export async function seedEditorialItems(): Promise<void> {
  await removeLegacyUnauthorizedSeededProspects();

  // Retire the exact unsupported event created by the old seed. Keep it as a
  // draft for editorial review rather than deleting it. The evidence guards
  // avoid touching a later, editor-verified event that happens to reuse the
  // historical slug.
  await db
    .update(editorialItemsTable)
    .set({
      status: "draft",
      version: sql`${editorialItemsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(editorialItemsTable.collection, "events"),
      eq(editorialItemsTable.slug, "foundation-summit-2021"),
      eq(editorialItemsTable.status, "published"),
      sql`${editorialItemsTable.data}->>'year' = '2021'`,
      sql`NOT (${editorialItemsTable.data} ? 'sourceUrl')`,
    ));
  await db.insert(editorialItemsTable).values(editorialSeedItems).onConflictDoNothing();
}