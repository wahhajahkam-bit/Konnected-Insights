import React from 'react';
import { CommunityCover } from '@/components/community-cover';
import { OptionalExternalLink } from '@/components/optional-external-link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { ExternalLink } from 'lucide-react';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';

export default function Communities() {
  const { data: apiItems, isLoading } = useEditorialItems('communities');

  const communities = React.useMemo(() => {
    if (apiItems) {
      return apiItems.map(item => ({
        ...item.data,
        slug: item.slug,
        name: item.data.name || item.title,
      }));
    }
    return FALLBACK_DATA.communities.map(i => ({ ...i.data, slug: i.slug, name: i.title }));
  }, [apiItems]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Communities" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative">
          <div className="absolute top-0 right-0 w-2/3 h-full glow-orb-accent opacity-10 pointer-events-none mix-blend-multiply blur-[100px]" />
          <PageHeader
            category="Communities"
            title="The power of together."
            subtitle="Active groups driving specific transformations. Where our ecosystem collaborates, debates, and builds."
            align="left"
            dark={false}
          />
        </div>

        <AnimatedSection direction="none" className="relative h-[50vh] min-h-[400px] overflow-hidden border-y border-border">
          <img
            src="/editorial/sourced/conference-networking.jpg"
            alt="Professionals connecting during a business gathering"
            className="absolute inset-0 w-full h-full object-cover transition-all duration-[2000ms]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
          <div className="absolute inset-0 cinematic-vignette opacity-20" />

          <div className="relative z-10 container mx-auto px-6 md:px-12 h-full flex items-end pb-16 md:pb-24">
            <p className="max-w-lg text-2xl md:text-4xl font-display text-foreground leading-tight drop-shadow-sm">
              Where our ecosystem collaborates, debates, and builds.
            </p>
          </div>
        </AnimatedSection>

        <section className="py-24 relative bg-background border-t border-border">
          <div className="container px-6 md:px-12 mx-auto max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {communities.map((community: any, i: number) => (
                <OptionalExternalLink
                  key={community.name}
                  href={community.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block outline-none focus-visible:ring-2 ring-primary ring-offset-background h-full"
                >
                  <AnimatedSection delay={i * 0.1} className="flex flex-col h-full p-10 md:p-12 border border-border bg-card/60 backdrop-blur-sm transition-all duration-500 hover:bg-card hover:border-primary/50 hover:shadow-[0_4px_30px_rgba(104,87,153,0.1)] relative overflow-hidden">
                    <CommunityCover slug={community.slug} name={community.name} image={community.image} imageProvenance={community.imageProvenance} className="mb-6 aspect-video" />
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <div className="flex justify-between items-start mb-8 relative z-10">
                      <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center bg-muted text-foreground group-hover:bg-primary group-hover:border-primary group-hover:text-primary-foreground transition-colors duration-300">
                        <span className="font-display text-xl italic">{community.name.charAt(0)}</span>
                      </div>
                      {community.url && <ExternalLink className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary transition-colors" />}
                    </div>

                    <div className="relative z-10 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-3xl font-display mb-4 text-foreground group-hover:text-primary transition-colors">
                          {community.name}
                        </h3>
                        <p className="text-muted-foreground leading-relaxed text-base font-light">
                          {community.desc}
                        </p>
                      </div>
                    </div>
                  </AnimatedSection>
                </OptionalExternalLink>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
