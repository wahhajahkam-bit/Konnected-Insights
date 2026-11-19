import React, { useMemo } from 'react';
import { Link } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { Calendar, MapPin, ArrowRight, ExternalLink, Radio } from 'lucide-react';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { CoverPhoto } from '@/components/cover-photo';
import {
  formatEventDateTime,
  formatEventFormat,
  getEventState,
  type PublicEvent,
} from '@/lib/event-content';

function EventCard({ event }: { event: PublicEvent }) {
  const state = getEventState(event.data);
  const image = event.data.images?.[0];

  return (
    <AnimatedSection className="group grid gap-7 border-b border-border py-8 transition-all duration-500 hover:bg-card/50 md:grid-cols-[11rem_1fr_auto] md:items-center md:py-10 md:hover:px-6 md:-mx-6 relative">
      <CoverPhoto src={image} alt={event.title} fit="contain" generated={event.data.imageProvenance === 'ai-generated-representative-artwork'} className="aspect-[4/3] border border-border" />
      <div className="flex-1 max-w-3xl relative z-10">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          <span className="inline-flex items-center gap-2 border border-primary/25 bg-primary/5 px-2.5 py-1">
            {state === 'ongoing' && <Radio className="h-3 w-3" />}
            {state === 'ongoing' ? 'Happening now' : state === 'upcoming' ? 'Upcoming' : state === 'unconfirmed' ? 'Date to be confirmed' : 'Ended'}
          </span>
          <span className="flex items-center gap-2"><Calendar className="h-3 w-3" /> {formatEventDateTime(event.data)}</span>
          <span>{formatEventFormat(event.data.format)}</span>
          {event.data.location && (
            <span className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {event.data.location}</span>
          )}
        </div>
        <h3 className="text-3xl md:text-4xl font-display text-foreground group-hover:text-primary transition-colors duration-300 leading-tight mb-4">
          {event.title}
        </h3>
        <p className="text-muted-foreground font-light leading-relaxed line-clamp-2 md:line-clamp-3">
          {event.data.desc}
        </p>
      </div>

      <div className="shrink-0 flex flex-col gap-3 w-full md:w-auto relative z-10">
        <Link
          href={`/events/${event.slug}`}
          className="inline-flex items-center justify-center gap-3 px-8 py-4 border border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300 uppercase tracking-widest text-[10px] font-semibold bg-card/60 w-full"
        >
          View Details <ArrowRight className="w-4 h-4" />
        </Link>
        {state !== 'ended' && event.data.registrationUrl && (
          <a
            href={event.data.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 uppercase tracking-widest text-[10px] font-semibold w-full"
          >
            Register <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </AnimatedSection>
  );
}

export default function Events() {
  const { data: apiItems, isLoading } = useEditorialItems('events');

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const items = (apiItems || FALLBACK_DATA.events) as PublicEvent[];
    const now = new Date().getTime();
    const upcoming: PublicEvent[] = [];
    const past: PublicEvent[] = [];

    items.forEach((item) => {
      if (getEventState(item.data, now) === 'ended') past.push(item);
      else upcoming.push(item);
    });

    // Sort upcoming events ascending by date
    upcoming.sort((a, b) =>
      new Date(a.data.startAt ?? 0).getTime() - new Date(b.data.startAt ?? 0).getTime()
    );
    // Sort past events descending by date
    past.sort((a, b) => {
      const timeA = a.data.startAt ? new Date(a.data.startAt).getTime() : 0;
      const timeB = b.data.startAt ? new Date(b.data.startAt).getTime() : 0;
      return timeB - timeA;
    });

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [apiItems]);

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Events" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-primary opacity-10 pointer-events-none mix-blend-multiply blur-[120px]" />
          <PageHeader
            category="Events"
            title="Meet in the moment."
            subtitle="Upcoming gatherings and a record of where the network has met before."
            align="left"
            dark={false}
          />
        </div>

        <section className="py-24 bg-background relative z-10 border-t border-border">
          <div className="container px-6 md:px-12 mx-auto max-w-5xl">

            <div className="mb-24" data-testid="events-upcoming">
              <AnimatedSection className="flex items-center gap-4 mb-8">
                <span className="h-[1px] w-12 bg-primary"></span>
                <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold">Upcoming</h2>
              </AnimatedSection>

              {isLoading ? (
                <div className="py-12 flex justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>
              ) : upcomingEvents.length > 0 ? (
                <div className="flex flex-col">
                  {upcomingEvents.map(event => (
                    <EventCard key={event.slug} event={event} />
                  ))}
                </div>
              ) : (
                <AnimatedSection className="p-12 md:p-16 border border-border bg-card/60 backdrop-blur-sm flex flex-col items-center text-center relative overflow-hidden group shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                  <div className="flex items-center gap-6 mb-8 relative z-10">
                     <div className="w-20 h-20 rounded-full border border-border flex items-center justify-center bg-muted shadow-sm group-hover:border-primary/30 transition-colors">
                        <Calendar className="h-8 w-8 text-primary" />
                     </div>
                  </div>
                  <h3 className="text-3xl md:text-5xl font-display text-foreground mb-6 relative z-10">Next dates will appear here.</h3>
                  <p className="text-muted-foreground text-lg md:text-xl font-light leading-relaxed max-w-2xl relative z-10">
                     New gatherings will appear here as soon as their dates are confirmed.
                  </p>
                </AnimatedSection>
              )}
            </div>

            <div data-testid="events-ended">
              <AnimatedSection className="flex items-center gap-4 mb-8">
                <span className="h-[1px] w-12 bg-primary"></span>
                 <h2 className="text-primary uppercase tracking-[0.2em] text-xs font-semibold">Ended</h2>
              </AnimatedSection>

              {isLoading ? (
                <div className="py-12 flex justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>
              ) : pastEvents.length > 0 ? (
                <div className="flex flex-col">
                  {pastEvents.map(event => (
                    <EventCard key={event.slug} event={event} />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground font-light text-lg">
                  No ended events are published yet.
                </div>
              )}
            </div>

          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}