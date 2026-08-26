import { SettingsContent } from './SettingsContent';

// Thin orchestrator: all logic lives inside <SettingsContent />.
// Structural split only — sub-component extraction is a follow-up.
export default function Settings() {
  return <SettingsContent />;
}
