import React from 'react';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { ArticleCard } from '@/components/article-card';
import { AnimatedSection } from '@/components/animated-section';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';

export default function Newsletters() {
  const { data: apiItems, isLoading } = useEditorialItems('newsletters');

  const dispatches = React.useMemo(() => {
    if (apiItems) {
      return apiItems.map(item => ({
        slug: item.slug,
        title: item.title,
        ...item.data
      }));
    }
    return FALLBACK_DATA.newsletters.map(i => ({ slug: i.slug, title: i.title, ...i.data }));
  }, [apiItems]);

  const CATEGORIES = ["All", ...Array.from(new Set(dispatches.map((dispatch: any) => dispatch.category).filter(Boolean)))];

  const [activeCategory, setActiveCategory] = React.useState("All");

  const visibleDispatches = activeCategory === "All"
    ? dispatches
    : dispatches.filter((dispatch: any) => dispatch.category === activeCategory);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Newsletters" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] glow-orb-accent blur-[120px] rounded-full mix-blend-multiply opacity-20 pointer-events-none" />
          <PageHeader
            category="Insights / Newsletters"
            title="Signals from the frontier."
            subtitle="Curated insights and essential dispatches from our network."
            align="left"
            dark={false}
          />
        </div>

        {/* Filters & Grid */}
        <section className="py-24 relative overflow-hidden bg-background">
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] glow-orb-primary blur-[120px] rounded-full mix-blend-multiply opacity-10 pointer-events-none" />

          <div className="container px-6 md:px-12 mx-auto max-w-7xl relative z-10">
            <AnimatedSection className="mb-12 flex flex-wrap gap-2" direction="none">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category as string)}
                  aria-pressed={activeCategory === category}
                  className={`px-6 py-2.5 text-[10px] font-medium uppercase tracking-[0.2em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    activeCategory === category
                      ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(104,87,153,0.3)] border-transparent"
                      : "bg-transparent text-muted-foreground border border-border hover:text-foreground hover:border-primary/50 hover:bg-card/50"
                  }`}
                >
                  {category}
                </button>
              ))}
            </AnimatedSection>

            <div key={activeCategory} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
              {visibleDispatches.map((dispatch, i) => (
                <ArticleCard
                  key={dispatch.slug}
                  title={dispatch.title}
                  category={dispatch.category}
                  excerpt={dispatch.excerpt}
                  image={dispatch.image}
                  imageProvenance={dispatch.imageProvenance}
                  author={dispatch.author}
                  href={dispatch.url}
                  isExternal
                  delay={i * 0.1}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
