import { Navigate } from 'react-router'

/**
 * Compatibility component for imports outside the main route table.
 * Banner presentation is authored through App Experience now; this component
 * deliberately contains no legacy persistence or direct-write API calls.
 */
export default function Banners() {
  return <Navigate to="/app-experience/campaigns" replace />
}
