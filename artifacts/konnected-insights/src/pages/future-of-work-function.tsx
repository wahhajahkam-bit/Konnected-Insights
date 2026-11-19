import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useSearch } from 'wouter';
import { useFutureWorkFunction } from '@/hooks/use-future-work';
import { useEditorialItem } from '@/hooks/use-editorial';
import { CoverPhoto } from '@/components/cover-photo';
import { AnimatedSection } from '@/components/animated-section';
import { ArrowLeft, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from '@/components/metadata';
import { FutureWorkResearchLens } from '@/components/future-work-research-lens';
import { FutureWorkFunctionNavigation } from '@/components/future-work-function-navigation';
import { functionIntroduction } from '@/lib/future-work-introduction';

// Reuse the legacy view exactly as it was, but updated visually to match the new dark theme
function LegacyFunctionView({ data }: { data: any }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24">
      <Navbar />
      {data && <Metadata title={`${data.title} - Future of Work`} description={data?.data?.desc} />}
      <div className="dark bg-background text-foreground relative pt-32 pb-12 border-b border-border mb-12">
        <div className="noise-overlay" />
        <div className="container mx-auto px-4 md:px-8 max-w-4xl relative z-10">
          {data.data.img && (
            <div className="mb-8 aspect-[21/9] overflow-hidden border border-border bg-muted">
              <CoverPhoto src={data.data.img} alt={data.title} />
            </div>
          )}
          <Link href="/future-of-work" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-3 h-3" /> Back to Overview
          </Link>
          <h1 className="text-5xl md:text-7xl font-display mb-6">{data.title}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-display italic max-w-3xl leading-relaxed">
            {data?.data?.desc}
          </p>
        </div>
      </div>
      <div className="container mx-auto px-4 md:px-8 max-w-4xl space-y-12">
        {data.data.sections?.map((section: any, i: number) => (
          <AnimatedSection key={i} className="bg-card border border-border p-6 md:p-8">
            <h3 className="text-2xl font-display mb-4">{section.title}</h3>
            <p className="text-muted-foreground leading-relaxed mb-6 whitespace-pre-wrap">{section.text}</p>
            {section.status && (
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-sm border border-border/50">
                <Clock className="w-3 h-3" /> {section.status}
              </div>
            )}
          </AnimatedSection>
        ))}
      </div>
      <Footer />
    </div>
  );
}

function SectionHeading({ number, title, id }: { number: string, title: string, id: string }) {
  return (
    <div className="flex items-baseline gap-4 mb-8 border-b border-border pb-4 scroll-mt-44 focus:outline-none" id={id} tabIndex={-1}>
      <span className="text-sm font-medium text-primary font-mono">{number}</span>
      <h2 className="text-3xl md:text-4xl font-display">{title}</h2>
    </div>
  );
}

export default function FutureOfWorkFunctionPage() {
  const [, params] = useRoute('/future-of-work/:slug');
  const slug = params?.slug || '';
  const search = useSearch();
  const editorialView = new URLSearchParams(search).get('view') === 'editorial';
  const { data, isLoading, error, refetch } = useFutureWorkFunction(slug);
  const { data: legacyData, isLoading: legacyLoading } = useEditorialItem('future-work', slug);
  const [activeHorizon, setActiveHorizon] = useState<2030 | 2050 | 2100>(2030);
  const focusIntroduction = useRef(window.history.state?.focusFutureWorkIntroduction === true);

  useEffect(() => {
    if (data?.function.slug !== slug || editorialView || isLoading) return;
    const reachOverview = () => {
      if (window.location.hash !== '#overview') return;
      const introduction = document.getElementById('overview');
      introduction?.scrollIntoView({ block: 'start' });
      introduction?.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(reachOverview);
    window.addEventListener('hashchange', reachOverview);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', reachOverview);
    };
  }, [slug, data, editorialView, isLoading, legacyLoading]);

  useEffect(() => {
    if (focusIntroduction.current && data?.function.slug === slug) {
      const introduction = document.getElementById('function-introduction');
      if (introduction) {
        introduction.focus({ preventScroll: true });
        focusIntroduction.current = false;
        const { focusFutureWorkIntroduction: _, ...state } = window.history.state ?? {};
        window.history.replaceState(state, '', window.location.href);
      }
    }
  }, [slug, data, legacyLoading, isLoading]);

  // Sync horizon from URL hash or query param if present, and handle popstate for Back button
  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const horizonParam = params.get('horizon');
      if (horizonParam === '2030' || horizonParam === '2050' || horizonParam === '2100') {
        setActiveHorizon(Number(horizonParam) as 2030 | 2050 | 2100);
      } else {
        const hash = window.location.hash;
        if (hash === '#horizon-2030') setActiveHorizon(2030);
        else if (hash === '#horizon-2050') setActiveHorizon(2050);
        else if (hash === '#horizon-2100') setActiveHorizon(2100);
        else setActiveHorizon(2030);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [slug, search]);

  const handleHorizonChange = (year: 2030 | 2050 | 2100) => {
    setActiveHorizon(year);
    const url = new URL(window.location.href);
    url.searchParams.set('horizon', year.toString());
    url.hash = `horizon-${year}`;
    window.history.pushState({}, '', url.toString());
  };

  const focusSection = (event: React.MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('horizon', String(activeHorizon));
    url.hash = link.hash;
    window.history.pushState({}, '', url);
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  };

  if (editorialView && !legacyLoading) {
    const profile = legacyData ?? FALLBACK_DATA['future-work'].find(item => item.slug === slug);
    if (profile) return <LegacyFunctionView data={profile} />;
  }

  if ((!editorialView && isLoading) || ((!data || editorialView) && legacyLoading)) {
    return (
      <div className="min-h-[100dvh] pt-32 pb-16 px-4 md:px-8 bg-background text-foreground" role="status" aria-busy="true">
        <Navbar />
        <div className="container mx-auto max-w-4xl">
          <div className="animate-pulse space-y-8">
            <div className="h-4 w-24 bg-muted rounded mb-12"></div>
            <div className="h-16 bg-muted rounded w-1/2"></div>
            <div className="h-8 bg-muted rounded w-3/4"></div>
            <div className="mt-12 space-y-16">
              <div className="h-48 bg-muted rounded"></div>
              <div className="h-64 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    if (error && (error as any).status !== 404 && !legacyData) {
      return (
        <div className="min-h-[100dvh] pt-32 px-4 md:px-8 flex items-center justify-center bg-background text-foreground">
          <Navbar />
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-display mb-2">Unable to load data</h2>
            <p className="text-muted-foreground mb-8">An error occurred while loading this research.</p>
            <button onClick={() => refetch()} className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">Try Again</button>
          </div>
        </div>
      );
    }

    if (legacyData) {
      return <LegacyFunctionView data={legacyData} />;
    }

    const legacy = (FALLBACK_DATA as any)['future-work']?.find((f: any) => f.slug === slug);
    if (legacy) {
      return <LegacyFunctionView data={legacy} />;
    }

    return (
      <div className="min-h-[100dvh] pt-32 px-4 md:px-8 flex items-center justify-center bg-background text-foreground">
        <Navbar />
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-display mb-2">Function not found</h2>
          <p className="text-muted-foreground mb-8">This career profile may not exist or is currently unavailable.</p>
          <Link href="/future-of-work" className="text-primary hover:underline inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Future of Work
          </Link>
        </div>
      </div>
    );
  }

  const fn = data.function;

  const presentation = fn.presentation || {};
  const heroCoverUrl = presentation.heroCoverUrl;
  const heroAlt = presentation.heroAlt || fn.name;
  const heroCredit = presentation.heroCredit;
  const introduction = functionIntroduction(fn);
  const sectionIntros = presentation.sectionIntroductions || {};

  // Filter content by active horizon
  const horizonContent = data.content?.filter(c => c.horizon === activeHorizon) || [];
  const techLens = horizonContent.filter(c => c.lens === 'technology');
  const fieldLens = horizonContent.filter(c => c.lens === 'field');

  // Aggregate unique skills for the active horizon only
  const activeSkills = Array.from(new Set(horizonContent.flatMap(c => c.skills || [])));

  // Aggregate sources for the active horizon only
  const allSources = [
    ...horizonContent.flatMap(c => c.sources || []),
    ...(data.news || []).flatMap(n => n.sources || []),
    ...(data.programs || []).flatMap(p => p.sources || [])
  ];

  const activeSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Not verified';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not verified';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-24 lg:pb-0">
      <Navbar />
      <Metadata title={`${fn.name} - Future of Work`} description={introduction.join(' ')} />

      {/* Cinematic Dark Hero */}
      <div className="dark bg-background text-foreground relative pt-32 pb-24 md:pt-48 md:pb-32 overflow-hidden border-b border-border">
        {heroCoverUrl ? (
          <div className="absolute inset-0 z-0">
            <img src={heroCoverUrl} alt={heroAlt} className="w-full h-full object-cover" />
            <div className="absolute inset-0 cinematic-overlay"></div>
          </div>
        ) : (
          <>
            <div className="noise-overlay" />
            <div className="absolute inset-0 cinematic-vignette"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl aspect-square glow-orb-primary opacity-20"></div>
          </>
        )}

        <div className="container relative z-10 px-4 md:px-8 mx-auto max-w-5xl">
          <Link href={`/future-of-work?horizon=${activeHorizon}`} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-12">
            <ArrowLeft className="w-3 h-3" /> Business Functions
          </Link>

          <AnimatedSection>
            <h1 id="function-introduction" tabIndex={-1} className="text-5xl md:text-7xl lg:text-8xl font-display font-medium mb-8 tracking-tight max-w-4xl text-balance focus:outline-none">
              {fn.name}
            </h1>
            <div id="overview" tabIndex={-1} aria-label={`${fn.name} introduction`} className="max-w-3xl space-y-5 scroll-mt-32 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {introduction.map((paragraph, index) => (
                <p key={paragraph} className={`${index === 0 ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'} text-muted-foreground leading-relaxed whitespace-pre-wrap break-words`}>
                  {paragraph}
                </p>
              ))}
            </div>
          </AnimatedSection>

          {heroCredit && (
            <p className="mt-8 text-[10px] text-muted-foreground uppercase tracking-wider">{heroCredit}</p>
          )}
        </div>
      </div>

      <div className="flex-grow container mx-auto px-4 md:px-8 py-16 md:py-24 max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-16 items-start">

        {/* Main Content Area */}
        <main key={slug} className="space-y-24 order-2 lg:order-1">

          {/* 01. Recent News */}
          <AnimatedSection>
            <SectionHeading number="01" title="Recent News" id="news" />
            {sectionIntros.news && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{sectionIntros.news}</p>
            )}

            {data.news && data.news.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-6">
                {data.news.map(item => (
                  <article key={item.id} className="p-6 border border-border bg-card flex flex-col h-full hover:border-border/80 transition-colors">
                    <h4 className="text-lg font-display mb-3 pr-4">{item.title}</h4>
                    {item.stale && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-4 flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" /> Verification overdue.
                      </p>
                    )}
                    <details className="text-sm text-muted-foreground mb-6 flex-grow group/news">
                      <summary className="font-medium hover:text-foreground cursor-pointer select-none outline-none">Read summary</summary>
                      <div className="pt-3 mt-2 border-t border-border/20 whitespace-pre-wrap">{item.summary}</div>
                    </details>

                    {item.sources && item.sources.length > 0 && (
                      <div className="mt-auto border-t border-border/50 pt-4">
                        {item.sources.map((src, i) => (
                          <div key={i} className="text-xs mb-2 last:mb-0">
                            <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors font-medium">
                              {src.publisher} <ExternalLink className="w-3 h-3" />
                            </a>
                            <span className="text-muted-foreground ml-2">{formatDate(src.publishedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest border-t border-border/50 pt-4 mt-auto">
                      Updated: {formatDate(item.updatedAt)} · Verified: {formatDate(item.lastVerifiedAt)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border bg-card/30 text-center">
                <p className="text-muted-foreground text-sm">No verified recent news available.</p>
              </div>
            )}
          </AnimatedSection>

          {/* 02. Recommended Programs */}
          <AnimatedSection>
            <SectionHeading number="02" title="Recommended Programs" id="programs" />
            {sectionIntros.programs && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{sectionIntros.programs}</p>
            )}

            {data.programs && data.programs.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-6">
                {data.programs.map(program => (
                  <article key={program.id} className="p-6 border border-border bg-card flex flex-col h-full group">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{program.organization}</p>
                    <h4 className="text-lg font-display mb-4">
                      <a href={program.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-start gap-2">
                        {program.programName}
                        <ExternalLink className="w-4 h-4 shrink-0 mt-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </h4>
                    {program.stale && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-4 flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" /> Verification overdue.
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mb-6 flex-grow">{program.description}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest border-t border-border/50 pt-4 mt-auto">
                      Updated: {formatDate(program.updatedAt)} · Verified: {formatDate(program.lastVerifiedAt)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border bg-card/30 text-center">
                <p className="text-muted-foreground text-sm">No recommended programs verified yet.</p>
              </div>
            )}
          </AnimatedSection>

          {/* 03. Outlook (Horizons) */}
          <AnimatedSection>
            <SectionHeading number="03" title="Outlook" id="outlook" />
            {sectionIntros.outlook && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{sectionIntros.outlook}</p>
            )}

            {/* Horizon Selector */}
            <div className="flex flex-wrap gap-2 mb-10 p-1 bg-card border border-border inline-flex rounded-sm">
              {[2030, 2050, 2100].map((year) => (
                <button
                  key={year}
                  onClick={() => handleHorizonChange(year as 2030 | 2050 | 2100)}
                  className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                    activeHorizon === year
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  aria-current={activeHorizon === year ? 'page' : undefined}
                >
                  {year}
                </button>
              ))}
            </div>

            {activeHorizon === 2100 && (
              <div className="mb-10 p-4 border border-amber-200 bg-amber-50 text-amber-950 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-1">Speculative Scenario</p>
                  <p>Projections for 2100 are highly speculative and represent exploratory scenarios rather than data-backed forecasts. Use for strategic imagination.</p>
                </div>
              </div>
            )}

            <div className="space-y-16">
              <FutureWorkResearchLens
                heading="Technology Lens"
                items={techLens}
                emptyMessage={`No verified technology research available for ${activeHorizon} yet.`}
                accent="primary"
                formatDate={formatDate}
              />

              <FutureWorkResearchLens
                heading="Structural & Field Lens"
                items={fieldLens}
                emptyMessage={`No verified structural research available for ${activeHorizon} yet.`}
                accent="accent"
                formatDate={formatDate}
              />
            </div>
          </AnimatedSection>

          {/* 04. Skills & Implications (Horizon-specific) */}
          <AnimatedSection>
            <SectionHeading number="04" title="Implications" id="implications" />
            {sectionIntros.skills && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{sectionIntros.skills}</p>
            )}

            {activeSkills.length > 0 ? (
              <div className="p-8 bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-6">Critical capabilities implied by {activeHorizon} verified research:</p>
                <ul className="grid sm:grid-cols-2 gap-4">
                  {activeSkills.map((skill, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{skill}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border bg-card/30 text-center">
                <p className="text-muted-foreground text-sm">No specific skill implications derived for {activeHorizon} yet.</p>
              </div>
            )}
          </AnimatedSection>

          {/* 05. Research Sources */}
          <AnimatedSection>
            <SectionHeading number="05" title="Sources" id="sources" />
            {sectionIntros.sources && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{sectionIntros.sources}</p>
            )}

            {activeSources.length > 0 ? (
              <div className="p-6 md:p-8 bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-6">Evidence referenced in the selected {activeHorizon} outlook, recent news, and recommended programs.</p>
                <ul className="space-y-4">
                  {activeSources.map((source, i) => (
                    <li key={`${source.url}-${i}`} className="text-sm border-b border-border/30 pb-4 last:border-0 last:pb-0 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                      <span className="text-muted-foreground min-w-[120px] font-mono text-xs">{formatDate(source.publishedAt)}</span>
                      <div>
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary transition-colors inline-flex items-baseline gap-1">
                          {source.title} <ExternalLink className="w-3 h-3 self-center" />
                        </a>
                        <span className="text-muted-foreground block text-xs mt-1">{source.publisher}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border bg-card/30 text-center">
                <p className="text-muted-foreground text-sm">No sources available for the selected horizon.</p>
              </div>
            )}
          </AnimatedSection>

        </main>

        {/* Local Navigation Sidebar (Desktop sticky) */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
          <div className="p-6 border border-border bg-card">
            <FutureWorkFunctionNavigation slug={slug} name={fn.name} horizon={activeHorizon} />
            <h4 className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-6">Contents</h4>
            <nav className="grid grid-cols-2 gap-4 lg:block lg:space-y-4 [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-primary" aria-label="Contents" onClick={focusSection}>
              <a href="#news" className="block text-sm hover:text-primary transition-colors flex items-center gap-3 group">
                <span className="text-muted-foreground font-mono text-xs group-hover:text-primary/70">01</span>
                 Recent News
              </a>
              <a href="#programs" className="block text-sm hover:text-primary transition-colors flex items-center gap-3 group">
                <span className="text-muted-foreground font-mono text-xs group-hover:text-primary/70">02</span>
                 Recommended Programs
              </a>
              <a href="#outlook" className="block text-sm hover:text-primary transition-colors flex items-center gap-3 group">
                <span className="text-muted-foreground font-mono text-xs group-hover:text-primary/70">03</span>
                 Outlook
              </a>
              <a href="#implications" className="block text-sm hover:text-primary transition-colors flex items-center gap-3 group">
                <span className="text-muted-foreground font-mono text-xs group-hover:text-primary/70">04</span>
                 Implications
              </a>
              <a href="#sources" className="block text-sm hover:text-primary transition-colors flex items-center gap-3 group">
                <span className="text-muted-foreground font-mono text-xs group-hover:text-primary/70">05</span>
                Sources
              </a>
            </nav>

            <div className="mt-8 pt-8 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Selected Horizon</p>
              <div className="text-2xl font-display text-primary">{activeHorizon}</div>
            </div>
          </div>
        </aside>

        {/* Mobile local nav (bottom sticky) */}
        <div
          onClick={focusSection}
          className="lg:hidden fixed bottom-0 left-0 w-full bg-card/95 backdrop-blur border-t border-border px-4 pt-4 z-40 flex justify-between items-center gap-4 shadow-lg shadow-black/20"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          data-mobile-function-nav
          data-testid="mobile-function-nav"
        >
          <select
            aria-label="Select horizon"
            className="bg-card border border-border p-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary cursor-pointer text-foreground"
            value={activeHorizon}
            onChange={(e) => handleHorizonChange(Number(e.target.value) as 2030 | 2050 | 2100)}
          >
            <option value={2030}>Horizon 2030</option>
            <option value={2050}>Horizon 2050</option>
            <option value={2100}>Horizon 2100</option>
          </select>
          <a href="#outlook" className="text-xs uppercase tracking-widest font-medium text-muted-foreground hover:text-foreground">Top ↑</a>
        </div>

      </div>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  );
}