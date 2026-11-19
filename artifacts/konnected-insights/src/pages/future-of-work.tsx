import { useState, useMemo } from 'react';
import { Link, useSearch } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { useFutureWorkOverview } from '@/hooks/use-future-work';
import { Search, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FunctionCardCover } from '@/components/function-card-cover';

export default function FutureOfWork() {
  const { data, isLoading, error } = useFutureWorkOverview();
  const search = useSearch();
  const selectedHorizon = new URLSearchParams(search).get('horizon');
  const horizonQuery = selectedHorizon && ['2030', '2050', '2100'].includes(selectedHorizon)
    ? `?horizon=${selectedHorizon}` : '';

  const [searchQuery, setSearchQuery] = useState('');

  const functions = useMemo(() => {
    return [...(data?.functions ?? [])]
      .filter(f => f.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data?.functions]);

  const filteredFunctions = useMemo(() => {
    if (!searchQuery.trim()) return functions;
    const query = searchQuery.trim().toLowerCase();
    return functions.filter(f =>
      f.name.toLowerCase().includes(query) ||
      f.description.toLowerCase().includes(query)
    );
  }, [functions, searchQuery]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Metadata title="Future of Work" description="Evidence-conscious editorial guide exploring the future of business functions." />
      <Navbar />

      {/* Dark Cinematic Hero */}
      <div className="dark bg-background text-foreground relative pt-32 pb-24 md:pt-48 md:pb-32 overflow-hidden border-b border-border">
        <div className="noise-overlay" />
        <div className="absolute inset-0 glow-orb-primary opacity-30"></div>
        <div className="container relative z-10 px-4 md:px-8 mx-auto max-w-6xl">
          <AnimatedSection>
            <div className="max-w-3xl">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-medium mb-6 tracking-tight">
                Future of Work
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-10 max-w-2xl">
                Start with your business function. Explore evidence-backed outlooks for 2030, structural forecasts for 2050, and speculative scenarios for 2100.
              </p>

              <div className="relative max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  aria-label="Search business functions"
                  placeholder="Search functions (e.g. Marketing, Engineering...)"
                  className="w-full pl-12 h-14 bg-card/50 border-border text-lg rounded-none focus-visible:ring-1 focus-visible:ring-primary placeholder:text-muted-foreground"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <main className="flex-grow container px-4 md:px-8 py-16 md:py-24 mx-auto max-w-6xl">
        <AnimatedSection>
          <div className="flex flex-col md:flex-row justify-between items-baseline mb-12 border-b border-border pb-6">
            <h2 className="text-3xl font-display">Business Functions</h2>
            <p className="text-sm text-muted-foreground mt-4 md:mt-0">
              {filteredFunctions.length} {filteredFunctions.length === 1 ? 'Function' : 'Functions'}
            </p>
          </div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" role="status" aria-busy="true">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="border border-border bg-card/20 animate-pulse">
                  <div className="aspect-video bg-muted" />
                  <div className="h-48" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-8 border border-destructive/20 bg-destructive/5 text-destructive flex flex-col items-center justify-center text-center">
              <p className="mb-4">Unable to load functions. Please try again later.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium rounded-sm"
              >
                Try Again
              </button>
            </div>
          ) : filteredFunctions.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFunctions.map(f => (
                <Link
                  key={f.id}
                  href={`/future-of-work/${f.slug}${horizonQuery}`}
                  className="group border border-border bg-card hover:border-primary/50 transition-colors h-full flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  <FunctionCardCover fn={f} />
                  <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-xl font-display mb-3 group-hover:text-primary transition-colors">{f.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 line-clamp-3 flex-grow">
                    {f.description}
                  </p>
                  <div className="flex items-center text-xs font-medium text-muted-foreground uppercase tracking-widest mt-auto">
                    <span>Explore Horizon</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border border-border bg-card/20">
              <p className="text-muted-foreground">No functions found matching "{searchQuery}".</p>
            </div>
          )}
        </AnimatedSection>

      </main>

      <Footer />
    </div>
  );
}
