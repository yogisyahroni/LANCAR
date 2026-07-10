# ADR 0001: Accounting Model and Revenue Recognition

## Status
Accepted

## Context
LANCAR handles various types of financial transactions including on-demand delivery, aggregator logistics, and payment links. To ensure compliance, accurate tax reporting, and robust unit economics calculations, we must define whether LANCAR acts as a Principal or Agent in these transactions, and when revenue is officially recognized.

## Decision

1. **On-Demand Delivery: Principal Model**
   - **Reasoning**: LANCAR determines the price, assumes the risk of delivery failure, and controls the courier network. Therefore, we act as the Principal.
   - **Accounting**: The full amount paid by the customer for the delivery is recognized as gross revenue. The payout made to the courier is recognized as an expense (`courier_payout_expense`).

2. **Aggregator Logistics: Agent Model**
   - **Reasoning**: We resell shipping services from 3PL providers (e.g., JNE, Sicepat) and act merely as a broker. The 3PL handles the actual liability of the package.
   - **Accounting**: Only the platform markup/handling fee is recognized as revenue (`handling_fee_revenue`). The base shipping cost paid to the 3PL is a pass-through liability (`provider_payable`) and is not counted as gross revenue.

3. **Payment Link: Escrow / Marketplace Model**
   - **Reasoning**: Payment links are used by merchants to collect payments. We process the payment and hold the funds on their behalf.
   - **Accounting**: Funds received are credited to a liability account (`merchant_payable`). Our revenue is only the payment gateway/admin fee (`payment_admin_fee_revenue`). 

4. **Revenue Recognition Trigger**
   - Revenue for logistics (both On-Demand and Aggregator) is recognized **at the point of delivery completion** (Proof of Delivery validated), NOT at the time of payment.
   - Revenue for Payment Links is recognized **upon successful settlement/payment completion**.

## Consequences
- The Chart of Accounts and Ledger system must support distinct liability and revenue accounts to segregate Principal revenue (Gross) from Agent revenue (Net).
- Tax calculations (PPN) will follow this principal/agent classification (e.g., PPN calculated on full delivery fee for on-demand vs. PPN calculated on handling fee for aggregator, subject to prevailing tax regulations).
- The Finance Dashboard and P&L reports must clearly delineate these revenue streams.
