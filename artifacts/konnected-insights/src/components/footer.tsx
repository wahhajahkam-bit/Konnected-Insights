import React from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative z-10 overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_78%_18%,rgba(114,88,205,0.18),transparent_34%),linear-gradient(135deg,#06172D_0%,#0A2342_55%,#071528_100%)] pt-32 pb-12 text-white">
      {/* Decorative large logo in background */}
      <div className="absolute -bottom-20 -right-20 opacity-[0.03] pointer-events-none select-none">
        <span className="font-display text-[20rem] leading-none text-primary">K</span>
      </div>

      {/* Luminous orb for deep atmosphere */}
      <div className="absolute bottom-0 right-[20%] w-[600px] h-[600px] opacity-20 pointer-events-none mix-blend-screen">
        <div className="w-full h-full glow-orb-primary rounded-full blur-[100px]" />
      </div>

      <div className="container px-6 md:px-12 mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 mb-24">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-4 group mb-8" data-testid="link-footer-home">
              <img
                src="/konnected-insights-mark.png"
                alt="Könnected Insights"
                className="h-12 w-12 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
              <span className="border-l border-white/20 pl-4 font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-white/65 transition-colors group-hover:text-white">
                Könnected Insights
              </span>
            </Link>
            <p className="mb-8 max-w-sm text-lg font-light leading-relaxed text-white/65">
              An authoritative ideas journal exploring the intersections of leadership, technology, and humanity.
            </p>
            <a href="https://konsalidon.com" target="_blank" rel="noopener noreferrer" data-testid="link-footer-konsalidon" className="group inline-flex items-center gap-3 text-sm font-medium uppercase tracking-widest text-[#B8A7FF] transition-colors hover:text-white">
              Konsälidön Corporate <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          <div className="flex flex-col gap-6 lg:col-start-4">
            <h4 className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Ecosystem</h4>
            <Link href="/bigger-picture" data-testid="link-footer-bigger-picture" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Bigger Picture</Link>
            <Link href="/masterclass-series" data-testid="link-footer-masterclasses" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Masterclasses</Link>
            <Link href="/future-of-work" data-testid="link-footer-future-of-work" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Future of Work</Link>
            <Link href="/contributors" data-testid="link-footer-contributors" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Contributors</Link>
          </div>

          <div className="flex flex-col gap-6">
            <h4 className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Connect</h4>
            <Link href="/newsletters" data-testid="link-footer-newsletters" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Newsletters</Link>
            <Link href="/communities" data-testid="link-footer-communities" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Communities</Link>
            <Link href="/events" data-testid="link-footer-events" className="font-sans text-sm tracking-wide text-white/65 transition-colors hover:text-white">Events</Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-white/10">
          <p className="text-xs uppercase tracking-widest text-white/45 font-medium">© {new Date().getFullYear()} Konsälidön. All rights reserved.</p>
          <div className="flex gap-8 text-xs uppercase tracking-widest text-white/45 font-medium">
            <span className="cursor-pointer hover:text-white transition-colors" data-testid="link-footer-privacy">Privacy Policy</span>
            <span className="cursor-pointer hover:text-white transition-colors" data-testid="link-footer-terms">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
