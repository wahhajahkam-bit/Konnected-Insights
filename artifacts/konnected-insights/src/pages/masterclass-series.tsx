import React from 'react';
import { CoverPhoto } from '@/components/cover-photo';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { Link } from 'wouter';
import { PlayCircle } from 'lucide-react';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';

export default function MasterclassSeries() {
  const { data: apiItems, isLoading } = useEditorialItems('masterclasses');

  const masterclasses = React.useMemo(() => {
    if (apiItems) {
      return apiItems.map(item => ({
        slug: item.slug,
        title: item.title,
        ...item.data
      }));
    }
    return FALLBACK_DATA.masterclasses.map(i => ({ slug: i.slug, title: i.title, ...i.data }));
  }, [apiItems]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Masterclass Series" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow relative overflow-hidden">
        {/* Luminous Spatial Depth */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-primary opacity-10 pointer-events-none mix-blend-multiply blur-[100px]" />

        <PageHeader
          category="Masterclass Series"
          title="The 5-to-10 year horizon."
          subtitle="Tactical foresight from those actively shaping the transition."
          dark={false}
          align="left"
        />

        <section className="py-24 relative z-10 bg-background border-t border-border">
          <div className="container px-6 md:px-12 mx-auto max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 xl:gap-12">
              {masterclasses.map((mc: any, i: number) => (
                <Link key={mc.slug} href={`/masterclass-series/${mc.slug}`} className="block group outline-none focus-visible:ring-2 ring-primary ring-offset-background">
                  <AnimatedSection delay={i * 0.1} className="h-full flex flex-col bg-card/60 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-500 hover:shadow-[0_4px_30px_rgba(104,87,153,0.1)]">
                    <div className="relative overflow-hidden">
                      <CoverPhoto src={mc.image} alt={mc.title} fit="contain" generated={mc.imageProvenance === 'ai-generated-representative-artwork'} className="h-64 md:h-72" />
                    </div>

                    <div className="p-8 md:p-10 flex flex-col flex-grow">
                      <div className="flex items-center gap-3 mb-6 text-primary tracking-[0.2em] uppercase text-[10px] font-semibold">
                         <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Masterclass
                      </div>

                      <h3 className="text-2xl md:text-3xl font-display leading-[1.1] text-card-foreground mb-6 group-hover:text-primary transition-colors flex-grow">
                        {mc.title}
                      </h3>

                      {mc.author?.name && <div className="flex items-center gap-4 mt-auto pt-6 border-t border-border/50">
                        {mc.author.image ? (
                          <img src={mc.author.image} alt={mc.author.name} className="h-10 w-10 object-cover transition-all duration-500" />
                        ) : (
                          <div className="h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground text-sm font-display italic">
                            {mc.author.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-1 font-medium">Host</span>
                          <span className="text-sm font-medium text-foreground">{mc.author.name}</span>
                        </div>
                      </div>}
                    </div>
                  </AnimatedSection>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
