export function getInitialEditorialData(
  collection: string,
  existingData?: Record<string, unknown>,
) {
  if (existingData) return existingData;
  if (collection === 'events') {
    return { images: [] };
  }
  return {};
}

export function applyEditorialAiData(
  collection: string,
  currentData: Record<string, unknown>,
  generatedData: Record<string, unknown>,
) {
  // Event generation is evidence-sensitive: replacing the factual payload
  // prevents retired legacy fields or unevidenced defaults from surviving.
  return collection === 'events'
    ? { ...generatedData }
    : { ...currentData, ...generatedData };
}