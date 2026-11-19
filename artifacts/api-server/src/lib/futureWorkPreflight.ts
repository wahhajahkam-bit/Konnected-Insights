import { fetchEditorialSource, UnsupportedEditorialFormat } from "./editorialSource";
import { isWithinResearchSources, publisherIdentity, sourceEvidence } from "./futureWorkPolicy";

export async function preflightResearchSource(
  url: string,
  windows: Array<{ id: string; sourceWindowMonths: number }>,
  fetchSource = fetchEditorialSource,
) {
  const result = {
    url, finalUrl: null as string | null, checkedAt: new Date().toISOString(),
    publisher: publisherIdentity(url), finalPublisher: null as string | null,
    retrieval: "failed" as "retrieved" | "unsupported" | "failed",
    format: null as string | null, publicationDate: null as string | null,
    withinSavedSource: null as boolean | null, message: "",
    evidence: [] as Array<{ category: string; eligible: boolean; reason: string }>,
    disclaimer: "This checks only the saved page, not the whole website. It is not claim approval or a guarantee of qualifying results. No research, publication, or schedule changes are performed.",
  };
  try {
    const source = await fetchSource(url);
    result.finalUrl = source.url;
    result.finalPublisher = publisherIdentity(source.url);
    result.withinSavedSource = isWithinResearchSources(source.url, { urls: [url], instructions: "" });
    result.retrieval = "retrieved";
    result.format = source.contentType ?? null;
    result.publicationDate = source.date || null;
    result.message = "Retrieved using DNS-pinned public HTTP. Retrieval alone does not establish evidence eligibility.";
    result.evidence = windows.map(window => {
      try {
        if (!result.withinSavedSource) throw new Error("Redirect destination is outside the saved source restriction");
        sourceEvidence(source, window.sourceWindowMonths, new Date(result.checkedAt));
        return { category: window.id, eligible: true, reason: "Page passes current source checks; relevance and claim support remain unchecked." };
      } catch (error) {
        return { category: window.id, eligible: false, reason: error instanceof Error ? error.message : "Evidence check failed" };
      }
    });
  } catch (error) {
    if (error instanceof UnsupportedEditorialFormat) {
      result.retrieval = "unsupported";
      result.finalUrl = error.url;
      result.finalPublisher = publisherIdentity(error.url);
      result.format = error.contentType || "Unknown content type";
      result.withinSavedSource = isWithinResearchSources(error.url, { urls: [url], instructions: "" });
    }
    // Do not return network errors containing resolved addresses or other internal details.
    result.message = error instanceof UnsupportedEditorialFormat ? error.message
      : "Safe retrieval did not complete. The URL may be blocked, unreachable, too large, timed out, or return an HTTP error. Format and date are unverified.";
  }
  return result;
}