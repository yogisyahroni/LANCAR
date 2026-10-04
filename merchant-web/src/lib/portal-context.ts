import { api } from './api'
import { clearMerchantDeviceSession, deviceId, getMerchantDeviceSession, setMerchantDeviceSession } from './auth'
import type { MerchantPortalContext } from './types'

interface PortalContextResponse {
  data: MerchantPortalContext
}

interface DeviceSessionResponse {
  data?: {
    session_token?: string
    branch_id?: string
    device_id?: string
  }
}

function unwrap(response: { data: PortalContextResponse }): MerchantPortalContext {
  if (!response.data?.data?.merchant) {
    throw new Error('Konteks portal tidak lengkap.')
  }
  return response.data.data
}

// Loads the server-owned tenant context and opens the scoped device session
// required for staff before any protected portal screen is rendered.
export async function loadMerchantPortalContext(): Promise<MerchantPortalContext> {
  const existingSession = getMerchantDeviceSession()
  let context: MerchantPortalContext
  try {
    context = unwrap(await api.get<PortalContextResponse>('/merchant/context'))
  } catch (error) {
    // A session can expire between tabs. Remove only the scoped outlet
    // session and retry the context discovery once; the JWT remains intact.
    if (!existingSession) throw error
    clearMerchantDeviceSession()
    context = unwrap(await api.get<PortalContextResponse>('/merchant/context'))
  }
  if (!context.device_session_required || getMerchantDeviceSession()) return context

  const branchID = context.current_branch_id || context.branches.find((branch) => branch.is_active)?.id
  if (!branchID) throw new Error('Akun staff belum memiliki outlet aktif.')

  const currentDeviceID = deviceId()
  const sessionResponse = await api.post<DeviceSessionResponse>(`/merchant/device-sessions/${context.merchant.id}`, {
    branch_id: branchID,
    device_id: currentDeviceID,
    device_label: typeof navigator === 'undefined' ? 'Merchant Portal' : navigator.userAgent.slice(0, 120),
  })
  const session = sessionResponse.data?.data
  if (!session?.session_token) throw new Error('Sesi outlet tidak dapat dibuat.')
  setMerchantDeviceSession({
    session_token: session.session_token,
    branch_id: session.branch_id || branchID,
    device_id: session.device_id || currentDeviceID,
  })

  context = unwrap(await api.get<PortalContextResponse>('/merchant/context'))
  return context
}
