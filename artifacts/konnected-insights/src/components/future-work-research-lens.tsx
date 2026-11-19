import { AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import type { FwContent } from '@/lib/api-future-work';

const SUMMARY_PREVIEW_LENGTH = 400;

type FutureWorkResearchLensProps = {
  heading: string;
  items: FwContent[];
  emptyMessage: string;
  accent: 'primary' | 'accent';
  formatDate: (dateString?: string | null) => string;
};

function Summary({ text }: { text: string }) {
  if (text.length <= SUMMARY_PREVIEW_LENGTH) {
    return <p className="text-muted-foreground leading-relaxed mb-6 whitespace-pre-wrap">{text}</p>;
  }

  const breakAt = text.lastIndexOf(' ', SUMMARY_PREVIEW_LENGTH);
  const preview = `${text.slice(0, breakAt > 0 ? breakAt : SUMMARY_PREVIEW_LENGTH).trimEnd()}…`;

  return (
    <details className="mb-6 group/summary">
      <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground transition-colors">
        <span className="block leading-relaxed whitespace-pre-wrap group-open/summary:hidden">{preview}</span>
        <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium">
          <ArrowRight className="w-3 h-3 transition-transform group-open/summary:rotate-90" />
          <span className="group-open/summary:hidden">Read full summary</span>
          <span className="hidden group-open/summary:inline">Hide full summary</span>
        </span>
      </summary>
      <p className="pt-4 text-muted-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
    </details>
  );
}

export function FutureWorkResearchLens({
  heading,
  items,
  emptyMessage,
  accent,
  formatDate,
}: FutureWorkResearchLensProps) {
  const accentBar = accent === 'primary'
    ? 'bg-primary/20 group-hover:bg-primary'
    : 'bg-accent/20 group-hover:bg-accent';
  const sourceHover = 'hover:text-primary';

  return (
    <div>
      <h3 className="text-2xl font-display mb-6 flex items-center gap-3">
        <span className="w-6 h-[1px] bg-border block"></span>
        {heading}
      </h3>
      {items.length > 0 ? (
        <div className="space-y-6">
          {items.map(item => (
            <div key={item.id} className="p-6 md:p-8 bg-card border border-border group relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${accentBar}`}></div>
              <h4 className="text-xl font-display mb-4 pr-12">{item.title}</h4>
              <Summary text={item.summary} />

              {item.stale && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-6 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Verification overdue — previously approved content under review.
                </p>
              )}

              {item.sources && item.sources.length > 0 && (
                <details className="text-sm group/details cursor-pointer">
                  <summary className="text-muted-foreground hover:text-foreground font-medium flex items-center gap-2 select-none">
                    <ArrowRight className="w-3 h-3 transition-transform group-open/details:rotate-90" />
                    View Evidence ({item.sources.length})
                  </summary>
                  <div className="pl-5 pt-4 mt-2 border-t border-border/50 space-y-4">
                    {item.sources.map((src, i) => (
                      <div key={i} className="text-xs">
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 transition-colors mb-1 font-medium ${sourceHover}`}>
                          {src.title} <ExternalLink className="w-3 h-3" />
                        </a>
                        <p className="text-muted-foreground">{src.publisher} · {formatDate(src.publishedAt)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-6 pt-4 border-t border-border/50">
                Updated: {formatDate(item.updatedAt)} · Verified: {formatDate(item.lastVerifiedAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 border border-dashed border-border bg-card/30 text-center">
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}