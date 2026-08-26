import { FinanceContent } from './FinanceContent';

// Thin orchestrator: all data-fetching, state, mutations and derived
// computations live inside <FinanceContent /> (kept cohesive to avoid
// prop-wiring regressions). Structural split only — sub-component
// extraction of FinanceContent is a follow-up.
export default function Finance() {
  return <FinanceContent />;
}
