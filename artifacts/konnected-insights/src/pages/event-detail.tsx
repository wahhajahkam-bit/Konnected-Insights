import React from 'react';
import { CoverPhoto } from '@/components/cover-photo';
import { useRoute, Link } from 'wouter';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Metadata } from '@/components/metadata';
import { AnimatedSection } from '@/components/animated-section';
import { ArrowLeft, Calendar, MapPin, X, ExternalLink } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEditorialItem } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { formatEventDateTime, formatEventFormat, getEventState } from '@/lib/event-content';

export default function EventDetail() {
  const [, params] = useRoute('/events/:slug');
  const { data: apiEvent, isLoading, isError } = useEditorialItem('events', params?.slug || '');

  const event = apiEvent || FALLBACK_DATA.events.find((e: any) => e.slug === params?.slug);

  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const galleryTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const openGalleryImage = (image: string, trigger: HTMLButtonElement) => {
    galleryTriggerRef.current = trigger;
    setSelectedImage(image);
  };

  if (isLoading && !event) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if ((isError && !event) || !event) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <h1 className="text-4xl font-display mb-4 text-primary">Event Not Found</h1>
          <p className="text-muted-foreground mb-8">The event you are looking for does not exist or has been removed.</p>
          <Link href="/events" className="inline-flex items-center justify-center px-8 py-4 bg-primary text-primary-foreground text-xs uppercase tracking-widest font-semibold hover:bg-primary/90 transition-colors">
            Return to Archive
          </Link>
        </div>
      </div>
    );
  }

  const { data } = event;
  const displayDate = formatEventDateTime(data);
  const displayFormat = formatEventFormat(data.format);
  const state = getEventState(data);

  return (
    <DialogPrimitive.Root open={Boolean(selectedImage)} onOpenChange={(open) => !open && setSelectedImage(null)}>
      <div className="min-h-screen overflow-x-clip bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
        <Metadata title={event.title} />
        <div className="noise-overlay" />
        <Navbar />

        <main className="flex-grow pt-32 pb-24">
          <div className="container px-6 md:px-12 mx-auto max-w-7xl">
            <AnimatedSection className="mb-12">
              <Link href="/events" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors font-medium">
                <ArrowLeft className="w-3 h-3" /> Back to Archive
              </Link>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="grid items-start gap-10 border-b border-border pb-14 mb-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
              <div className="min-w-0">
                <h1 className="max-w-4xl text-5xl font-display leading-[0.95] text-foreground md:text-6xl lg:text-7xl">
                  {event.title}
                </h1>

                <div className="mt-8 grid gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground sm:grid-cols-2">
                  <span className="inline-flex w-fit items-center border border-primary/25 bg-primary/5 px-3 py-2 text-[10px] font-semibold text-primary">
                    {state === 'ongoing' ? 'Happening now' : state === 'upcoming' ? 'Upcoming' : state === 'unconfirmed' ? 'Date to be confirmed' : 'Ended'}
                  </span>
                  {displayDate && (
                    <span className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 shrink-0 text-primary" /> {displayDate}
                    </span>
                  )}
                  <span className="flex items-center gap-3 capitalize">{displayFormat}</span>
                  {data.location && (
                    <span className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" /> {data.location}
                    </span>
                  )}
                </div>

                <p className="mt-8 max-w-3xl text-lg font-light leading-relaxed text-muted-foreground md:text-xl">
                  {data.desc}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {state !== 'ended' && data.registrationUrl && (
                    <a
                      href={data.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-3 bg-primary px-8 py-4 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Register for Event <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {data.sourceUrl && (
                    <a
                      href={data.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-3 border border-border px-8 py-4 text-[10px] font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-primary hover:bg-card/50"
                    >
                      View Source <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>

              {!data.images?.[0] && <CoverPhoto className="aspect-video" />}
              {data.images?.[0] && (
                <DialogPrimitive.Trigger asChild>
                  <button
                    type="button"
                    onClick={(clickEvent) => openGalleryImage(data.images[0], clickEvent.currentTarget)}
                    className="group relative w-full overflow-hidden border border-border bg-card p-2 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Open ${event.title} highlight image`}
                  >
                    <span className="block aspect-[16/10] w-full">
                      <CoverPhoto src={data.images[0]} generated={data.imageProvenance === 'ai-generated-representative-artwork'} className="h-full w-full" />
                    </span>
                  </button>
                </DialogPrimitive.Trigger>
              )}
            </AnimatedSection>

            {data.stats && data.stats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
                {data.stats.map((stat: any, j: number) => (
                  <AnimatedSection key={j} delay={0.2 + (j * 0.1)} className="p-10 border border-border bg-card/60 text-center hover:bg-card hover:border-primary/20 transition-colors backdrop-blur-sm shadow-sm">
                    <div className="text-5xl font-display text-primary mb-3 drop-shadow-sm">{stat.value}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">{stat.label}</div>
                  </AnimatedSection>
                ))}
              </div>
            )}

            {data.images && data.images.length > 1 && (
              <AnimatedSection delay={0.4} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {data.images.slice(1).map((image: string, imageIndex: number) => (
                  <DialogPrimitive.Trigger asChild key={image}>
                    <button
                      type="button"
                      onClick={(clickEvent) => openGalleryImage(image, clickEvent.currentTarget)}
                      className="relative aspect-video overflow-hidden border border-border bg-card p-2 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Open ${event.title} gallery image ${imageIndex + 2}`}
                    >
                      <img src={image} alt="" className="h-full w-full object-contain" />
                    </button>
                  </DialogPrimitive.Trigger>
                ))}
              </AnimatedSection>
            )}
          </div>
        </main>

        <Footer />
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 max-w-[calc(100vw-2rem)] max-h-[90vh] focus:outline-none"
          aria-describedby={undefined}
           onCloseAutoFocus={(event) => {
             event.preventDefault();
             galleryTriggerRef.current?.focus();
           }}
        >
          <DialogPrimitive.Title className="sr-only">Könnected Insights event image</DialogPrimitive.Title>
          {selectedImage && (
            <div className="relative group">
              <img src={selectedImage} alt="Könnected Insights archive" className="max-h-[86vh] max-w-full object-contain shadow-2xl border border-white/10" />
            </div>
          )}
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="absolute -top-16 right-0 w-12 h-12 flex items-center justify-center border border-white/20 text-white bg-black/50 backdrop-blur-md hover:bg-white hover:text-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
              aria-label="Close gallery"
            >
              <X className="h-6 w-6" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}