import React, { useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { CoverPhoto } from '@/components/cover-photo';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Play, X, ExternalLink } from 'lucide-react';
import { AnimatedSection } from '@/components/animated-section';
import { cn } from '@/lib/utils';
import { useEditorialItems } from '@/hooks/use-editorial';
import { FALLBACK_DATA } from '@/lib/editorial-fallbacks';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { PageHeader } from '@/components/page-header';
import { Metadata } from '@/components/metadata';

interface Talk {
  topic: string;
  id: string;
  title: string;
  thumbnail?: string;
  imageProvenance?: string;
}

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_EMBED_POLICY_NAME = 'youtube-embed';
const YOUTUBE_EMBED_URL = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?autoplay=1$/;
const YOUTUBE_EMBED_POLICY = Symbol.for('konnected.youtubeEmbedPolicy');

type YouTubeEmbedPolicy = {
  createScriptURL: (value: string) => unknown;
};

type TrustedTypesWindow = Window & {
  [YOUTUBE_EMBED_POLICY]?: YouTubeEmbedPolicy;
  trustedTypes?: {
    createPolicy: (
      name: string,
      rules: { createScriptURL: (value: string) => string },
    ) => YouTubeEmbedPolicy;
  };
};

function getYouTubeEmbedUrl(videoId: unknown) {
  if (typeof videoId !== 'string' || !YOUTUBE_VIDEO_ID.test(videoId)) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
}

function YouTubeEmbed({ talk }: { talk: Talk }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    const embedUrl = getYouTubeEmbedUrl(talk.id);
    if (!iframe || !embedUrl) return;

    const trustedWindow = window as TrustedTypesWindow;
    const trustedTypes = trustedWindow.trustedTypes;
    if (!trustedTypes) {
      iframe.src = embedUrl;
      return;
    }

    const policy = trustedWindow[YOUTUBE_EMBED_POLICY]
      ?? trustedTypes.createPolicy(YOUTUBE_EMBED_POLICY_NAME, {
        createScriptURL: (value) => {
          if (!YOUTUBE_EMBED_URL.test(value)) {
            throw new TypeError('Blocked an unexpected YouTube embed URL.');
          }
          return value;
        },
      });
    trustedWindow[YOUTUBE_EMBED_POLICY] = policy;

    iframe.src = policy.createScriptURL(embedUrl) as string;
  }, [talk.id]);

  return (
    <iframe
      ref={iframeRef}
      width="100%"
      height="100%"
      title={talk.title}
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="w-full h-full"
    />
  );
}

export default function Talks() {
  const { data: apiItems, isLoading } = useEditorialItems('talks');

  const talks = useMemo(() => {
    if (apiItems) {
      return apiItems
        .map(item => ({
          title: item.title,
          ...item.data
        }) as Talk);
    }
    return FALLBACK_DATA.talks
      .map(i => ({ title: i.title, ...i.data }) as Talk);
  }, [apiItems]);

  const [activeTopic, setActiveTopic] = useState<string>("All Topics");
  const [activeTalk, setActiveTalk] = useState<Talk | null>(null);
  const lastTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const requestedTalkId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('talk');
  }, []);
  const restoreTalkTriggerFocus = React.useCallback(() => {
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!requestedTalkId || activeTalk) return;
    const requestedTalk = talks.find((talk) => talk.id === requestedTalkId);
    if (requestedTalk) setActiveTalk(requestedTalk);
  }, [activeTalk, requestedTalkId, talks]);

  const topics = useMemo(() => ["All Topics", ...Array.from(new Set(talks.map(t => t.topic).filter(Boolean)))], [talks]);

  const filteredTalks = useMemo(() => {
    if (activeTopic === "All Topics") return talks;
    return talks.filter(t => t.topic === activeTopic);
  }, [activeTopic, talks]);

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-foreground">
      <Metadata title="Talks" />
      <div className="noise-overlay" />
      <Navbar />

      <main className="flex-grow">
        <div className="relative">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] glow-orb-primary opacity-10 pointer-events-none mix-blend-multiply blur-[120px]" />
          <PageHeader
            category="Talks"
            title="Ideas in action."
            subtitle="Explore insights, strategies, and perspectives from our network of experts."
            align="left"
            dark={false}
          />
        </div>

        <section className="py-24 bg-background relative z-10 border-t border-border">
          <div className="container px-6 md:px-12 mx-auto max-w-7xl">
            <AnimatedSection delay={0.1} className="mb-16 relative z-20">
              <div className="flex flex-wrap gap-3">
                {topics.map((topic) => (
                  <button
                    type="button"
                    key={topic}
                    onClick={() => setActiveTopic(topic)}
                    className={cn(
                      "px-6 py-3 text-[10px] uppercase tracking-[0.2em] transition-all duration-300 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      activeTopic === topic
                        ? "bg-primary text-primary-foreground border-transparent font-medium shadow-[0_0_20px_rgba(104,87,153,0.3)]"
                        : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-primary/50 hover:bg-card/50"
                    )}
                    aria-pressed={activeTopic === topic}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </AnimatedSection>

            <div className="flex flex-col border-t border-border">
              {filteredTalks.map((talk, i) => (
                <AnimatedSection key={talk.id || `${talk.title}-${i}`} delay={0.1 + (i * 0.05)} direction="up">
                  <div className="group flex flex-col md:flex-row md:items-center justify-between py-8 md:py-10 gap-8 border-b border-border transition-all duration-500 hover:bg-card/50 hover:px-6 -mx-6 relative">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-8 md:gap-12 w-full md:w-auto">
                      <button
                        type="button"
                        disabled={!getYouTubeEmbedUrl(talk.id)}
                        onClick={(event) => {
                          lastTriggerRef.current = event.currentTarget;
                          setActiveTalk(talk);
                          event.stopPropagation();
                        }}
                        className="w-full sm:w-48 shrink-0 relative aspect-video overflow-hidden bg-muted border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                        aria-label={`Play ${talk.title}`}
                      >
                        <CoverPhoto src={talk.thumbnail || (getYouTubeEmbedUrl(talk.id) ? `https://i.ytimg.com/vi/${talk.id}/hqdefault.jpg` : undefined)} generated={talk.imageProvenance === 'ai-generated-representative-artwork'} className="h-full w-full" />
                        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-10 transition-opacity duration-500 mix-blend-overlay" />
                        {getYouTubeEmbedUrl(talk.id) && <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-background/50 backdrop-blur-sm border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors duration-300 shadow-[0_0_20px_rgba(0,0,0,0.1)] group-hover:text-primary-foreground text-foreground">
                            <Play className="w-5 h-5 fill-current ml-1" />
                          </div>
                        </div>}
                      </button>

                      <div className="flex-1 max-w-2xl">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary mb-4 flex items-center gap-2">
                          {talk.topic}
                        </div>
                        <h4 className="text-2xl md:text-4xl font-display text-foreground group-hover:text-primary transition-colors duration-300 leading-tight">
                          {talk.title}
                        </h4>
                      </div>
                    </div>

                    {getYouTubeEmbedUrl(talk.id) ? <button
                      type="button"
                      onClick={(event) => {
                        lastTriggerRef.current = event.currentTarget;
                        setActiveTalk(talk);
                        event.stopPropagation();
                      }}
                      className="shrink-0 inline-flex items-center justify-center sm:justify-start gap-4 px-8 py-4 border border-border text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300 uppercase tracking-widest text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full md:w-auto bg-card/60"
                      aria-label={`Watch ${talk.title}`}
                    >
                      <span>Watch</span>
                      <Play className="w-4 h-4 fill-current" />
                    </button> : <p className="text-xs text-muted-foreground">Video not available</p>}
                  </div>
                </AnimatedSection>
              ))}
              {filteredTalks.length === 0 && (
                <div className="py-24 text-center text-muted-foreground font-light text-lg">
                  No talks found for this topic.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />

      <DialogPrimitive.Root
        open={!!activeTalk}
        onOpenChange={(open) => {
          if (!open) {
            setActiveTalk(null);
            restoreTalkTriggerFocus();
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-full max-w-[95vw] md:max-w-6xl p-0 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2 shadow-2xl"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
               restoreTalkTriggerFocus();
            }}
          >
             <DialogPrimitive.Title className="sr-only">
               Watch: {activeTalk?.title}
             </DialogPrimitive.Title>
             {activeTalk && (
               <div className="relative bg-[#04040A] rounded-none shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col max-h-[90vh] overflow-hidden">
                 <div className="aspect-video w-full bg-black shrink-0 relative z-10">
                    <YouTubeEmbed talk={activeTalk} />
                 </div>
                 <div className="p-8 md:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-8 bg-[#04040A] text-[#F4F3EF] relative z-0">
                   <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                   <div className="absolute bottom-0 right-0 w-[300px] h-[300px] glow-orb-primary opacity-20 blur-[80px] pointer-events-none" />

                   <div className="flex-1 pr-4 relative z-10">
                     <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-primary mb-4 flex items-center gap-3">
                       <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {activeTalk.topic}
                     </div>
                     <div className="font-display text-3xl md:text-4xl leading-tight">{activeTalk.title}</div>
                   </div>
                   <a
                     href={`https://www.youtube.com/watch?v=${activeTalk.id}`}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="relative z-10 shrink-0 inline-flex items-center justify-center gap-3 px-8 py-4 border border-white/20 bg-white/5 hover:bg-white hover:text-[#0A0B10] transition-all duration-300 uppercase tracking-widest text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white w-full sm:w-auto"
                   >
                     <span>Watch on YouTube</span>
                     <ExternalLink className="w-4 h-4" />
                   </a>
                 </div>
               </div>
             )}
             <DialogPrimitive.Close asChild>
               <button
                 type="button"
                  autoFocus
                 className="absolute -top-16 right-0 w-12 h-12 flex items-center justify-center border border-white/20 text-white bg-black/50 backdrop-blur-md hover:bg-white hover:text-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
                 aria-label="Close video dialog"
               >
                 <X className="h-6 w-6" />
               </button>
             </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
