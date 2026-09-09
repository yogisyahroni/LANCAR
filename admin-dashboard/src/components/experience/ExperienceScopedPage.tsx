import { useState, type ReactNode } from 'react'
import ExperienceScopeBar, { type ExperienceScope } from './ExperienceScopeBar'

const defaultScope: ExperienceScope = {
  marketCode: 'id-jk',
  surface: 'customer_android',
  locale: 'id-ID',
  appVersion: '1.0.0',
}

export default function ExperienceScopedPage({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<ExperienceScope>(defaultScope)
  return (
    <div className="space-y-6">
      <ExperienceScopeBar value={scope} onChange={setScope} />
      {children}
    </div>
  )
}
