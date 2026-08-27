import { cn } from '../../lib/utils'
import { useFinanceData } from '../useFinanceData'
import type { FinanceData } from '../useFinanceData'
import { ConfirmPayoutModal } from '../../components/ConfirmPayoutModal'

import { ServiceSettlementSection } from './treasury/ServiceSettlementSection'
import { AutoPayoutControlSection } from './treasury/AutoPayoutControlSection'
import { ManualReviewSection } from './treasury/ManualReviewSection'
import { PayoutAccountsSection } from './treasury/PayoutAccountsSection'
import { RekeningGridSection } from './treasury/RekeningGridSection'
import { EmergencyFundSection } from './treasury/EmergencyFundSection'
import { PayoutReviewsSection } from './treasury/PayoutReviewsSection'
import { PayoutGatewaySection } from './treasury/PayoutGatewaySection'
import { TaxComplianceSection } from './treasury/TaxComplianceSection'

export function TreasuryPanel({ data }: { data: FinanceData }) {
  const { activeTab } = data
  return (
    <>
      {activeTab === 'treasury' && (
        <div className="space-y-8">

        <ServiceSettlementSection data={data} />
        <AutoPayoutControlSection data={data} />
        <ManualReviewSection data={data} />
        <PayoutAccountsSection data={data} />
        <RekeningGridSection data={data} />
        <EmergencyFundSection data={data} />
        <PayoutReviewsSection data={data} />
        <PayoutGatewaySection data={data} />
        <TaxComplianceSection data={data} />

        {/* close treasury tab */}
        </div>
      )}
    </>
  );
}
