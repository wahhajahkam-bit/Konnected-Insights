import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, MessageCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { CHAT_UNAVAILABLE, ChatResponseError, readChatResponse, type ChatSource } from './insights-chat-response';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: number;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  degraded?: boolean;
  retryQuestion?: string;
  error?: boolean;
};

const hiddenPathPrefixes = ['/admin', '/sign-in', '/sign-up'];
const starterQuestions = [
  'What can I explore in Newsletters?',
  'Find a masterclass for leaders',
  'What does Future of Work cover?',
  'Show me the contributor collections',
];

function safeInternalSourcePath(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.pathname === '/api' ||
      parsed.pathname.startsWith('/api/')
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function VisitorInsightsChat() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [mobileFunctionNavHeight, setMobileFunctionNavHeight] = useState(0);
  const nextId = useRef(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const hidden = hiddenPathPrefixes.some(prefix =>
    location === prefix || location.startsWith(`${prefix}/`),
  );
  const functionRoute = /^\/future-of-work\/[^/]+$/.test(location.split('?')[0]);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (messages.length) {
      transcriptEndRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [messages, pending]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (!functionRoute) {
      setMobileFunctionNavHeight(0);
      return;
    }

    let nav: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const updateHeight = () => {
      const nextNav = document.querySelector<HTMLElement>('[data-mobile-function-nav]');
      if (!nextNav) return;
      if (nav !== nextNav) {
        resizeObserver?.disconnect();
        nav = nextNav;
        resizeObserver = new ResizeObserver(() => {
          setMobileFunctionNavHeight(nav?.getBoundingClientRect().height ?? 0);
        });
        resizeObserver.observe(nextNav);
      }
      setMobileFunctionNavHeight(nextNav.getBoundingClientRect().height);
    };

    updateHeight();
    const mutationObserver = new MutationObserver(updateHeight);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', updateHeight);

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [functionRoute, location]);

  function closeChat() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChat();
      return;
    }

    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea:not([disabled])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function ask(nextQuestion: string, retryMessageId?: number) {
    const trimmed = nextQuestion.trim().slice(0, 1000);
    if (!trimmed || pending) return;

    const history = messages
      .filter(message => !message.error)
      .slice(-6)
      .map(({ role, content }) => ({ role, content: content.slice(0, 1000) }));

    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: 'user',
      content: trimmed,
    };

    if (retryMessageId) {
      setMessages(current => current.filter(message => message.id !== retryMessageId));
    } else {
      setMessages(current => [...current, userMessage]);
    }
    setQuestion('');
    setPending(true);
    setAnnouncement('Searching Könnected Insights.');

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const response = await fetch('/api/insights-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          ...(history.length ? { history } : {}),
        }),
        signal: controller.signal,
      });
      const data = await readChatResponse(response);
      if (controller.signal.aborted) return;

      const assistantMessage: ChatMessage = {
        id: nextId.current++,
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        degraded: data.degraded,
        retryQuestion: data.degraded ? trimmed : undefined,
      };
      setMessages(current => [...current, assistantMessage]);
      setAnnouncement(
        data.degraded
          ? 'A limited answer is ready with available sources.'
          : 'Your answer is ready.',
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage: ChatMessage = {
        id: nextId.current++,
        role: 'assistant',
        content: error instanceof ChatResponseError ? error.message : CHAT_UNAVAILABLE,
        error: true,
        retryQuestion: trimmed,
      };
      setMessages(current => [...current, errorMessage]);
      setAnnouncement(`Error: ${errorMessage.content}`);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  function clearHistory() {
    requestRef.current?.abort();
    requestRef.current = null;
    setPending(false);
    setMessages([]);
    setQuestion('');
    setAnnouncement('Conversation history cleared.');
    inputRef.current?.focus();
  }

  if (hidden) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6"
      style={mobileFunctionNavHeight
        ? { bottom: `calc(${mobileFunctionNavHeight}px + 1rem)` }
        : undefined}
      data-testid="container-insights-chat"
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="status-chat-announcement">
        {announcement}
      </p>

      {open ? (
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="insights-chat-title"
          onKeyDown={handlePanelKeyDown}
          className="flex h-[min(620px,calc(100dvh-2rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden border border-indigo-200/80 bg-[#fbfaff] text-slate-950 shadow-[0_22px_70px_rgba(49,46,129,0.22)]"
          style={mobileFunctionNavHeight
            ? { height: `min(620px, calc(100dvh - ${mobileFunctionNavHeight}px - 2rem))` }
            : undefined}
          data-testid="panel-insights-chat"
        >
          <header className="flex items-center gap-3 border-b border-indigo-100 bg-indigo-50/80 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white" aria-hidden="true">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="insights-chat-title" className="text-sm font-semibold tracking-tight">
                Insights Guide
              </h2>
              <p className="text-xs text-indigo-900/65">Navigate our public knowledge collections</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="rounded-full p-2 text-indigo-900/60 transition-colors hover:bg-indigo-100 hover:text-indigo-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                aria-label="Clear conversation history"
                title="Clear history"
                data-testid="button-clear-chat"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={closeChat}
              className="rounded-full p-2 text-indigo-900/60 transition-colors hover:bg-indigo-100 hover:text-indigo-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
              aria-label="Close Insights Guide"
              data-testid="button-close-chat"
            >
              <X className="size-4" />
            </button>
          </header>

          <div
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            aria-label="Conversation"
            data-testid="list-chat-messages"
          >
            {messages.length === 0 && (
              <div data-testid="chat-welcome">
                <p className="max-w-[30ch] text-sm leading-6 text-slate-700">
                  Ask where to find an idea, collection, contributor, or future-of-work topic.
                </p>
                <div className="mt-4 grid gap-2" aria-label="Starter questions">
                  {starterQuestions.map((starter, index) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void ask(starter)}
                      className="border border-indigo-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-indigo-950 transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                      data-testid={`button-starter-question-${index}`}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <article
                key={message.id}
                className={message.role === 'user' ? 'ml-8' : 'mr-5'}
                data-testid={`message-chat-${message.id}`}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-900/55">
                  {message.role === 'user' ? 'You' : 'Insights Guide'}
                </p>
                <div
                  className={
                    message.role === 'user'
                      ? 'bg-indigo-700 px-3 py-2.5 text-sm leading-6 text-white'
                      : message.error
                        ? 'border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-950'
                        : 'border border-indigo-100 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800'
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.degraded && (
                    <p className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-800" data-testid="status-degraded">
                      This is a limited answer. The retrieved links below are still available.
                    </p>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-indigo-100 pt-3" aria-label="Sources">
                      {message.sources.map(source => {
                        const sourcePath = safeInternalSourcePath(source.url);
                        return (
                          <li key={source.id}>
                            {sourcePath ? (
                            <Link
                              href={sourcePath}
                              className="inline-flex items-start gap-1 text-xs font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                              data-testid={`link-chat-source-${source.id}`}
                            >
                              {source.title}
                            </Link>
                          ) : (
                            <span
                              className="text-xs font-semibold text-slate-600"
                              data-testid={`text-chat-source-invalid-${source.id}`}
                            >
                              {source.title}
                              <span className="font-normal"> · Link unavailable</span>
                            </span>
                          )}
                          {(source.date || source.stale) && (
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              {source.date}{source.date && source.stale ? ' · ' : ''}{source.stale ? 'May be out of date' : ''}
                            </p>
                          )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {message.retryQuestion && (
                    <button
                      type="button"
                      onClick={() => void ask(message.retryQuestion!, message.id)}
                      disabled={pending}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
                      data-testid={`button-retry-chat-${message.id}`}
                    >
                      <RefreshCw className="size-3" aria-hidden="true" />
                      Try again
                    </button>
                  )}
                </div>
              </article>
            ))}
            {pending && (
              <div className="mr-5 border border-indigo-100 bg-white px-3 py-3" role="status" data-testid="status-chat-loading">
                <span className="inline-flex items-center gap-2 text-xs text-indigo-900/70">
                  <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
                  Searching the collections…
                </span>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <form onSubmit={submit} className="border-t border-indigo-100 bg-white p-3">
            <label htmlFor="insights-chat-question" className="sr-only">Ask the Insights Guide</label>
            <div className="flex items-end gap-2 border border-indigo-200 bg-indigo-50/40 p-2 focus-within:border-indigo-600 focus-within:ring-1 focus-within:ring-indigo-600">
              <textarea
                ref={inputRef}
                id="insights-chat-question"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask(question);
                  }
                }}
                maxLength={1000}
                rows={1}
                placeholder="Ask about Könnected Insights…"
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-500"
                disabled={pending}
                data-testid="input-chat-question"
              />
              <button
                type="submit"
                disabled={!question.trim() || pending}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send question"
                data-testid="button-send-chat"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
            <p className="mt-2 px-1 text-[10px] text-slate-500">Answers use published Könnected Insights sources.</p>
          </form>
        </aside>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-2.5 rounded-full border border-indigo-200 bg-[#fbfaff] px-4 py-3 text-sm font-semibold text-indigo-950 shadow-[0_10px_35px_rgba(49,46,129,0.18)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-[0_14px_40px_rgba(49,46,129,0.24)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 motion-reduce:transform-none motion-reduce:transition-none"
          aria-label="Open Insights Guide"
          aria-expanded="false"
          data-testid="button-open-chat"
        >
          <MessageCircle className="size-4 text-indigo-700" aria-hidden="true" />
          <span>Ask Insights</span>
        </button>
      )}
    </div>
  );
}