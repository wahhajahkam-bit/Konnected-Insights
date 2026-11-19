export function ResearchRejections({ sources }: {
  sources?: { url: string; reason: string }[];
}) {
  if (!sources?.length) return null;
  return (
    <section className="mt-3 border border-amber-500/30 bg-amber-500/5 p-3 text-sm" aria-label="Reasons sources were rejected">
      <h4 className="mb-2 font-medium">Why these sources were rejected</h4>
      <ul className="space-y-3">
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="break-words">
            <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">{source.url}</a>
            <p className="mt-1 whitespace-pre-wrap text-foreground"><strong>Reason: </strong>{source.reason?.trim() || 'No reason was recorded for this older result.'}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}