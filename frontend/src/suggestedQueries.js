import { SUGGESTED_QUERIES, STARTER_COUNT, AUTOSUGGEST_LIMIT } from "./config/suggestedQueries.config";

function pickRandom(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function pickStarterQueries(count = STARTER_COUNT) {
  return pickRandom(SUGGESTED_QUERIES, count);
}

export function getAutoSuggestions(input, excluded, limit = AUTOSUGGEST_LIMIT) {
  const trimmed = input.trim().toLowerCase();
  const excludedSet = new Set(excluded);
  return SUGGESTED_QUERIES.filter(
    (q) => !excludedSet.has(q) && (!trimmed || q.toLowerCase().includes(trimmed))
  ).slice(0, limit);
}
