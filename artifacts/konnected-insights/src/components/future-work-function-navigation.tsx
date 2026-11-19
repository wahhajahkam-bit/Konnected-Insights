import { Link } from 'wouter';
import { useFutureWorkOverview } from '@/hooks/use-future-work';

export function FutureWorkFunctionNavigation({
  slug, name, horizon,
}: {
  slug: string;
  name: string;
  horizon: 2030 | 2050 | 2100;
}) {
  const { data, isLoading, isError, isFetching, refetch } = useFutureWorkOverview();
  const functions = (data?.functions ?? [])
    .filter(fn => fn.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const options = (
    <>
      {isLoading && <p role="status" className="text-sm text-muted-foreground py-3">Loading functions…</p>}
      {isError && (
        <div className="text-sm text-muted-foreground">
          <p role="status">Business functions could not be refreshed.</p>
          <button type="button" onClick={() => refetch()} disabled={isFetching}
            className="min-h-11 text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {isFetching ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}
      <nav aria-label="Business Functions" className="space-y-1">
        {functions.map(fn => (
          <Link key={fn.id} href={`/future-of-work/${encodeURIComponent(fn.slug)}?horizon=${horizon}`}
            state={{ focusFutureWorkIntroduction: true }}
            aria-current={fn.slug === slug ? 'page' : undefined}
            onClick={event => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
                if (fn.slug === slug) event.preventDefault();
              }
            }}
            className={`flex items-center min-h-11 px-3 py-2 text-sm border-l-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              fn.slug === slug
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
            {fn.name}
          </Link>
        ))}
      </nav>
      {!isLoading && functions.length === 0 && !isError && (
        <p className="text-sm text-muted-foreground py-3">No business functions available.</p>
      )}
      {(isError || (!isLoading && functions.length === 0)) && (
        <Link href={`/future-of-work?horizon=${horizon}`}
          className="flex items-center min-h-11 text-sm text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Back to function index
        </Link>
      )}
    </>
  );

  return (
    <div className="mb-6 pb-6 border-b border-border/50">
      <div className="hidden lg:block">
        <h4 className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-3">Business Functions</h4>
        {options}
      </div>
      <details key={slug} className="lg:hidden">
        <summary className="min-h-11 cursor-pointer text-sm py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span className="font-medium">Business Functions</span>
          <span className="block text-muted-foreground mt-1">{name}</span>
        </summary>
        {options}
      </details>
    </div>
  );
}