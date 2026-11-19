import React from 'react';
import { CoverPhoto } from '@/components/cover-photo';
import { OptionalExternalLink } from '@/components/optional-external-link';
import { useRoute, Link } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import NotFound from './not-found';
import { useEditorialItem } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';

export default function MasterclassDetail() {
  const [match, params] = useRoute('/masterclass-series/:slug');
  const slug = params?.slug || '';

  const { data: apiItem, isLoading } = useEditorialItem('masterclasses', slug);

  const data = React.useMemo(() => {
    if (apiItem) return { title: apiItem.title, ...apiItem.data };
    const fallback = FALLBACK_DATA.masterclasses.find(m => m.slug === slug);
    return fallback ? { title: fallback.title, ...fallback.data } : null;
  }, [apiItem, slug]);

  if (!match) {
    return <NotFound />;
  }

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!data) {
    const title = slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
        <Metadata title={`${title} - Masterclass Series`} />
        <div className="noise-overlay" />
        <Navbar />

        <main className="flex-grow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-primary opacity-10 pointer-events-none mix-blend-multiply blur-[100px]" />
          <PageHeader category="Masterclass" title={title} align="left" dark={false} />
          <section className="py-24 bg-background relative z-10 border-t border-border">
            <div className="container px-6 md:px-12 mx-auto max-w-5xl">
              <AnimatedSection>
                <Link href="/masterclass-series" className="inline-flex items-center gap-3 text-xs tracking-widest uppercase font-semibold text-primary hover:text-foreground transition-colors mb-16">
                  <ArrowLeft className="h-4 w-4" /> Back to Masterclass Series
                </Link>
              </AnimatedSection>
              <AnimatedSection delay={0.2}>
                <div className="p-16 md:p-24 border border-border bg-card/60 flex flex-col items-center justify-center text-center backdrop-blur-sm shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse mb-8" />
                  <h3 className="text-3xl font-display text-card-foreground mb-6">Under Development</h3>
                  <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed font-light">
                    This masterclass is currently being curated. We are working with industry operators to shape the exact curriculum and 5-10 year foresight models.
                  </p>
                </div>
              </AnimatedSection>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title={`${data.title} - Masterclass`} />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-accent opacity-10 pointer-events-none mix-blend-multiply blur-[120px]" />
          <PageHeader
            category="Masterclass Series"
            title={data.title}
            align="left"
            dark={false}
          />
        </div>

        <section className="py-24 bg-background relative z-10 border-t border-border">
          <div className="container px-6 md:px-12 mx-auto max-w-5xl">
            <AnimatedSection>
              <Link href="/masterclass-series" className="inline-flex items-center gap-3 text-xs uppercase tracking-widest font-semibold text-primary hover:text-foreground transition-colors mb-16 group">
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Masterclass Series
              </Link>
            </AnimatedSection>

            <div className="space-y-24">

              {/* Image-led link to the original visual essay */}
              <AnimatedSection delay={0.1}>
                 <OptionalExternalLink
                   href={data.url}
                   target="_blank"
                   rel="noopener noreferrer"
                    className="relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                   aria-label={`Open ${data.title} on LinkedIn`}
                 >
                     <CoverPhoto src={data.image} alt={data.title} fit="contain" generated={data.imageProvenance === 'ai-generated-representative-artwork'} className="h-72 md:h-96" />
                 </OptionalExternalLink>
              </AnimatedSection>

              <AnimatedSection delay={0.2} className="grid grid-cols-1 md:grid-cols-12 gap-12 pt-8">
                <div className="md:col-span-4">
                  <h3 className="text-xs font-semibold tracking-widest uppercase text-primary mb-4 flex items-center gap-4">
                     <span className="h-[1px] w-8 bg-primary"></span> Topic Horizon
                  </h3>
                </div>
                <div className="md:col-span-8">
                  <p className="text-xl md:text-2xl text-foreground leading-relaxed font-sans font-light">
                    {data.framing}
                  </p>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={0.3} className="grid grid-cols-1 md:grid-cols-12 gap-12 pt-8">
                 <div className="md:col-span-4">
                  <h3 className="text-xs font-semibold tracking-widest uppercase text-primary mb-4 flex items-center gap-4">
                     <span className="h-[1px] w-8 bg-primary"></span> Implications
                  </h3>
                </div>
                <div className="md:col-span-8">
                  <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-sans font-light">
                    {data.implications}
                  </p>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={0.4} className="pt-24 mt-16 border-t border-border">
                <div className="bg-card/50 p-12 md:p-16 border border-border backdrop-blur-sm shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground mb-3 uppercase">Publication Source</div>
                      {(data.authorName || data.author?.name) && <div className="text-lg font-sans font-medium text-foreground">Authored by {data.authorName || data.author?.name}</div>}
                    </div>
                    {data.url && <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground font-medium hover:bg-[#080812] hover:text-white transition-colors text-sm uppercase tracking-widest shadow-[0_4px_14px_rgba(104,87,153,0.3)]"
                    >
                      View full post on LinkedIn <ExternalLink className="h-4 w-4" />
                    </a>}
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
