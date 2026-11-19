import React from 'react';
import { CoverPhoto } from '@/components/cover-photo';
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
import { ContributorPortrait } from '@/components/contributor-portrait';
import { getContributorContributions, resolveContributorLinkedIn, resolveContributorPortrait } from '@/lib/contributor-content';

export default function ContributorDetail() {
  const [match, params] = useRoute('/contributors/:slug');
  const slug = params?.slug || '';

  const { data: apiItem, isLoading, isError, error } = useEditorialItem('contributors', slug);

  const contributor = React.useMemo(() => {
    const fallback = FALLBACK_DATA.contributors.find(c => c.slug === slug);
    if (apiItem) {
      const isCoreTeam = apiItem.data.group === 'Core Team';
      return {
        ...apiItem.data,
        name: apiItem.data.name || apiItem.title,
        group: isCoreTeam ? 'Core Team' : 'Contributors',
        role: apiItem.data.role,
      };
    }
    const isNotFound = isError && typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
    return !isNotFound && fallback ? { ...fallback.data, name: fallback.title } : null;
  }, [apiItem, error, isError, slug]);

  if (!match) {
    return <NotFound />;
  }

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!contributor) {
    return <NotFound />;
  }

  const contributions = getContributorContributions(contributor.contributions, contributor.articles);
  const linkedinUrl = resolveContributorLinkedIn({
    slug,
    name: contributor.name,
    linkedinUrl: contributor.linkedinUrl,
  });
  const portraitImage = resolveContributorPortrait({
    slug,
    image: contributor.image,
    isPlaceholder: contributor.isPlaceholder,
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title={`${contributor.name} - Contributors`} />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow pt-32 pb-32">
        <CoverPhoto src={contributor.coverImage} generated={contributor.imageProvenance === 'ai-generated-representative-artwork'} omitWhenUnavailable className="mx-auto mb-12 aspect-[21/9] w-full max-w-6xl" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] glow-orb-accent opacity-10 pointer-events-none mix-blend-multiply blur-[100px]" />

        <section className="container px-6 md:px-12 mx-auto max-w-6xl relative z-10">
           <AnimatedSection>
             <Link href="/contributors" className="inline-flex items-center gap-3 text-xs uppercase tracking-widest font-semibold text-primary hover:text-foreground transition-colors mb-16 group">
               <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Contributors
             </Link>
           </AnimatedSection>

           <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 items-start">

              <AnimatedSection delay={0.1} className="w-full lg:w-5/12 shrink-0">
                <ContributorPortrait
                  name={contributor.name}
                  image={portraitImage}
                  isPlaceholder={contributor.isPlaceholder}
                  className="shadow-[0_20px_40px_rgba(70,55,95,0.08)]"
                />
              </AnimatedSection>

              <AnimatedSection delay={0.2} className="flex-grow pt-4">
                 <div className="flex items-center gap-4 mb-8">
                   <span className="h-[1px] w-12 bg-primary"></span>
                   <div className="text-primary font-semibold tracking-[0.2em] uppercase text-xs">{contributor.role}</div>
                 </div>
                 <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-display leading-[0.9] mb-16 text-foreground drop-shadow-sm">{contributor.name}</h1>
                  {linkedinUrl ? (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-12 inline-flex items-center gap-3 text-xs uppercase tracking-widest font-medium text-primary hover:text-foreground transition-colors"
                    >
                      View LinkedIn profile <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="mb-12 text-xs uppercase tracking-widest font-medium text-muted-foreground">
                      No LinkedIn link
                    </p>
                  )}

                 <div className="pt-16 border-t border-border">
                    <h2 className="text-xs font-sans uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-10 flex items-center gap-4">
                       <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Contributions
                    </h2>

                    {contributions.length > 0 ? (
                      <div className="grid grid-cols-1 gap-6">
                        {contributions.map((contribution, i) => (
                          <div key={i} className="group border border-border p-10 bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-300 backdrop-blur-sm shadow-sm hover:shadow-md">
                            <div className="text-primary font-semibold tracking-[0.2em] uppercase text-[10px] mb-6 flex items-center gap-2">
                              {contribution.category || 'Contribution'}
                            </div>
                            <h3 className="text-3xl font-display mb-6 leading-tight text-foreground group-hover:text-primary transition-colors">{contribution.title}</h3>
                            {contribution.description && (
                              <p className="text-muted-foreground mb-10 text-lg leading-relaxed font-light">{contribution.description}</p>
                            )}
                            {contribution.url && <a href={contribution.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 text-foreground text-xs uppercase tracking-widest font-medium hover:text-primary transition-colors">
                              View contribution <ExternalLink className="h-4 w-4" />
                            </a>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-16 border border-border bg-card/50 flex flex-col items-start justify-center backdrop-blur-sm">
                        <p className="text-muted-foreground text-xl leading-relaxed font-light max-w-xl">
                          {contributor.isNamedProspect
                            ? "Profile links and published work will appear when supplied."
                            : "Future insights and dispatches from this contributor are currently in development."}
                        </p>
                      </div>
                    )}
                 </div>
              </AnimatedSection>
           </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
