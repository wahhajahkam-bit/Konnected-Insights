import React from 'react';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { ContributorCard } from '@/components/contributor-card';
import { AnimatedSection } from '@/components/animated-section';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { resolveContributorLinkedIn, resolveContributorPortrait } from '@/lib/contributor-content';

export default function Contributors() {
  const { data: apiItems, isLoading } = useEditorialItems('contributors');

  const contributors = React.useMemo(() => {
    if (apiItems) {
      return apiItems.map(item => ({
        slug: item.slug,
        ...item.data,
        name: item.data.name || item.title,
      }));
    }
    return FALLBACK_DATA.contributors.map(i => ({ ...i.data, slug: i.slug, name: i.title }));
  }, [apiItems]);

  const coreTeam = contributors.filter(c => c.group === 'Core Team');
  const networkContributors = contributors.filter(c => c.group !== 'Core Team');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Contributors" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative">
          <div className="absolute bottom-0 right-[10%] w-[60%] h-[60%] glow-orb-accent blur-[120px] rounded-full mix-blend-multiply opacity-10 pointer-events-none" />
          <PageHeader
            category="Contributors"
            title="The minds building what comes next."
            subtitle="An expanding network of operators, investors, and thinkers."
            align="left"
            dark={false}
          />
        </div>

        <section className="py-24 bg-background relative z-10 border-t border-border">
          <div className="absolute top-[20%] left-[-10%] w-[50%] h-[50%] glow-orb-primary blur-[120px] rounded-full mix-blend-multiply opacity-10 pointer-events-none" />

          <div className="container px-6 md:px-12 mx-auto space-y-32 max-w-7xl relative z-10">

            {[
              { title: "Core Team", desc: "The foundation of Könnected Insights.", data: coreTeam },
              { title: "Contributors", desc: "The voices publishing research, foresight, and original perspectives with us.", data: networkContributors },
            ].map((group, sectionIndex) => (
              <div key={group.title}>
                <AnimatedSection className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
                  <div>
                    <h2 className="text-4xl md:text-5xl font-display mb-4 text-foreground">{group.title}</h2>
                    {group.desc && <p className="text-muted-foreground text-lg font-light">{group.desc}</p>}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase font-semibold text-primary">
                    {String(group.data.length).padStart(2, '0')} Voices
                  </div>
                </AnimatedSection>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
                  {group.data.map((contributor, i) => (
                    <ContributorCard
                      coverImage={contributor.coverImage}
                      imageProvenance={contributor.imageProvenance}
                      key={contributor.name}
                      name={contributor.name}
                      role={contributor.role}
                      cutoutImage={resolveContributorPortrait(contributor)}
                      isPlaceholder={contributor.isPlaceholder}
                      linkedinUrl={resolveContributorLinkedIn(contributor)}
                      href={`/contributors/${contributor.slug}`}
                      delay={i * 0.05}
                    />
                  ))}
                </div>
              </div>
            ))}

          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
