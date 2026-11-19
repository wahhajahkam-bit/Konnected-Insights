/**
 * Type surface for the JavaScript development-database safety guard. Keeping
 * this beside the .mjs implementation lets TypeScript validate every caller.
 */
export function assertSavedSourceTestEnvironment(env?: NodeJS.ProcessEnv): void;