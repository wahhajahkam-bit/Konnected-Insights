import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { adminFutureWorkApi, futureWorkErrorMessage, type FutureWorkFunction } from '@/lib/admin-future-work-api';

function SourceCheck({ item, url, index }: { item: FutureWorkFunction; url: string; index: number }) {
  const check = useMutation({ mutationFn: () => adminFutureWorkApi.preflight(item.id, item.revision, index) });
  const result = check.data;
  return <div className="space-y-2 border border-border p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="break-all">{url}</span>
      <Button type="button" variant="outline" size="sm" disabled={check.isPending}
        onClick={() => { check.reset(); check.mutate(); }}>
        {check.isPending ? 'Checking…' : 'Check eligibility'}
      </Button>
    </div>
    <div aria-live="polite" aria-busy={check.isPending}>
      {check.isError && <p role="alert" className="text-destructive">{
        check.error instanceof ApiError && check.error.status === 409
          ? 'This record changed in another session. Your unsaved edits are still here; the latest data has not been loaded. Copy any unsaved edits before reloading the page, then reopen this function and review the latest saved sources before checking again.'
          : futureWorkErrorMessage(check.error)
      }</p>}
      {result && <div className="space-y-2" data-testid="source-preflight-result">
        <p>Checked {new Date(result.checkedAt).toLocaleString()} · saved page only</p>
        <p>Saved publisher: {result.publisher ? `${result.publisher} — recognized by current policy` : 'Not eligible — publisher not recognized by current policy'}</p>
        {result.finalUrl && <>
          <p className="break-all">Final URL: {result.finalUrl}</p>
          <p>Final publisher: {result.finalPublisher ? `${result.finalPublisher} — recognized` : 'Not eligible — unrecognized publisher'}</p>
          <p>Within saved source restriction: {result.withinSavedSource ? 'Yes' : 'No'}</p>
        </>}
        <p>Safe retrieval: {result.retrieval === 'retrieved' ? 'Completed' : result.retrieval === 'unsupported' ? 'Public response reached; unsupported format' : 'Not completed'}. {result.message}</p>
        <p>Format: {result.format || 'Unverified'}{result.retrieval === 'retrieved' ? ' — supported' : ''}</p>
        <p>Publication date: {result.publicationDate || 'Unavailable — not inferred'}</p>
        {result.evidence.map(item => <p key={item.category}>
          {item.category}: {item.eligible ? 'Source checks passed' : 'Not eligible'} — {item.reason}
        </p>)}
        <p className="text-muted-foreground">{result.disclaimer}</p>
      </div>}
    </div>
  </div>;
}

export function ResearchSourcePreflight({ item }: { item: FutureWorkFunction }) {
  if (!item.researchSources?.urls.length) return null;
  return <section className="space-y-3" aria-label="Saved research source eligibility">
    <h4 className="font-medium">Check saved Research Sources · optional</h4>
    <p className="text-xs text-muted-foreground">Checks use saved URLs, not unsaved edits below. This does not start research, approve claims, publish findings, or enable schedules. A homepage may lack a date even when individual articles qualify.</p>
    {item.researchSources.urls.map((url, index) =>
      <SourceCheck key={`${item.id}:${item.revision}:${index}:${url}`} item={item} url={url} index={index} />)}
  </section>;
}