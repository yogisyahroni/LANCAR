const NETWORK_FAILURE_EVENT = 'merchant-web-network-failure'

export function reportNetworkFailure() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NETWORK_FAILURE_EVENT))
}

export function subscribeToNetworkFailures(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(NETWORK_FAILURE_EVENT, listener)
  return () => window.removeEventListener(NETWORK_FAILURE_EVENT, listener)
}
