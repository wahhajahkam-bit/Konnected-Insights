import React from 'react';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { Link } from 'wouter';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';

export default function BiggerPicture() {
  const { data: apiItems } = useEditorialItems('masterclasses');

  // Just grab a couple of featured ones to cross-link
  const featured = React.useMemo(() => {
    if (apiItems) return apiItems.slice(0, 2);
    return FALLBACK_DATA.masterclasses.slice(0, 2);
  }, [apiItems]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Bigger Picture" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <PageHeader
          category="Bigger Picture"
          title="The future of work is the future of humanity."
          subtitle="Why we must start architecting the transition today."
          align="left"
          dark
          image="/editorial/sourced/dubai-night.jpg"
        />

        <section className="py-24 md:py-32 relative bg-background border-t border-border">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] glow-orb-accent opacity-10 pointer-events-none blur-[120px]" />

          <div className="container px-6 md:px-12 mx-auto">
            <div className="max-w-4xl mx-auto">

              <div className="prose prose-xl md:prose-2xl mx-auto font-light leading-relaxed text-muted-foreground">
                <AnimatedSection>
                  <p className="text-3xl md:text-5xl text-foreground font-display leading-[1.15] mb-16 tracking-tight text-balance drop-shadow-sm">
                    We stand at the precipice of an exponential era. The paradigms that built the last century of enterprise are no longer sufficient to navigate the next.
                  </p>
                </AnimatedSection>

                <AnimatedSection delay={0.1} className="space-y-12">
                  <p className="font-sans text-xl md:text-2xl leading-relaxed">
                    Every profession is undergoing a fundamental rewrite. Algorithmic intelligence, decentralized networks, and unprecedented connectivity are dismantling traditional hierarchies and rebuilding them as agile, responsive ecosystems. But technology is only the accelerant. <strong className="font-medium text-primary font-display italic text-3xl">The true transformation is profoundly human.</strong>
                  </p>

                  <p className="font-sans text-xl md:text-2xl leading-relaxed">
                    How we govern, how we lead, how we allocate capital, and how we measure value are all shifting. The organizations that will define the next decade are those that recognize this not as a threat to be managed, but as a canvas to be architected.
                  </p>

                  <div className="my-24 relative p-12 md:p-16 bg-[#080812] text-[#F4F3EF] shadow-[0_20px_60px_rgba(8,8,18,0.15)] overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1/2 h-[2px] bg-gradient-to-r from-primary to-transparent" />
                    <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-primary/20 blur-[80px] pointer-events-none opacity-50 group-hover:opacity-80 transition-opacity duration-1000" />

                    <p className="text-3xl md:text-5xl font-display font-normal leading-[1.1] text-white m-0 mb-12 relative z-10 drop-shadow-md">
                      "Our mission is to orchestrate collisions between the minds building the future. This is a catalyst for our next exponential leap."
                    </p>
                    <div className="flex items-center gap-6 relative z-10">
                      <img src="/original/varun-malik.jpg" alt="Varun Malik" className="w-16 h-16 object-cover border border-white/20 shadow-lg" />
                      <div>
                        <div className="text-sm tracking-widest uppercase font-medium text-white mb-1">Varun Malik</div>
                        <div className="text-[10px] text-white/50 uppercase tracking-[0.2em]">Advisor</div>
                      </div>
                    </div>
                    {/* Background abstract graphic */}
                    <div className="absolute inset-0 z-0 opacity-20 mix-blend-screen pointer-events-none">
                       <img src="/editorial/generated/future-people.jpg" alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 cinematic-vignette opacity-80 pointer-events-none" />
                  </div>

                  <p className="font-sans text-xl md:text-2xl leading-relaxed">
                    Könnected Insights exists to document, debate, and direct this transition. We draw upon the brightest minds across the Middle East and the global frontier to cut through the noise and surface the signals that matter.
                  </p>

                  <p className="font-sans text-xl md:text-2xl leading-relaxed">
                    This is not about predicting the future. It is about equipping operators, investors, and leaders with the intellectual framework required to build it.
                  </p>
                </AnimatedSection>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
