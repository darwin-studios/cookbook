export function searchLatencyBudgetMs({ broadened = false } = {}) {
  return broadened ? 10_000 : 5_000;
}

export function searchLatencyPasses(elapsedMs, options) {
  return Number.isFinite(elapsedMs) && elapsedMs <= searchLatencyBudgetMs(options);
}
