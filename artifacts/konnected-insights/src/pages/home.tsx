import React, { useRef } from 'react';
import { CoverPhoto } from '@/components/cover-photo';
import { CommunityCover } from '@/components/community-cover';
import { OptionalExternalLink } from '@/components/optional-external-link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, PlayCircle, BookOpen, Calendar, MapPin } from 'lucide-react';
import { Link } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { resolveContributorPortrait } from '@/lib/contributor-content';
import {
  formatEventDateTime,
  formatEventFormat,
  getEventState,
  type PublicEvent,
} from '@/lib/event-content';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const masterclassRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const revealMasterclasses = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = masterclassRef.current;
    if (!section) return;
    event.preventDefault();
    // Native fragment navigation emits popstate, which triggers route scroll restoration.
    // Keep this same-page cue local without adding a duplicate route-history entry.
    window.history.replaceState(window.history.state, '', '#masterclass-series');
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
  };
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const { data: newslettersData } = useEditorialItems('newsletters');
  const { data: masterclassesData } = useEditorialItems('masterclasses');
  const { data: fowData } = useEditorialItems('future-work');
  const { data: contributorsData } = useEditorialItems('contributors');
  const { data: communitiesData } = useEditorialItems('communities');
  const { data: eventsData } = useEditorialItems('events');
  const { data: talksData } = useEditorialItems('talks');

  const newsletters = newslettersData ?? FALLBACK_DATA.newsletters;
  const masterclasses = masterclassesData ?? FALLBACK_DATA.masterclasses;
  const futureWork = fowData ?? FALLBACK_DATA['future-work'];
  const contributors = contributorsData ?? FALLBACK_DATA.contributors;
  const communities = communitiesData ?? FALLBACK_DATA.communities;
  const events = eventsData ?? FALLBACK_DATA.events;
  const talks = talksData ?? FALLBACK_DATA.talks;
  const topMasterclasses = masterclasses.slice(0, 3);
  const [activeMasterclassSlug, setActiveMasterclassSlug] = React.useState('');
  const activeMasterclass = topMasterclasses.find((item) => item.slug === activeMasterclassSlug) ?? topMasterclasses[0];
  const featuredUpcomingEvent = React.useMemo(() => {
    return ([...events] as PublicEvent[])
      .filter((event) => getEventState(event.data) === 'upcoming')
      .sort((a, b) => {
        const startA = a.data.startAt ? new Date(a.data.startAt).getTime() : Number.POSITIVE_INFINITY;
        const startB = b.data.startAt ? new Date(b.data.startAt).getTime() : Number.POSITIVE_INFINITY;
        return startA - startB;
      })[0];
  }, [events]);
  const coreTeam = contributors.filter(item => item.data.group === 'Core Team').slice(0, 3);
  const [activeCoreSlug, setActiveCoreSlug] = React.useState('savi');
  const activeCoreMember = coreTeam.find(item => item.slug === activeCoreSlug) ?? coreTeam[0];

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground overflow-hidden selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Home" />
      <div className="noise-overlay" />
      <Navbar />

      {/* Cinematic Hero */}
      <section ref={heroRef} className="relative h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-background">
        <motion.div
          style={reduceMotion ? { y: 0, opacity: 1 } : { y, opacity }}
          className="absolute inset-0 z-0 bg-[#04040A]"
        >
          {/* Luminous Spatial Depth via CSS Orbs */}
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] glow-orb-primary blur-[120px] rounded-full mix-blend-screen opacity-70" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] glow-orb-accent blur-[120px] rounded-full mix-blend-screen opacity-60" />

          <img
            src="/editorial/generated/future-work-hero.jpg"
            alt="Conceptual visualization of the future of work in Dubai"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 cinematic-overlay" />
          <div className="absolute inset-0 cinematic-vignette" />
        </motion.div>

        <div className="container relative z-20 px-6 md:px-12 mt-20">
          <div className="max-w-5xl mx-auto flex flex-col items-center text-center">

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduceMotion ? 0 : 1.2, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="mb-8 inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-primary/40 bg-primary/20 backdrop-blur-md shadow-[0_0_20px_rgba(157,139,225,0.15)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-white tracking-[0.3em] uppercase text-[10px] font-semibold">Könnected Insights</span>
            </motion.div>

            <motion.h1
              initial={reduceMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 1.2, delay: reduceMotion ? 0 : 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-6xl md:text-8xl lg:text-[7rem] font-display font-normal leading-[0.9] mb-8 text-white tracking-tight drop-shadow-2xl"
            >
              The future of work is <br className="hidden md:block"/>
              <span className="italic text-gradient-luminous">the future of humanity.</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-lg md:text-2xl text-white/80 max-w-2xl font-sans font-light mb-12 leading-relaxed drop-shadow-md"
            >
              We must start architecting it today. Explore the ideas, people, and communities shaping the next era.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : 0.6 }}
              className="flex flex-col sm:flex-row items-center gap-6"
            >
              <Link href="/bigger-picture" data-testid="button-hero-bigger-picture" className="group relative inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-4 text-sm tracking-widest uppercase font-medium overflow-hidden rounded-sm transition-transform hover:scale-[1.02] active:scale-95 shadow-[0_0_40px_rgba(157,139,225,0.3)]">
                <span className="relative z-10 flex items-center gap-2">
                  Read the Framing <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
              </Link>
              <Link href="/newsletters" data-testid="button-hero-newsletters" className="group inline-flex items-center justify-center bg-transparent border border-white/20 text-white px-8 py-4 text-sm tracking-widest uppercase font-medium hover:bg-white/5 hover:border-white/40 transition-all rounded-sm backdrop-blur-md">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" /> Read our latest newsletters
                </span>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Next-section cue */}
        <motion.a
          href="#masterclass-series"
          onClick={revealMasterclasses}
          aria-label="Next: Masterclass Series"
          data-testid="link-hero-masterclasses"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 1.5, duration: reduceMotion ? 0 : 1 }}
          className="absolute bottom-24 right-6 md:right-12 z-20 flex min-h-11 min-w-11 items-end justify-end gap-4 text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span className="hidden sm:flex flex-col items-end text-[9px] tracking-[0.24em] uppercase font-medium leading-relaxed">
            <span className="text-white/35">Next</span>
            <span>Masterclass Series</span>
          </span>
          <div className="w-[1px] h-11 bg-white/20 overflow-hidden relative">
            <motion.div
              className="absolute top-0 left-0 w-full h-1/2 bg-primary rounded-full shadow-[0_0_10px_var(--primary)]"
              animate={reduceMotion ? { y: 0 } : { y: [0, 22, 0] }}
              transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            />
          </div>
        </motion.a>
      </section>

      {/* Masterclass Series - Editorial */}
      <section ref={masterclassRef} tabIndex={-1} aria-labelledby="masterclass-series-heading" id="masterclass-series" data-testid="section-home-masterclasses" className="py-24 md:py-32 relative z-10 bg-background text-foreground overflow-hidden border-t border-border scroll-mt-20 outline-none">
        <div className="container px-6 md:px-12 mx-auto relative z-10">
          <div className="mb-16 md:mb-24 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <AnimatedSection className="max-w-2xl">
              <div className="flex items-center gap-4 mb-6">
                <span className="h-[1px] w-12 bg-primary"></span>
                <h2 id="masterclass-series-heading" className="text-primary uppercase tracking-[0.2em] text-xs font-semibold">Masterclass Series</h2>
              </div>
              <h3 className="text-5xl md:text-7xl font-display leading-[0.9] text-foreground">
                The 5-to-10 year <span className="italic text-primary">horizon.</span>
              </h3>
            </AnimatedSection>
            <AnimatedSection delay={0.2} direction="none" className="shrink-0 hidden md:block">
              <Link href="/masterclass-series" data-testid="link-home-masterclasses-top" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors group">
                Explore all masterclasses <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </AnimatedSection>
          </div>

          {masterclasses.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
              {/* Active Masterclass */}
              <div className="lg:col-span-8">
                {activeMasterclass && (
                    <AnimatedSection className="h-full">
                      <Link
                        href={`/masterclass-series/${activeMasterclass.slug}`}
                        data-testid={`link-featured-masterclass-${activeMasterclass.slug}`}
                        className="group flex h-full flex-col gap-8 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-4 focus-visible:ring-offset-background md:flex-row"
                      >
                        {/* Text */}
                        <div className="md:w-1/2 flex flex-col justify-between order-2 md:order-1 py-2">
                          <div>
                            <div className="mb-6 flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/70"></div>
                              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-primary transition-colors">Featured</span>
                            </div>
                            <h4 className="text-3xl md:text-4xl lg:text-5xl font-display leading-[1.05] text-foreground mb-6 group-hover:text-primary transition-colors">
                              {activeMasterclass.title}
                            </h4>
                            <p className="text-sm text-muted-foreground font-light leading-relaxed mb-8">
                              {activeMasterclass.data.excerpt || activeMasterclass.data.framing}
                            </p>
                          </div>

                          <div className="flex items-center justify-between border-t border-border/50 pt-6 mt-auto">
                            {activeMasterclass.data.author?.name && <div className="flex items-center gap-3">
                              {activeMasterclass.data.author?.image ? (
                                <img src={activeMasterclass.data.author.image} alt={activeMasterclass.data.author.name} className="w-10 h-10 rounded-full object-cover grayscale" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-display italic text-muted-foreground border border-border">
                                  {activeMasterclass.data.author?.name?.[0] || 'A'}
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">{activeMasterclass.data.author?.name}</span>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Instructor</span>
                              </div>
                            </div>}

                            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border group-hover:border-primary/30 group-hover:bg-primary/5 transition-all text-muted-foreground group-hover:text-primary">
                              <PlayCircle className="h-4 w-4" />
                            </span>
                          </div>
                        </div>

                        {/* Image */}
                        <div className="md:w-1/2 order-1 md:order-2">
                          <div className="block relative overflow-hidden aspect-[4/3] md:aspect-[3/4] lg:aspect-[4/5] w-full bg-muted/10 border border-border/40 p-2 sm:p-3">
                          <div className="relative w-full h-full bg-card overflow-hidden">
                            <CoverPhoto src={activeMasterclass.data.image} alt={activeMasterclass.title} generated={activeMasterclass.data.imageProvenance === 'ai-generated-representative-artwork'} className="h-full w-full" />
                            {/* Subtle overlay for depth */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-60 transition-opacity duration-700 group-hover:opacity-10 pointer-events-none" />
                          </div>
                          </div>
                        </div>
                      </Link>
                    </AnimatedSection>
                )}
              </div>

              {/* Supporting Stories */}
              <div className="lg:col-span-4">
                <div className="flex flex-col border-t border-border lg:border-t-0 lg:border-l lg:pl-10 xl:pl-12 h-full pt-10 lg:pt-0">
                  <div className="mb-6 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground">Up Next</span>
                  </div>

                   <div
                     className="flex flex-col gap-0 border-t border-border"
                     onMouseLeave={() => setActiveMasterclassSlug(topMasterclasses[0]?.slug ?? '')}
                   >
                     {topMasterclasses.map((item, i) => {
                       const isActive = item.slug === activeMasterclass?.slug;
                       return (
                      <AnimatedSection key={item.slug} delay={0.2 + (i * 0.1)}>
                         <Link
                           href={`/masterclass-series/${item.slug}`}
                           data-testid={`link-masterclass-${item.slug}`}
                           onMouseEnter={() => setActiveMasterclassSlug(item.slug)}
                           onFocus={() => setActiveMasterclassSlug(item.slug)}
                           className={`group relative flex flex-col border-b border-border py-6 pl-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 ${
                             isActive ? 'bg-primary/[0.04]' : 'hover:bg-muted/20'
                           }`}
                         >
                           <span className={`absolute bottom-5 left-0 top-5 w-px transition-colors ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                          <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{item.data.category || 'Masterclass'}</span>
                           <h4 className={`text-xl font-display transition-colors leading-snug mb-3 ${isActive ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] font-medium tracking-widest uppercase text-muted-foreground group-hover:text-primary transition-colors mt-2">
                             Watch <PlayCircle className="w-3 h-3 ml-0.5" />
                          </div>
                        </Link>
                      </AnimatedSection>
                       );
                     })}
                  </div>

                  <AnimatedSection delay={0.5} className="mt-8 lg:mt-auto pt-4">
                    <Link href="/masterclass-series" data-testid="link-home-masterclasses-all-bottom" className="group flex items-center justify-between p-6 bg-muted/10 border border-border/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 hover:bg-muted/30 transition-colors">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground group-hover:text-primary transition-colors">
                        Full Series
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                    </Link>
                  </AnimatedSection>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Future of Work - Dark */}
      <section id="future-of-work" data-testid="section-home-future-work" className="dark py-32 md:py-40 relative z-10 bg-background text-foreground border-t border-border">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] glow-orb-primary opacity-10 pointer-events-none" />

        <div className="container px-6 md:px-12 mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24">
            <AnimatedSection className="max-w-3xl">
              <div className="flex items-center gap-4 mb-6">
                <span className="h-[1px] w-12 bg-primary/50"></span>
                <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold">Future of Work</h2>
              </div>
              <h3 className="text-5xl md:text-7xl font-display leading-[0.95] mb-8 text-foreground">
                Anatomy of the <span className="italic text-gradient-luminous">next era.</span>
              </h3>
              <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-xl">
                Explore how specific business functions are being fundamentally rewritten by artificial intelligence and new organizational models.
              </p>
            </AnimatedSection>
            <AnimatedSection delay={0.2} direction="none" className="shrink-0">
              <Link href="/future-of-work" data-testid="link-home-fow-all" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                Explore all functions <ArrowRight className="h-4 w-4" />
              </Link>
            </AnimatedSection>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {futureWork.slice(0, 6).map((func, i) => (
              <AnimatedSection key={func.slug} delay={i * 0.1} className="h-full">
                <Link href={`/future-of-work/${func.slug}`} data-testid={`link-fow-${func.slug}`} className="group block h-full">
                  <div className="h-full p-8 border border-border/50 bg-card/30 backdrop-blur-sm hover:bg-card hover:border-primary/30 transition-all duration-500 flex flex-col justify-between shadow-sm hover:shadow-[0_0_30px_rgba(157,139,225,0.08)] relative overflow-hidden rounded-sm">
                    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <ArrowUpRight className="w-5 h-5 text-primary" />
                    </div>

                    <div className="mb-12 relative z-10">
                      <div className="w-12 h-12 rounded-full bg-muted border border-border/50 flex items-center justify-center mb-6">
                        <span className="font-display italic text-lg text-muted-foreground group-hover:text-primary transition-colors">{func.title[0]}</span>
                      </div>
                      <h4 className="text-2xl font-display mb-3 text-foreground group-hover:text-primary transition-colors">{func.title}</h4>
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">{func.data.desc}</p>
                    </div>

                    <div className="mt-auto relative z-10">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 group-hover:text-primary/70 transition-colors font-medium">Explore Function</span>
                      <div className="h-[1px] w-full bg-border/50 mt-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 h-full w-full bg-primary/50 -translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out" />
                      </div>
                    </div>
                  </div>
                </Link>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletters - Light, Carousel */}
      <section id="newsletters" data-testid="section-home-newsletters" className="py-32 md:py-40 relative z-10 bg-background text-foreground border-t border-border overflow-hidden">
        <div className="container px-6 md:px-12 mx-auto mb-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <AnimatedSection>
            <div className="flex items-center gap-4 mb-6">
              <span className="h-[1px] w-12 bg-primary"></span>
              <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold">Newsletters</h2>
            </div>
            <h3 className="text-5xl md:text-6xl font-display leading-[0.9] text-foreground">
              Signals from the <span className="italic text-primary">frontier.</span>
            </h3>
          </AnimatedSection>
          <AnimatedSection delay={0.2} direction="none" className="shrink-0">
            <Link href="/newsletters" data-testid="link-home-newsletters" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
              Explore all newsletters <ArrowRight className="h-4 w-4" />
            </Link>
          </AnimatedSection>
        </div>

        <div className="pl-6 md:pl-12 ml-auto lg:pl-[calc(50vw-32rem)] 2xl:pl-[calc(50vw-40rem)] relative">
          <Carousel opts={{ align: "start", dragFree: true }} className="w-full" aria-label="Newsletter dispatches">
            <CarouselContent className="-ml-6">
              {newsletters.slice(0, 6).map((item, i) => (
                <CarouselItem key={item.slug} className="pl-6 basis-[85%] sm:basis-[60%] md:basis-[45%] lg:basis-[30%]">
                  <OptionalExternalLink href={item.data.url} target="_blank" rel="noopener noreferrer" data-testid={`link-newsletter-${item.slug}`} className="block h-full group">
                    {i === 0 ? (
                      <div className="h-full min-h-[400px] p-8 md:p-10 rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground flex flex-col justify-between relative overflow-hidden transition-transform group-hover:scale-[1.02]">
                        {item.data.image && (
                          <img src={item.data.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay transition-transform duration-700 group-hover:scale-105" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-primary/70 to-accent/95 pointer-events-none" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[60px] rounded-full mix-blend-screen pointer-events-none" />
                        <div className="relative z-10">
                          {!item.data.image && <p className="mb-3 text-xs">No cover photo</p>}
                          <div className="mb-6 inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 backdrop-blur-md">
                            <BookOpen className="w-5 h-5 text-white" />
                          </div>
                          <p className="text-white/80 text-xs tracking-widest uppercase mb-4">{item.data.category || 'Newsletter'}</p>
                          <h4 className="text-2xl md:text-3xl font-display leading-tight mb-4">{item.title}</h4>
                          <p className="text-white/80 text-sm leading-relaxed line-clamp-3 mb-8">{item.data.excerpt}</p>
                        </div>
                        <div className="relative z-10 flex items-center justify-between gap-4 mt-auto">
                          {item.data.author?.name && (
                            <div className="flex items-center gap-3 min-w-0">
                              {item.data.author.image ? (
                                <img src={item.data.author.image} alt={item.data.author.name} className="w-8 h-8 rounded-full object-cover border border-white/30" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-display italic">
                                  {item.data.author.name[0]}
                                </div>
                              )}
                              <span className="text-xs font-medium text-white/80 truncate">{item.data.author.name}</span>
                            </div>
                          )}
                          {item.data.url && <div className="flex items-center gap-2 text-[10px] font-medium tracking-widest uppercase ml-auto">
                            Read <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 group-hover:bg-white group-hover:text-primary transition-colors"><ArrowUpRight className="w-3 h-3" /></span>
                          </div>}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-[400px] p-8 md:p-10 rounded-xl bg-card border border-border flex flex-col justify-between transition-all group-hover:border-primary/50 group-hover:shadow-[0_8px_30px_rgba(104,87,153,0.08)] group-hover:-translate-y-1">
                        <div>
                          {!item.data.image && <p className="mb-3 text-xs text-muted-foreground">No cover photo</p>}
                          <div className="mb-6 flex items-center justify-between gap-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted border border-border">
                              <BookOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            {item.data.image && (
                              <img src={item.data.image} alt="" className="w-20 h-14 object-cover rounded-sm opacity-80 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105" />
                            )}
                          </div>
                          <p className="text-muted-foreground text-[10px] tracking-widest uppercase mb-4">{item.data.category || 'Newsletter'}</p>
                          <h4 className="text-2xl md:text-3xl font-display leading-tight mb-4 text-foreground group-hover:text-primary transition-colors">{item.title}</h4>
                          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-8">{item.data.excerpt}</p>
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          {item.data.author?.name && (
                            <div className="flex items-center gap-3">
                              {item.data.author.image ? (
                                <img src={item.data.author.image} alt={item.data.author.name} className="w-8 h-8 rounded-full object-cover grayscale" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-display italic text-muted-foreground border border-border">
                                  {item.data.author.name[0]}
                                </div>
                              )}
                              <span className="text-xs font-medium text-muted-foreground">{item.data.author.name}</span>
                            </div>
                          )}
                          {item.data.url && <div className="flex items-center gap-2 text-[10px] font-medium tracking-widest uppercase text-muted-foreground group-hover:text-primary transition-colors ml-auto">
                            Read <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted group-hover:bg-primary/10 transition-colors"><ArrowUpRight className="w-3 h-3" /></span>
                          </div>}
                        </div>
                      </div>
                    )}
                  </OptionalExternalLink>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="container px-6 md:px-12 mx-auto mt-12 flex items-center gap-4 justify-end">
              <CarouselPrevious data-testid="button-newsletters-previous" className="relative inset-auto translate-x-0 translate-y-0 h-12 w-12 rounded-full border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center" />
              <CarouselNext data-testid="button-newsletters-next" className="relative inset-auto translate-x-0 translate-y-0 h-12 w-12 rounded-full border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center" />
            </div>
          </Carousel>
        </div>
      </section>

      {/* Core Team - Dark */}
      <section id="contributors" data-testid="section-home-contributors" className="dark py-14 md:py-20 relative z-10 bg-background text-foreground border-t border-border overflow-hidden">
        <div className="container px-6 md:px-12 mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-7 mb-9 md:mb-10">
            <AnimatedSection className="max-w-2xl">
              <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold mb-4 flex items-center gap-4">
                <span className="h-[1px] w-12 bg-primary/50"></span> Core Team
              </h2>
              <h3 className="text-4xl md:text-6xl font-display leading-[0.92] text-foreground">
                The minds building <br className="hidden md:block" />
                <span className="italic text-gradient-luminous">what comes next.</span>
              </h3>
            </AnimatedSection>
            <AnimatedSection delay={0.2} direction="none" className="shrink-0">
              <Link href="/contributors" data-testid="link-home-contributors" className="inline-flex items-center justify-center border border-border/50 bg-card/30 text-foreground backdrop-blur-md px-8 py-4 tracking-widest uppercase text-xs font-medium hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] shadow-sm rounded-sm">
                Meet all contributors
              </Link>
            </AnimatedSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-stretch">
            <div className="lg:col-span-7 border-t border-border/60">
              {coreTeam.map((member, index) => {
                const name = member.data.name || member.title;
                const portrait = resolveContributorPortrait({
                  slug: member.slug,
                  image: member.data.image,
                  isPlaceholder: member.data.isPlaceholder,
                });
                const description = member.data.role === 'Advisor'
                  ? 'Advisor to Könnected Insights.'
                  : member.data.role ? `${member.data.role} of Könnected Insights.` : '';

                return (
                  <AnimatedSection key={member.slug} delay={index * 0.08}>
                    <Link
                      href={`/contributors/${member.slug}`}
                      data-testid={`link-contributor-${member.slug}`}
                      onMouseEnter={() => setActiveCoreSlug(member.slug)}
                      onFocus={() => setActiveCoreSlug(member.slug)}
                      className="group relative grid min-h-36 grid-cols-[2.5rem_1fr] gap-4 border-b border-border/60 py-6 pr-28 md:min-h-0 md:grid-cols-[3rem_1fr_auto] md:items-center md:gap-6 md:py-6 md:pr-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      <span className="pt-1 text-[10px] font-semibold tracking-[0.2em] text-primary">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h4 className="text-3xl md:text-4xl font-display leading-none text-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary">
                          {name}
                        </h4>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
                      </div>
                      <ArrowRight className="hidden h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary md:block" />
                      {portrait && (
                        <img
                          src={portrait}
                          alt=""
                          className="absolute bottom-0 right-0 h-36 w-28 object-contain object-bottom lg:hidden"
                        />
                      )}
                    </Link>
                  </AnimatedSection>
                );
              })}
            </div>

            <AnimatedSection delay={0.15} className="hidden lg:col-span-5 lg:flex min-h-[330px] items-end justify-center">
              {activeCoreMember && (
                <Link
                  href={`/contributors/${activeCoreMember.slug}`}
                  className="group relative flex h-full w-full items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`View ${activeCoreMember.data.name || activeCoreMember.title}'s profile`}
                >
                  <motion.img
                    key={activeCoreMember.slug}
                    src={resolveContributorPortrait({
                      slug: activeCoreMember.slug,
                      image: activeCoreMember.data.image,
                      isPlaceholder: activeCoreMember.data.isPlaceholder,
                    })}
                    alt={activeCoreMember.data.name || activeCoreMember.title}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
                    className="relative z-10 max-h-[380px] w-full object-contain object-bottom transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                  <span className="absolute bottom-5 right-4 z-20 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 transition-colors group-hover:text-primary">
                    View profile <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              )}
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Communities - Light */}
      <section id="communities" data-testid="section-home-communities" className="py-32 md:py-40 relative z-10 bg-background text-foreground border-t border-border">
        <div className="container px-6 md:px-12 mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24">
            <AnimatedSection className="max-w-2xl">
              <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold mb-6 flex items-center gap-4">
                <span className="h-[1px] w-12 bg-primary"></span> Communities
              </h2>
              <h3 className="text-5xl md:text-7xl font-display leading-[0.9] text-foreground">
                Spaces for <span className="italic text-primary">operators.</span>
              </h3>
            </AnimatedSection>
            <AnimatedSection delay={0.2} direction="none" className="shrink-0">
              <Link href="/communities" data-testid="link-home-communities" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                Explore all communities <ArrowRight className="h-4 w-4" />
              </Link>
            </AnimatedSection>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communities.slice(0, 6).map((c, i) => (
              <AnimatedSection key={c.slug} delay={i * 0.1} className="h-full">
                <OptionalExternalLink href={c.data.url} target="_blank" rel="noopener noreferrer" data-testid={`link-community-${c.slug}`} className="group block h-full">
                  <div className="h-full p-8 bg-muted/30 border border-border rounded-sm hover:border-primary/40 hover:bg-card hover:shadow-[0_8px_30px_rgba(104,87,153,0.06)] transition-all duration-300">
                    <CommunityCover slug={c.slug} name={c.title} image={c.data.image} imageProvenance={c.data.imageProvenance} className="mb-6 aspect-video" />
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      </div>
                      {c.data.url && <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />}
                    </div>
                    <h4 className="text-2xl font-display mb-3 text-foreground group-hover:text-primary transition-colors">{c.title}</h4>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">{c.data.desc}</p>
                  </div>
                </OptionalExternalLink>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Events - Dark (Immersive) */}
      <section id="events" data-testid="section-home-events" className="dark relative z-10 overflow-hidden border-t border-white/10 bg-[#04040A] pt-20 text-white md:pt-24">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-primary opacity-20 pointer-events-none" />

        <div className="container relative z-10 mx-auto mb-12 px-6 md:mb-14 md:px-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <AnimatedSection className="max-w-2xl">
              <h2 className="mb-4 flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <span className="h-[1px] w-12 bg-primary"></span> Events
              </h2>
              <h3 className="font-display text-4xl leading-[0.95] text-white drop-shadow-2xl md:text-5xl">
                Ideas that began <br className="hidden md:block"/>
                <span className="italic text-gradient-luminous">in the room.</span>
              </h3>
            </AnimatedSection>
            <AnimatedSection delay={0.2} direction="none" className="shrink-0">
              <Link href="/events" data-testid="link-home-events" className="inline-flex items-center justify-center rounded-sm bg-primary px-6 py-3.5 text-[10px] font-medium uppercase tracking-widest text-primary-foreground shadow-[0_0_30px_rgba(157,139,225,0.2)] transition-all hover:scale-[1.02] hover:bg-white hover:text-black">
                Explore all events
              </Link>
            </AnimatedSection>
          </div>
        </div>

        <div className="container relative z-10 mx-auto px-6 pb-20 md:px-12 md:pb-24">
          <div>
            {/* Featured Event */}
            {featuredUpcomingEvent && (
              <AnimatedSection>
                <Link href={`/events/${featuredUpcomingEvent.slug}`} data-testid="link-home-featured-event" className="group grid overflow-hidden rounded-sm border border-white/10 bg-white/[0.035] outline-none transition-colors hover:border-primary/40 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-[#04040A]">
                  <div data-testid="home-featured-event-image" className="relative aspect-[16/9] overflow-hidden border-b border-white/10 bg-black md:aspect-auto md:min-h-[300px] md:border-b-0 md:border-r">
                    {featuredUpcomingEvent.data.images?.[0] ? (
                      <img src={featuredUpcomingEvent.data.images[0]} alt={featuredUpcomingEvent.title} className="absolute inset-0 h-full w-full object-contain object-center opacity-80 transition-opacity duration-700 group-hover:opacity-100" />
                    ) : (
                      <div className="absolute inset-0 bg-muted/20" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                  </div>
                  <div data-testid="home-featured-event-copy" className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
                    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
                      <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-primary backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Next upcoming event
                      </span>
                      <span className="inline-flex items-center gap-2 text-white/70">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {formatEventDateTime(featuredUpcomingEvent.data)}
                      </span>
                      <span className="text-white/55">
                        {formatEventFormat(featuredUpcomingEvent.data.format)}
                      </span>
                      {featuredUpcomingEvent.data.location && (
                        <span className="inline-flex items-center gap-2 text-white/55">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {featuredUpcomingEvent.data.location}
                        </span>
                      )}
                    </div>
                    <h4 className="mb-3 max-w-3xl font-display text-3xl leading-tight text-white md:text-4xl">{featuredUpcomingEvent.title}</h4>
                    <p className="max-w-2xl line-clamp-2 font-light leading-relaxed text-white/65">{featuredUpcomingEvent.data.desc}</p>
                  </div>
                </Link>
              </AnimatedSection>
            )}
            {!featuredUpcomingEvent && (
              <AnimatedSection>
                <div data-testid="home-event-placeholder" className="border border-white/10 bg-white/5 p-8 md:p-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Next gathering</p>
                  <div data-testid="home-event-placeholder-copy">
                    <h4 className="mt-5 text-3xl font-display text-white md:text-5xl">Dates will be announced here.</h4>
                    <p className="mt-4 max-w-2xl text-white/60">We publish an event only when its time and place are confirmed.</p>
                  </div>
                </div>
              </AnimatedSection>
            )}
          </div>
        </div>
      </section>

      <section data-testid="section-home-talks" className="relative z-10 border-t border-border bg-background py-24 text-foreground md:py-32">
        <div className="container px-6 md:px-12 mx-auto">
          <div className="mb-14 flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <AnimatedSection>
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Talks</h2>
              <h3 className="mt-5 text-4xl font-display md:text-6xl">Ideas, shared out loud.</h3>
            </AnimatedSection>
            <Link href="/talks" className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary">
              Explore all talks <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
              {talks.slice(0, 5).map((talk, i) => (
                <AnimatedSection key={talk.slug} delay={i * 0.1}>
                  <Link href={talk.data.id ? `/talks?talk=${encodeURIComponent(talk.data.id)}` : '/talks'} data-testid={`link-talk-${talk.slug}`} className="group flex items-start gap-6 p-6 border border-border/50 bg-card/30 backdrop-blur-sm rounded-sm hover:bg-card hover:border-primary/40 transition-all duration-300 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-background border border-border/50 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 transition-all">
                      <PlayCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-primary/80 mb-2 font-medium">{talk.data.topic}</p>
                      <h5 className="text-lg font-display text-foreground group-hover:text-white transition-colors leading-snug line-clamp-2">{talk.title}</h5>
                    </div>
                  </Link>
                </AnimatedSection>
              ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}