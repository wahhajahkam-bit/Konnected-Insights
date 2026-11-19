import React, { useRef, useState } from 'react';
import { motion, useScroll, useMotionValueEvent, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { useEditorialAccess } from '@/hooks/use-access';

const PRIMARY_NAV_LINKS = [
  { href: '/bigger-picture', label: 'Bigger Picture' },
  { href: '/newsletters', label: 'Newsletters' },
  { href: '/masterclass-series', label: 'Masterclasses' },
  { href: '/future-of-work', label: 'Future of Work' },
  { href: '/contributors', label: 'Contributors' },
  { href: '/communities', label: 'Communities' },
  { href: '/events', label: 'Events' },
];

const SECONDARY_NAV_LINKS = [
  { href: '/talks', label: 'Talks' },
  { href: '/admin', label: 'Admin' },
];

const HISTORY_INDEX_KEY = '__konnectedHistoryIndex';
const HISTORY_MAX_KEY = 'konnected-history-max';

export function Navbar({ alwaysDark = false }: { alwaysDark?: boolean }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [location] = useLocation();
  const reduceMotion = useReducedMotion();
  const { isSignedIn } = useAuth();
  const { data: access } = useEditorialAccess();
  const isHomeTop = (location === '/' || alwaysDark) && !scrolled && !mobileMenuOpen;
  const [historyPosition, setHistoryPosition] = useState({ current: 0, max: 0 });

  React.useEffect(() => {
    const syncHistoryPosition = () => {
      const savedMax = Number.parseInt(window.sessionStorage.getItem(HISTORY_MAX_KEY) ?? '', 10);
      const hasSavedMax = Number.isFinite(savedMax);
      const state = (window.history.state ?? {}) as Record<string, unknown>;
      const stateIndex = state[HISTORY_INDEX_KEY];
      const current = typeof stateIndex === 'number'
        ? stateIndex
        : hasSavedMax
          ? savedMax + 1
          : 0;
      const max = Math.max(hasSavedMax ? savedMax : 0, current);

      if (stateIndex !== current) {
        window.history.replaceState(
          { ...state, [HISTORY_INDEX_KEY]: current },
          '',
          window.location.href,
        );
      }
      window.sessionStorage.setItem(HISTORY_MAX_KEY, String(max));
      setHistoryPosition({ current, max });
    };

    syncHistoryPosition();
    window.addEventListener('popstate', syncHistoryPosition);
    return () => window.removeEventListener('popstate', syncHistoryPosition);
  }, [location]);

  const secondaryNavLinks = SECONDARY_NAV_LINKS.filter(
    link => link.href !== '/admin' || !isSignedIn || access?.allowed,
  );
  const activeNavLinks = [...PRIMARY_NAV_LINKS, ...secondaryNavLinks];
  const isSecondaryRoute = secondaryNavLinks.some(
    link => location === link.href || location.startsWith(`${link.href}/`),
  );

  React.useEffect(() => {
    setDesktopMenuOpen(false);
  }, [location]);

  React.useEffect(() => {
    if (!desktopMenuOpen) return undefined;

    const dismissMenu = (event: MouseEvent) => {
      if (!desktopMenuRef.current?.contains(event.target as Node)) {
        setDesktopMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDesktopMenuOpen(false);
        desktopMenuButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', dismissMenu);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', dismissMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [desktopMenuOpen]);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <motion.header
      initial={false}
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
        isHomeTop
          ? 'bg-transparent text-[#F4F3EF]'
          : 'bg-background/95 text-foreground backdrop-blur-md border-b border-border shadow-sm'
      } ${scrolled ? 'py-4' : 'py-6'}`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 flex items-center justify-between gap-4 relative z-50">
        <div className="flex min-w-0 shrink-0 items-center">
          <Link
            href="/"
            className="flex items-center gap-2 group"
            onClick={closeMenu}
            data-testid="link-home"
          >
            <div className="flex items-center gap-3">
              <img
                src="/konnected-insights-mark.png"
                alt="Könnected Insights"
                className="h-9 w-9 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
              <span className={`hidden font-sans tracking-[0.16em] uppercase text-[10px] border-l pl-3 transition-colors sm:block ${
                isHomeTop ? 'text-white/70 border-white/20' : 'text-muted-foreground border-border'
              }`}>
                Könnected Insights
              </span>
            </div>
          </Link>

        </div>

        <div className="ml-auto flex items-center gap-1 xl:hidden" role="group" aria-label="Page history">
          <button
            type="button"
            onClick={() => window.history.back()}
            disabled={historyPosition.current <= 0}
            aria-label="Go back"
            title="Back"
            data-testid="button-mobile-history-back"
            className={`inline-flex h-8 w-8 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-30 ${
              isHomeTop
                ? 'border-white/30 bg-black/10 text-white/80 hover:border-white/70 hover:bg-white hover:text-black focus-visible:ring-white'
                : 'border-border bg-background/50 text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background'
            }`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => window.history.forward()}
            disabled={historyPosition.current >= historyPosition.max}
            aria-label="Go forward"
            title="Forward"
            data-testid="button-mobile-history-forward"
            className={`inline-flex h-8 w-8 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-30 ${
              isHomeTop
                ? 'border-white/30 bg-black/10 text-white/80 hover:border-white/70 hover:bg-white hover:text-black focus-visible:ring-white'
                : 'border-border bg-background/50 text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background'
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden xl:flex items-center gap-4 2xl:gap-6 text-[10px] 2xl:text-[11px] uppercase tracking-[0.14em] 2xl:tracking-widest font-medium">
          {PRIMARY_NAV_LINKS.map(link => {
            const isActive = location === link.href || (location.startsWith(link.href + '/') && link.href !== '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-nav-${link.href.replace('/', '')}`}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 transition-colors ${
                  isActive
                    ? (isHomeTop ? 'text-white' : 'text-foreground')
                    : (isHomeTop ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground')
                }`}
              >
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className={`absolute bottom-0 left-0 right-0 h-[1px] ${isHomeTop ? 'bg-white' : 'bg-foreground'}`}
                    initial={false}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          <div className="ml-1 flex items-center gap-1" role="group" aria-label="Page history">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={historyPosition.current <= 0}
              aria-label="Go back"
              title="Back"
              data-testid="button-history-back"
              className={`inline-flex h-8 w-8 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30 ${
                isHomeTop
                  ? 'border-white/30 bg-black/10 text-white/80 hover:border-white/70 hover:bg-white hover:text-black focus-visible:ring-white focus-visible:ring-offset-black'
                  : 'border-border bg-background/50 text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              disabled={historyPosition.current >= historyPosition.max}
              aria-label="Go forward"
              title="Forward"
              data-testid="button-history-forward"
              className={`inline-flex h-8 w-8 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30 ${
                isHomeTop
                  ? 'border-white/30 bg-black/10 text-white/80 hover:border-white/70 hover:bg-white hover:text-black focus-visible:ring-white focus-visible:ring-offset-black'
                  : 'border-border bg-background/50 text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background'
              }`}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div ref={desktopMenuRef} className="relative">
            <button
              ref={desktopMenuButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={desktopMenuOpen}
              aria-controls="desktop-secondary-menu"
              aria-current={isSecondaryRoute ? 'page' : undefined}
              onClick={() => setDesktopMenuOpen(open => !open)}
              data-testid="button-desktop-more"
              aria-label="Open additional navigation"
              className={`flex h-9 w-10 items-center justify-center border-l px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSecondaryRoute
                  ? (isHomeTop ? 'border-white/50 text-white' : 'border-foreground text-foreground')
                  : (isHomeTop ? 'border-white/25 text-white/70 hover:text-white' : 'border-border text-muted-foreground hover:text-foreground')
              }`}
            >
              <Menu className="h-6 w-6" strokeWidth={1.5} />
            </button>
            {desktopMenuOpen && (
              <div
                id="desktop-secondary-menu"
                role="menu"
                className="absolute right-0 top-[calc(100%+0.5rem)] min-w-44 border border-border bg-background p-1.5 text-foreground shadow-xl"
              >
                {secondaryNavLinks.map(link => {
                  const isActive = location === link.href || location.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setDesktopMenuOpen(false)}
                      data-testid={`link-nav-${link.href.replace('/', '')}`}
                      className={`flex items-center justify-between gap-5 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      {link.label}
                      {isActive && <span aria-hidden="true">•</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Mobile Toggle */}
        <button
          className={`xl:hidden p-2 -mr-2 transition-colors ${
            isHomeTop ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="absolute top-full left-0 right-0 bg-background/98 backdrop-blur-xl border-b border-border px-6 py-6 xl:hidden shadow-2xl overflow-hidden"
          >
            <nav className="flex flex-col gap-0 text-3xl font-display">
              {activeNavLinks.map((link, i) => {
                const isActive = location === link.href || (location.startsWith(link.href + '/') && link.href !== '/');
                return (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : undefined }}
                    key={link.href}
                  >
                    <Link
                      href={link.href}
                      onClick={closeMenu}
                      data-testid={`link-mobile-nav-${link.href.replace('/', '')}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={`block py-4 border-b border-border/50 transition-colors ${
                        isActive ? 'text-primary italic' : 'text-foreground hover:text-primary'
                      }`}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
