import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Calculator,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  ArrowRight,
  RefreshCw,
  Layers,
  Percent,
  Server,
  Key,
  Users,
  Sparkles,
  Zap,
  Truck,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import {
  CostIntelligenceApi,
  type PlatformCostConfig,
  type CostBreakdown,
  type PricingRecommendation
} from '../services/costIntelligenceService';
import { useAuthStore } from '../store/useAuthStore';

export default function CostIntelligence() {
  const { user } = useAuthStore();
  const [configs, setConfigs] = useState<PlatformCostConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<PlatformCostConfig | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [recommendations, setRecommendations] = useState<PricingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calculator' | 'breakdown' | 'approval'>('calculator');
  const [sampleCustomerOngkir, setSampleCustomerOngkir] = useState<number>(18000);

  // Auto-Synced Logistics & Aggregator Parameters (Option 1: Live Sync + Overrideable)
  const [logisticsParams, setLogisticsParams] = useState({
    ondemand_base_fare_idr: 10000,
    ondemand_per_km_idr: 2500,
    ondemand_avg_km: 5.5,
    ondemand_courier_commission_pct: 0,
    aggregator_avg_published_idr: 20000,
    aggregator_b2b_discount_pct: 20,
    aggregator_customer_discount_pct: 5,
    aggregator_customer_discount_quota: '' as number | '',
  });

  // Form State for OPEX & CAPEX simulation
  const [formData, setFormData] = useState<PlatformCostConfig>({
    period_label: 'Q3-2026 Simulation',
    period_start: new Date().toISOString().slice(0, 10),
    period_end: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    capex_total_idr: 0,
    capex_amort_months: 24,
    capex_ondemand_details: {} as any,
    capex_aggregator_details: {} as any,
    opex_server_idr: '' as any,
    opex_domain_ssl_idr: '' as any,
    opex_marketing_idr: '' as any,
    opex_team_salary_idr: '' as any,
    opex_insurance_idr: '' as any,
    opex_other_fixed_idr: '' as any,
    opex_tomtom_per_order_idr: '' as any,
    opex_zenziva_per_order_idr: '' as any,
    opex_cloud_storage_per_order_idr: '' as any,
    opex_cs_support_per_order_idr: '' as any,
    opex_dispute_reserve_idr: '' as any,
    opex_ondemand_details: {} as any,
    opex_aggregator_details: {} as any,
    tax_vat_pct: 11,
    tax_pph_pct: 2,
    payment_gateway_mdr_pct: 0,
    payment_gateway_fixed_idr: 0,
    payout_disbursement_fee_idr: 0,
    min_platform_fee_idr: 1500,
    max_discount_subsidy_pct: 20,
    estimated_orders_per_month: 3500,
    estimated_orders_ondemand_per_month: 2500,
    estimated_orders_aggregator_per_month: 1000,
    estimated_users_aggregator_per_month: 50,
    target_margin_ondemand_pct: 35,
    target_margin_aggregator_pct: 25,
    notes: 'Kalkulasi lengkap Keuangan, Pajak (VAT/PPh), & Tarif (Production VPS 4GB)'
  });

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num || 0);
  };

  const normalizeFormPayload = (c: any): PlatformCostConfig => ({
    ...c,
    period_label: c.period_label || 'Q3-2026 Simulation',
    period_start: c.period_start ? String(c.period_start).slice(0, 10) : new Date().toISOString().slice(0, 10),
    period_end: c.period_end ? String(c.period_end).slice(0, 10) : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    capex_total_idr: Number(c.capex_total_idr || 0),
    capex_amort_months: Number(c.capex_amort_months || 24),
    capex_ondemand_details: c.capex_ondemand_details || {},
    capex_aggregator_details: c.capex_aggregator_details || {},
    opex_server_idr: Number(c.opex_server_idr || 0),
    opex_domain_ssl_idr: Number(c.opex_domain_ssl_idr || 0),
    opex_marketing_idr: Number(c.opex_marketing_idr || 0),
    opex_team_salary_idr: Number(c.opex_team_salary_idr || 0),
    opex_insurance_idr: Number(c.opex_insurance_idr || 0),
    opex_other_fixed_idr: Number(c.opex_other_fixed_idr || 0),
    opex_tomtom_per_order_idr: Number(c.opex_tomtom_per_order_idr || 0),
    opex_zenziva_per_order_idr: Number(c.opex_zenziva_per_order_idr || 0),
    opex_cloud_storage_per_order_idr: Number(c.opex_cloud_storage_per_order_idr || 0),
    opex_cs_support_per_order_idr: Number(c.opex_cs_support_per_order_idr || 0),
    opex_dispute_reserve_idr: Number(c.opex_dispute_reserve_idr || 0),
    opex_ondemand_details: typeof c.opex_ondemand_details === 'string' ? JSON.parse(c.opex_ondemand_details) : (c.opex_ondemand_details || {}),
    opex_aggregator_details: typeof c.opex_aggregator_details === 'string' ? JSON.parse(c.opex_aggregator_details) : (c.opex_aggregator_details || {}),
    tax_vat_pct: Number(c.tax_vat_pct ?? 11),
    tax_pph_pct: Number(c.tax_pph_pct ?? 2),
    payment_gateway_mdr_pct: 0,
    payment_gateway_fixed_idr: 0,
    payout_disbursement_fee_idr: 0,
    min_platform_fee_idr: Number(c.min_platform_fee_idr ?? 1500),
    max_discount_subsidy_pct: Number(c.max_discount_subsidy_pct ?? 20),
    estimated_orders_per_month: Number(c.estimated_orders_per_month || 3500),
    estimated_orders_ondemand_per_month: Number(c.estimated_orders_ondemand_per_month ?? 2500),
    estimated_orders_aggregator_per_month: Number(c.estimated_orders_aggregator_per_month ?? 1000),
    estimated_users_aggregator_per_month: Number(c.estimated_users_aggregator_per_month ?? 50),
    target_margin_ondemand_pct: Number(c.target_margin_ondemand_pct || 15),
    target_margin_aggregator_pct: Number(c.target_margin_aggregator_pct || 10),
    notes: c.notes || ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cfgList, recList] = await Promise.all([
        CostIntelligenceApi.listConfigs(),
        CostIntelligenceApi.listRecommendations()
      ]);
      setConfigs(cfgList);
      setRecommendations(recList);

      if (cfgList.length > 0) {
        const activeOrFirst = cfgList.find(c => c.status === 'active') || cfgList[0];
        setSelectedConfig(activeOrFirst);
        if (activeOrFirst.id) {
          const bd = await CostIntelligenceApi.getBreakdown(activeOrFirst.id);
          setBreakdown(bd);
          setFormData(normalizeFormPayload(activeOrFirst));
        }
      }

      try {
        const [pricingRes, provRes] = await Promise.all([
          api.get('/admin/pricing').catch(() => null),
          api.get('/admin/logistics-providers').catch(() => null)
        ]);
        const pData = pricingRes?.data;
        const provList = Array.isArray(provRes?.data) ? provRes.data : [];
        const avgB2bDiscount = provList.length > 0
          ? Math.round(provList.reduce((acc: number, p: any) => acc + Number(p.discount_pct || 0), 0) / provList.length)
          : 20;

        setLogisticsParams(prev => ({
          ...prev,
          ondemand_base_fare_idr: Number(pData?.baseFare || prev.ondemand_base_fare_idr),
          ondemand_per_km_idr: Number(pData?.perKm || prev.ondemand_per_km_idr),
          aggregator_b2b_discount_pct: avgB2bDiscount || prev.aggregator_b2b_discount_pct
        }));
      } catch {
        // Ignore optional sync errors
      }
    } catch (error: any) {
      toast.error('Gagal memuat data Cost Intelligence: ' + (error?.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-sync sampleCustomerOngkir when logisticsParams change
  useEffect(() => {
    const calculated = Number(logisticsParams.ondemand_base_fare_idr || 10000) +
      Math.max(0, (Number(logisticsParams.ondemand_avg_km || 5.5) - 1)) * Number(logisticsParams.ondemand_per_km_idr || 2500);
    setSampleCustomerOngkir(calculated);
  }, [
    logisticsParams.ondemand_base_fare_idr,
    logisticsParams.ondemand_avg_km,
    logisticsParams.ondemand_per_km_idr
  ]);

  // Live simulation preview calculation (ensuring numeric operations)
  const opexOndemand = formData.opex_ondemand_details || {};
  const opexAggregator = formData.opex_aggregator_details || {};
  const capexOndemand = formData.capex_ondemand_details || {};
  const capexAggregator = formData.capex_aggregator_details || {};
  const amortMonths = Math.max(1, Number(formData.capex_amort_months || 24));

  const monthlyCapexAmortOndemand = Number(capexOndemand.total_idr || 0) / amortMonths;
  const monthlyCapexAmortAggregator = Number(capexAggregator.total_idr || 0) / amortMonths;
  const totalCapexAmort = monthlyCapexAmortOndemand + monthlyCapexAmortAggregator;

  const fixedMonthlyOpexOndemand =
    Number(opexOndemand.server_idr || 0) +
    Number(opexOndemand.domain_ssl_idr || 0) +
    Number(opexOndemand.marketing_idr || 0) +
    Number(opexOndemand.team_salary_idr || 0) +
    Number(opexOndemand.insurance_idr || 0) +
    Number(opexOndemand.other_fixed_idr || 0);

  const fixedMonthlyOpexAggregator =
    Number(opexAggregator.server_idr || 0) +
    Number(opexAggregator.domain_ssl_idr || 0) +
    Number(opexAggregator.marketing_idr || 0) +
    Number(opexAggregator.team_salary_idr || 0) +
    Number(opexAggregator.insurance_idr || 0) +
    Number(opexAggregator.other_fixed_idr || 0);

  const fixedTotalMonthlyOndemand = fixedMonthlyOpexOndemand + monthlyCapexAmortOndemand;
  const fixedTotalMonthlyAggregator = fixedMonthlyOpexAggregator + monthlyCapexAmortAggregator;
  const fixedTotalMonthly = fixedTotalMonthlyOndemand + fixedTotalMonthlyAggregator;

  const estOrdersOndemandMonthly = Math.max(1, Number(formData.estimated_orders_ondemand_per_month || 2500));
  const estOrdersAggregatorMonthly = Math.max(1, Number(formData.estimated_orders_aggregator_per_month || 1000));
  const estOrdersMonthly = estOrdersOndemandMonthly + estOrdersAggregatorMonthly;
  const estOrdersDaily = Math.ceil(estOrdersMonthly / 30);

  const fixedCostPerOrderOndemand = fixedTotalMonthlyOndemand / estOrdersOndemandMonthly;
  const fixedCostPerOrderAggregator = fixedTotalMonthlyAggregator / estOrdersAggregatorMonthly;

  const variablePerOrderOndemand =
    Number(opexOndemand.tomtom_per_order_idr || 0) +
    Number(opexOndemand.zenziva_per_order_idr || 0) +
    Number(opexOndemand.cloud_storage_per_order_idr || 0) +
    Number(opexOndemand.cs_support_per_order_idr || 0) +
    Number(opexOndemand.dispute_reserve_idr || 0) +
    Number(formData.payment_gateway_fixed_idr || 0) +
    Number(formData.payout_disbursement_fee_idr || 0);

  const variablePerOrderAggregator =
    Number(opexAggregator.tomtom_per_order_idr || 0) +
    Number(opexAggregator.zenziva_per_order_idr || 0) +
    Number(opexAggregator.cloud_storage_per_order_idr || 0) +
    Number(opexAggregator.cs_support_per_order_idr || 0) +
    Number(opexAggregator.dispute_reserve_idr || 0) +
    Number(formData.payment_gateway_fixed_idr || 0) +
    Number(formData.payout_disbursement_fee_idr || 0);

  const simulatedBepCostPerOrderOndemand = Math.ceil(fixedCostPerOrderOndemand + variablePerOrderOndemand);
  const simulatedBepCostPerOrderAggregator = Math.ceil(fixedCostPerOrderAggregator + variablePerOrderAggregator);

  const simVat = Number(formData.tax_vat_pct || 0) / 100;
  const simMdr = Number(formData.payment_gateway_mdr_pct || 0) / 100;
  const simMinFee = Number(formData.min_platform_fee_idr || 1500);

  const denomOndemand = Math.max(0.3, 1 - (Number(formData.target_margin_ondemand_pct || 0) / 100) - simVat - simMdr);
  const simulatedOnDemandFee = Math.max(simMinFee, Math.ceil(variablePerOrderOndemand / denomOndemand));

  // Aggregator relies purely on spread (discount dari 3PL), bukan handling fee tambahan
  // Formula: Platform beli di harga diskon 3PL, jual ke customer sama harga 3PL -> spread = keuntungan
  // Contoh: Harga 3PL = 10.000, Diskon B2B = 20% -> Platform beli 8.000, jual 10.000 -> Profit = 2.000

  // 360° Comprehensive Logistics & Aggregator Unit Economics (Standar 2026)
  const estCourierOngkirIdr = Number(logisticsParams.ondemand_base_fare_idr || 10000) +
    Math.max(0, (Number(logisticsParams.ondemand_avg_km || 5.5) - 1)) * Number(logisticsParams.ondemand_per_km_idr || 2500);
  const courierTakeRateProfitIdr = Math.round(estCourierOngkirIdr * (Number(logisticsParams.ondemand_courier_commission_pct || 0) / 100));

  const rawB2bDiscountPct = Number(logisticsParams.aggregator_b2b_discount_pct ?? 20);
  const rawCustDiscountPct = Number(logisticsParams.aggregator_customer_discount_pct ?? 5);
  const aggAvgPublishedIdr = Number(logisticsParams.aggregator_avg_published_idr || 20000);
  
  let effectiveCustDiscountPct = rawCustDiscountPct;
  const quotaPerUser = logisticsParams.aggregator_customer_discount_quota;
  const estUsersAggregatorMonthly = Math.max(1, Number(formData.estimated_users_aggregator_per_month || 50));
  
  if (quotaPerUser !== '' && Number(quotaPerUser) >= 0 && estOrdersAggregatorMonthly > 0) {
    const totalDiscountedOrdersMax = Number(quotaPerUser) * estUsersAggregatorMonthly;
    const discountedOrders = Math.min(totalDiscountedOrdersMax, estOrdersAggregatorMonthly);
    const normalOrders = estOrdersAggregatorMonthly - discountedOrders;
    effectiveCustDiscountPct = (discountedOrders * rawCustDiscountPct + normalOrders * 0) / estOrdersAggregatorMonthly;
  }

  const b2bSpreadMarginPct = Math.max(0, rawB2bDiscountPct - effectiveCustDiscountPct);
  const aggregatorSpreadProfitIdr = Math.round(aggAvgPublishedIdr * (b2bSpreadMarginPct / 100));

  const netProfitPerOrderOndemand = Math.max(0, Math.round(
    simulatedOnDemandFee * (1 - simVat - simMdr) + courierTakeRateProfitIdr - variablePerOrderOndemand
  ));
  // Aggregator profit = Spread - VAT on spread - MDR on full tariff - variable OPEX
  const mdrOnAggTariff = Math.round(aggAvgPublishedIdr * simMdr);
  const vatOnSpread = Math.round(aggregatorSpreadProfitIdr * simVat);
  const netProfitPerOrderAggregator = Math.max(0, Math.round(
    aggregatorSpreadProfitIdr - vatOnSpread - mdrOnAggTariff - variablePerOrderAggregator
  ));
  const monthlyNetOpProfitOndemand = Math.round(netProfitPerOrderOndemand * estOrdersOndemandMonthly);
  const monthlyNetOpProfitAggregator = Math.round(netProfitPerOrderAggregator * estOrdersAggregatorMonthly);
  const projectedMonthlyNetProfit = monthlyNetOpProfitOndemand + monthlyNetOpProfitAggregator - Math.round(fixedTotalMonthly);
  const ebitdaMonthly = (monthlyNetOpProfitOndemand + monthlyNetOpProfitAggregator) - (fixedMonthlyOpexOndemand + fixedMonthlyOpexAggregator);
  const totalModalAwalIdr = Number(capexOndemand.total_idr || 0) + Number(capexAggregator.total_idr || 0) + fixedMonthlyOpexOndemand + fixedMonthlyOpexAggregator;

  const avgOnDemandVatIdr = Math.round(simulatedOnDemandFee * simVat);
  const avgOnDemandCustomerTotal = estCourierOngkirIdr + simulatedOnDemandFee + avgOnDemandVatIdr;
  const monthlyRevenueOndemand = estOrdersOndemandMonthly * avgOnDemandCustomerTotal;
  const monthlyRevenueAggregator = estOrdersAggregatorMonthly * aggAvgPublishedIdr;
  const projectedMonthlyRevenue = monthlyRevenueOndemand + monthlyRevenueAggregator;

  const paybackMonths = ebitdaMonthly > 0
    ? Math.max(0.1, Number((totalModalAwalIdr / ebitdaMonthly).toFixed(1)))
    : ebitdaMonthly < 0 ? -1 : 0;
  const paybackDays = paybackMonths > 0 ? Math.round(paybackMonths * 30) : 0;

  const avgNetProfitPerOrder = estOrdersMonthly > 0 
    ? (monthlyNetOpProfitOndemand + monthlyNetOpProfitAggregator) / estOrdersMonthly 
    : 0;
  
  // Jika net profit per order negatif atau nol, kita tidak akan pernah BEP.
  const bepOrdersMonthly = avgNetProfitPerOrder > 0 ? Math.ceil(fixedTotalMonthly / avgNetProfitPerOrder) : -1;
  const bepOrdersDaily = bepOrdersMonthly > 0 ? Math.ceil(bepOrdersMonthly / 30) : -1;

  const dailyTargetOrders = bepOrdersDaily > 0 ? Math.max(bepOrdersDaily, estOrdersDaily) : estOrdersDaily;
  const avgRevenuePerOrder = estOrdersMonthly > 0 ? projectedMonthlyRevenue / estOrdersMonthly : 0;
  const dailyTargetRevenueIdr = Math.round(dailyTargetOrders * avgRevenuePerOrder);
  const dailyTargetNetProfitIdr = Math.round(dailyTargetOrders * avgNetProfitPerOrder);
  const minAverageTicketPerOrder = Math.max(15000, simulatedOnDemandFee * 6);

  // Customer Checkout Invoice Preview (On-Demand vs Aggregator)
  // sampleCustomerOngkir = state variable (input user untuk on-demand invoice preview)
  const sampleCourierCommissionPct = Number(logisticsParams.ondemand_courier_commission_pct || 20);
  const sampleCourierTakeRateIdr = Math.round(sampleCustomerOngkir * (sampleCourierCommissionPct / 100));
  const sampleCourierPayoutIdr = sampleCustomerOngkir - sampleCourierTakeRateIdr;

  const onDemandVatIdr = Math.round(simulatedOnDemandFee * simVat);
  const onDemandCustomerTotal = sampleCustomerOngkir + simulatedOnDemandFee + onDemandVatIdr;
  const sampleOnDemandGrossRevenueIdr = simulatedOnDemandFee + sampleCourierTakeRateIdr;
  const sampleOnDemandNetProfitIdr = Math.max(0, Math.round(
    simulatedOnDemandFee * (1 - simVat - simMdr) + sampleCourierTakeRateIdr - variablePerOrderOndemand
  ));

  // Aggregator: customer bayar tarif 3PL normal, platform dapat margin dari spread B2B discount
  const aggregatorCustomerTotal = aggAvgPublishedIdr; // Customer bayar harga normal 3PL

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      const cleanPayload = normalizeFormPayload(formData);
      const created = await CostIntelligenceApi.createConfig(cleanPayload);
      toast.success('Konfigurasi Biaya berhasil disimpan!');
      if (created.id) {
        await CostIntelligenceApi.generateRecommendation(created.id);
        toast.success('Rekomendasi harga berhasil digenerate untuk persetujuan Super Admin!');
        await fetchData();
        setActiveTab('approval');
      } else {
        await fetchData();
      }
    } catch (error: any) {
      toast.error('Gagal menyimpan konfigurasi: ' + (error?.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRecommendation = async (configId: string) => {
    try {
      await CostIntelligenceApi.generateRecommendation(configId);
      toast.success('Rekomendasi harga berhasil digenerate untuk persetujuan Super Admin');
      await fetchData();
      setActiveTab('approval');
    } catch (error: any) {
      toast.error('Gagal membuat rekomendasi: ' + (error?.message || 'Error'));
    }
  };

  const handleApproveRecommendation = async (recId: string) => {
    try {
      await CostIntelligenceApi.approveRecommendation(recId);
      toast.success('Rekomendasi harga disetujui & aktif di konfigurasi platform!');
      await fetchData();
    } catch (error: any) {
      toast.error('Gagal menyetujui rekomendasi: ' + (error?.message || 'Error'));
    }
  };

  const handleRejectRecommendation = async () => {
    if (!selectedRecId) return;
    try {
      await CostIntelligenceApi.rejectRecommendation(selectedRecId, rejectReason);
      toast.success('Rekomendasi harga ditolak');
      setRejectModalOpen(false);
      setRejectReason('');
      await fetchData();
    } catch (error: any) {
      toast.error('Gagal menolak rekomendasi: ' + (error?.message || 'Error'));
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header section with Super Admin Badge */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="h-3.5 w-3.5" /> Super Admin Exclusive
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Server className="h-3.5 w-3.5" /> VPS 4GB RAM Optimized
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Cost Intelligence & Auto-Pricing Engine
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Kalkulasi otomatis OPEX & CAPEX platform, Break-Even Point (BEP), dan rekomendasi harga On-Demand & Aggregator.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-sm font-medium border border-white/10 transition-all"
        >
          <RefreshCw className="h-4 w-4" /> Reload Data
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('calculator')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'calculator'
              ? 'border-primary text-white bg-white/5 rounded-t-xl'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Calculator className="h-4 w-4" /> Simulasi OPEX & CAPEX
        </button>
        <button
          onClick={() => setActiveTab('breakdown')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'breakdown'
              ? 'border-primary text-white bg-white/5 rounded-t-xl'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Analisis BEP & P&L
        </button>
        <button
          onClick={() => setActiveTab('approval')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all ${
            activeTab === 'approval'
              ? 'border-primary text-white bg-white/5 rounded-t-xl'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Persetujuan Harga Super Admin
          {recommendations.filter(r => r.status === 'pending_approval').length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-black">
              {recommendations.filter(r => r.status === 'pending_approval').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: SIMULASI OPEX & CAPEX */}
      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Config Panel */}
          <div className="lg:col-span-7 bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" /> Input Parameter Biaya Platform
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Periode Label</label>
                <input
                  type="text"
                  value={formData.period_label}
                  onChange={e => setFormData({ ...formData, period_label: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Vol. Resi On-Demand / bln</label>
                  <input
                    type="number"
                    value={formData.estimated_orders_ondemand_per_month === 0 ? '' : formData.estimated_orders_ondemand_per_month}
                    onChange={e => setFormData({ ...formData, estimated_orders_ondemand_per_month: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Vol. Resi Aggregator / bln</label>
                  <input
                    type="number"
                    value={formData.estimated_orders_aggregator_per_month === 0 ? '' : formData.estimated_orders_aggregator_per_month}
                    onChange={e => setFormData({ ...formData, estimated_orders_aggregator_per_month: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Est. Active Users Aggregator</label>
                  <input
                    type="number"
                    value={formData.estimated_users_aggregator_per_month === 0 ? '' : formData.estimated_users_aggregator_per_month}
                    onChange={e => setFormData({ ...formData, estimated_users_aggregator_per_month: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                1. CAPEX (Investasi Awal Infrastruktur)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">CAPEX On-Demand (IDR)</label>
                  <input
                    type="number"
                    value={formData.capex_ondemand_details?.total_idr === 0 ? '' : formData.capex_ondemand_details?.total_idr}
                    onChange={e => setFormData({ ...formData, capex_ondemand_details: { ...formData.capex_ondemand_details, total_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">CAPEX Aggregator (IDR)</label>
                  <input
                    type="number"
                    value={formData.capex_aggregator_details?.total_idr === 0 ? '' : formData.capex_aggregator_details?.total_idr}
                    onChange={e => setFormData({ ...formData, capex_aggregator_details: { ...formData.capex_aggregator_details, total_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Amortisasi (Bulan)</label>
                  <input
                    type="number"
                    value={formData.capex_amort_months === 0 ? '' : formData.capex_amort_months}
                    onChange={e => setFormData({ ...formData, capex_amort_months: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                2A. OPEX Tetap Bulanan (On-Demand)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">VPS Server (4GB RAM)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.server_idr === 0 ? '' : formData.opex_ondemand_details?.server_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, server_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Domain & SSL</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.domain_ssl_idr === 0 ? '' : formData.opex_ondemand_details?.domain_ssl_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, domain_ssl_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Gaji Karyawan / Tim</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.team_salary_idr === 0 ? '' : formData.opex_ondemand_details?.team_salary_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, team_salary_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Marketing / Iklan</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.marketing_idr === 0 ? '' : formData.opex_ondemand_details?.marketing_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, marketing_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Lainnya / Kontingensi</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.other_fixed_idr === 0 ? '' : formData.opex_ondemand_details?.other_fixed_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, other_fixed_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                2B. OPEX Tetap Bulanan (Aggregator)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">VPS Server (4GB RAM)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.server_idr === 0 ? '' : formData.opex_aggregator_details?.server_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, server_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Domain & SSL</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.domain_ssl_idr === 0 ? '' : formData.opex_aggregator_details?.domain_ssl_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, domain_ssl_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Gaji Karyawan / Tim</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.team_salary_idr === 0 ? '' : formData.opex_aggregator_details?.team_salary_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, team_salary_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Marketing / Iklan</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.marketing_idr === 0 ? '' : formData.opex_aggregator_details?.marketing_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, marketing_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Lainnya / Kontingensi</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.other_fixed_idr === 0 ? '' : formData.opex_aggregator_details?.other_fixed_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, other_fixed_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                3A. OPEX Variabel per Order (On-Demand)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">TomTom Maps / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.tomtom_per_order_idr === 0 ? '' : formData.opex_ondemand_details?.tomtom_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, tomtom_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Zenziva OTP / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.zenziva_per_order_idr === 0 ? '' : formData.opex_ondemand_details?.zenziva_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, zenziva_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cloud Storage Resi (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.cloud_storage_per_order_idr === 0 ? '' : formData.opex_ondemand_details?.cloud_storage_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, cloud_storage_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">CS Support / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.cs_support_per_order_idr === 0 ? '' : formData.opex_ondemand_details?.cs_support_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, cs_support_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cadangan Klaim / Dispute (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_ondemand_details?.dispute_reserve_idr === 0 ? '' : formData.opex_ondemand_details?.dispute_reserve_idr}
                    onChange={e => setFormData({ ...formData, opex_ondemand_details: { ...formData.opex_ondemand_details, dispute_reserve_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                3B. OPEX Variabel per Order (Aggregator)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">TomTom Maps / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.tomtom_per_order_idr === 0 ? '' : formData.opex_aggregator_details?.tomtom_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, tomtom_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Zenziva OTP / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.zenziva_per_order_idr === 0 ? '' : formData.opex_aggregator_details?.zenziva_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, zenziva_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cloud Storage Resi (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.cloud_storage_per_order_idr === 0 ? '' : formData.opex_aggregator_details?.cloud_storage_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, cloud_storage_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">CS Support / order (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.cs_support_per_order_idr === 0 ? '' : formData.opex_aggregator_details?.cs_support_per_order_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, cs_support_per_order_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Cadangan Klaim / Dispute (IDR)</label>
                  <input
                    type="number"
                    value={formData.opex_aggregator_details?.dispute_reserve_idr === 0 ? '' : formData.opex_aggregator_details?.dispute_reserve_idr}
                    onChange={e => setFormData({ ...formData, opex_aggregator_details: { ...formData.opex_aggregator_details, dispute_reserve_idr: e.target.value === '' ? '' as any : Number(e.target.value) } })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
                4. Parameter Pajak (VAT/PPh)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">PPN / VAT (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.tax_vat_pct === 0 ? '' : formData.tax_vat_pct}
                    onChange={e => setFormData({ ...formData, tax_vat_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">PPh Komisi / Badan (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.tax_pph_pct === 0 ? '' : formData.tax_pph_pct}
                    onChange={e => setFormData({ ...formData, tax_pph_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">
                5. Target Margin Laba & Kebijakan Tarif Minimum
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Target Margin On-Demand (%)</label>
                  <input
                    type="number"
                    value={formData.target_margin_ondemand_pct === 0 ? '' : formData.target_margin_ondemand_pct}
                    onChange={e => setFormData({ ...formData, target_margin_ondemand_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Target Margin Aggregator (%)</label>
                  <input
                    type="number"
                    value={formData.target_margin_aggregator_pct === 0 ? '' : formData.target_margin_aggregator_pct}
                    onChange={e => setFormData({ ...formData, target_margin_aggregator_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tarif Minimum Platform (IDR)</label>
                  <input
                    type="number"
                    value={formData.min_platform_fee_idr === 0 ? '' : formData.min_platform_fee_idr}
                    onChange={e => setFormData({ ...formData, min_platform_fee_idr: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Batas Subsidi Diskon (%)</label>
                  <input
                    type="number"
                    value={formData.max_discount_subsidy_pct === 0 ? '' : formData.max_discount_subsidy_pct}
                    onChange={e => setFormData({ ...formData, max_discount_subsidy_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SEKSI 6: PARAMETER LOGISTIK ON-DEMAND & AGGREGATOR MARGIN SPREAD (AUTO-SYNCED) */}
            <div className="border-t border-white/10 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-400" />
                  6. Parameter Logistik & Spread Aggregator
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Auto-Synced dari Modul Pricing & Ekspedisi
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tarif Dasar Kurir (0-1 km)</label>
                  <input
                    type="number"
                    value={logisticsParams.ondemand_base_fare_idr}
                    onChange={e => setLogisticsParams({ ...logisticsParams, ondemand_base_fare_idr: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tarif per KM Berikutnya (IDR)</label>
                  <input
                    type="number"
                    value={logisticsParams.ondemand_per_km_idr}
                    onChange={e => setLogisticsParams({ ...logisticsParams, ondemand_per_km_idr: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Rata-Rata Jarak Order (KM)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={logisticsParams.ondemand_avg_km}
                    onChange={e => setLogisticsParams({ ...logisticsParams, ondemand_avg_km: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Potongan Komisi Kurir (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={logisticsParams.ondemand_courier_commission_pct}
                    onChange={e => setLogisticsParams({ ...logisticsParams, ondemand_courier_commission_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tarif Resmi Ekspedisi / Resi (IDR)</label>
                  <input
                    type="number"
                    value={logisticsParams.aggregator_avg_published_idr}
                    onChange={e => setLogisticsParams({ ...logisticsParams, aggregator_avg_published_idr: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Diskon B2B Ekspedisi (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={logisticsParams.aggregator_b2b_discount_pct}
                    onChange={e => setLogisticsParams({ ...logisticsParams, aggregator_b2b_discount_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Diskon ke Customer (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={logisticsParams.aggregator_customer_discount_pct}
                    onChange={e => setLogisticsParams({ ...logisticsParams, aggregator_customer_discount_pct: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Kuota Diskon (Bulan)</label>
                  <input
                    type="number"
                    placeholder="Kosong = Semua"
                    value={logisticsParams.aggregator_customer_discount_quota}
                    onChange={e => setLogisticsParams({ ...logisticsParams, aggregator_customer_discount_quota: e.target.value === '' ? '' as any : Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder:text-zinc-600"
                  />
                </div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3.5 flex flex-wrap items-center justify-between text-xs text-emerald-300 gap-2">
                <div>
                  Est. Ongkir Kurir: <strong className="text-white">Rp {estCourierOngkirIdr.toLocaleString('id-ID')}</strong> (Komisi: Rp {courierTakeRateProfitIdr.toLocaleString('id-ID')})
                </div>
                <div>
                  Net Spread B2B Ekspedisi: <strong className="text-white">Rp {aggregatorSpreadProfitIdr.toLocaleString('id-ID')} / resi</strong> ({b2bSpreadMarginPct}% margin)
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button
                onClick={handleSaveConfig}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20 transition-all"
              >
                <Plus className="h-4 w-4" /> Simpan & Generate Rekomendasi
              </button>
            </div>
          </div>

          {/* Live BEP & Pricing Simulation Widget */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-primary/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" /> Live Unit Economics & BEP Preview
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/10 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-zinc-400 block">Total OPEX + CAPEX / Bulan</span>
                    <span className="text-lg font-bold text-white">{formatIDR(fixedTotalMonthly)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">Total Order / Bulan</span>
                    <span className="text-lg font-bold text-emerald-400">{estOrdersMonthly.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/10 text-center">
                    <span className="text-xs text-zinc-400 block">On-Demand Cost / Order</span>
                    <span className="text-sm font-bold text-emerald-400 block mt-1">Fixed: {formatIDR(fixedCostPerOrderOndemand)}</span>
                    <span className="text-sm font-bold text-blue-400 block">Var: {formatIDR(variablePerOrderOndemand)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-white/10 text-center">
                    <span className="text-xs text-zinc-400 block">Aggregator Cost / Order</span>
                    <span className="text-sm font-bold text-emerald-400 block mt-1">Fixed: {formatIDR(fixedCostPerOrderAggregator)}</span>
                    <span className="text-sm font-bold text-blue-400 block">Var: {formatIDR(variablePerOrderAggregator)}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 grid grid-cols-2 gap-2 text-center text-xs">
                  <div>
                    <span className="text-zinc-500 block">PPN / VAT</span>
                    <span className="font-semibold text-rose-400">{formData.tax_vat_pct}%</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Min Tarif Platform</span>
                    <span className="font-semibold text-emerald-400">{formatIDR(formData.min_platform_fee_idr || 0)}</span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex justify-between items-center">
                    <div>
                      <span className="text-xs text-primary-light font-medium block">Rekomendasi Platform Fee On-Demand</span>
                      <span className="text-xs text-zinc-400">Net sesudah Pajak {formData.tax_vat_pct}% (Potong Saldo Dompet)</span>
                    </div>
                    <span className="text-2xl font-black text-white">{formatIDR(simulatedOnDemandFee)}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                    <div>
                      <span className="text-xs text-emerald-400 font-medium block">Estimasi Spread Aggregator (Profit)</span>
                      <span className="text-xs text-zinc-400">Berdasarkan {b2bSpreadMarginPct}% margin dari diskon 3PL</span>
                    </div>
                    <span className="text-2xl font-black text-white">{formatIDR(aggregatorSpreadProfitIdr)}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="p-3 rounded-xl bg-zinc-900/90 border border-white/5 text-xs text-zinc-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Catatan: Tarif kurir dibayar langsung oleh customer (atau di-pull real-time dari ekspedisi aggregator), sehingga tidak membebani OPEX platform.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* WIDGET 2: PREDICTIVE ROI PAYBACK & TARGET HARIAN (STANDAR 2026) */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" /> AI Predictive BEP & Payback ROI
                </h3>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Standar 2026
                </span>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-zinc-950 border border-emerald-500/20 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-zinc-400 block">Waktu Kembali Modal (Payback Period)</span>
                    <span className="text-2xl font-black text-emerald-400">
                      {paybackMonths > 0 ? `${paybackMonths} Bulan` : paybackMonths === -1 ? 'Merugi (Burn Rate)' : 'BEP Seketika'}
                    </span>
                    {paybackMonths > 0 && (
                      <span className="text-xs text-zinc-500 block">Estimasi ~{paybackDays} Hari Operasional</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">Total Modal Awal (CAPEX + 1 Bln)</span>
                    <span className="text-lg font-bold text-white">{formatIDR(totalModalAwalIdr)}</span>
                  </div>
                </div>

                <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-zinc-950/70">
                  <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Perincian Target Harian (Daily Operational Target)
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-white/5">
                      <span className="text-[11px] text-zinc-400 block">Minimal Order / Hari</span>
                      <span className="text-lg font-extrabold text-amber-400">
                        {bepOrdersDaily > 0 ? `${bepOrdersDaily} order/hari` : bepOrdersDaily === -1 ? 'Merugi Terus' : '0 order/hari'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-white/5">
                      <span className="text-[11px] text-zinc-400 block">Target Omzet / Hari</span>
                      <span className="text-lg font-extrabold text-blue-400">{formatIDR(dailyTargetRevenueIdr)}</span>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-white/5">
                      <span className="text-[11px] text-zinc-400 block">Target Laba Bersih / Hari</span>
                      <span className="text-lg font-extrabold text-emerald-400">{formatIDR(dailyTargetNetProfitIdr)}</span>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-white/5">
                      <span className="text-[11px] text-zinc-400 block">Rata-Rata Transaksi Minimal</span>
                      <span className="text-lg font-extrabold text-purple-400">{formatIDR(minAverageTicketPerOrder)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* WIDGET 3: SIMULASI TAGIHAN CUSTOMER (CHECKOUT RECEIPT 2026) */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-blue-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-400" /> Simulasi Tagihan Customer (Checkout)
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Ongkir Ekspedisi/Kurir:</span>
                  <input
                    type="number"
                    step="1000"
                    value={sampleCustomerOngkir}
                    onChange={e => setSampleCustomerOngkir(e.target.value === '' ? '' : e.target.value === '' ? '' as any : Number(e.target.value))}
                    className="w-24 bg-zinc-950 border border-white/15 rounded-lg px-2 py-1 text-xs text-white text-right focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* On-Demand Receipt Card */}
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-amber-400">ON-DEMAND (KURIR LANGSUNG)</span>
                    <span className="text-[10px] text-amber-300/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Kurir {100 - sampleCourierCommissionPct}% • Platform {sampleCourierCommissionPct}%
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Tarif Jarak Kurir</span>
                        <span className="text-zinc-200 font-medium">{formatIDR(sampleCustomerOngkir)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 flex justify-between mt-0.5 pl-2">
                        <span>↳ Hak Kurir ({100 - sampleCourierCommissionPct}%): {formatIDR(sampleCourierPayoutIdr)}</span>
                        <span className="text-amber-400/90">↳ Komisi Platform ({sampleCourierCommissionPct}%): {formatIDR(sampleCourierTakeRateIdr)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Platform Layanan (Fee) <span className="text-[10px] text-zinc-500">(100% Platform)</span></span>
                      <span className="text-zinc-200 font-medium">{formatIDR(simulatedOnDemandFee)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>PPN {formData.tax_vat_pct || 11}%</span>
                      <span className="text-zinc-200 font-medium">{formatIDR(onDemandVatIdr)}</span>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Total Customer</span>
                    <span className="text-sm font-black text-amber-400">{formatIDR(onDemandCustomerTotal)}</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1 text-[11px]">
                    <div className="flex justify-between text-amber-300/80">
                      <span>2 Sumber Revenue (Fee + Komisi {sampleCourierCommissionPct}%)</span>
                      <span className="font-semibold text-amber-200">{formatIDR(sampleOnDemandGrossRevenueIdr)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-amber-500/20 pt-1">
                      <span className="text-amber-300 font-bold">Net Profit Platform/Order</span>
                      <span className="font-extrabold text-white">{formatIDR(sampleOnDemandNetProfitIdr)}</span>
                    </div>
                  </div>
                </div>

                {/* Aggregator Receipt Card */}
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-emerald-400">AGGREGATOR (JNE/J&T/SICEPAT)</span>
                    <span className="text-[10px] text-zinc-500">Ekspedisi Logistik</span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Tarif Ekspedisi Logistik (Published)</span>
                      <span className="text-zinc-200 font-medium">{formatIDR(aggAvgPublishedIdr)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Spread Keuntungan (Platform)</span>
                      <span className="text-emerald-300 font-medium">{formatIDR(aggregatorSpreadProfitIdr)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Beban OPEX per Order</span>
                      <span className="text-rose-400 font-medium">-{formatIDR(variablePerOrderAggregator)}</span>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Total Customer</span>
                    <span className="text-sm font-black text-emerald-400">{formatIDR(aggregatorCustomerTotal)}</span>
                  </div>

                  <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center text-[11px]">
                    <span className="text-emerald-300">Net Profit Platform/Order</span>
                    <span className="font-bold text-white">{formatIDR(netProfitPerOrderAggregator)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* WIDGET 4: PROYEKSI LABA/RUGI BULANAN (MONTHLY P&L) */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-purple-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-400" /> Proyeksi Laba/Rugi Bulanan (Monthly P&L)
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-blue-500/20">
                    <span className="text-xs text-blue-400 font-bold mb-2 block">TOTAL OMZET (REVENUE KOTOR)</span>
                    <div className="space-y-1.5 text-xs text-zinc-400">
                      <div className="flex justify-between">
                        <span title="Total yang dibayar Customer + Ongkir">On-Demand</span>
                        <span className="text-white font-medium">{formatIDR(monthlyRevenueOndemand)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span title="Total dari tarif reguler Ekspedisi">Aggregator</span>
                        <span className="text-white font-medium">{formatIDR(monthlyRevenueAggregator)}</span>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                        <span className="font-bold text-zinc-300">Total Omzet / Bulan</span>
                        <span className="text-blue-400 font-bold">{formatIDR(projectedMonthlyRevenue)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-bold text-zinc-400">Estimasi / Tahun</span>
                        <span className="text-blue-300 font-bold">{formatIDR(projectedMonthlyRevenue * 12)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-rose-500/20">
                    <span className="text-xs text-rose-400 font-bold mb-2 block">TOTAL PENGELUARAN</span>
                    <div className="space-y-1.5 text-xs text-zinc-400">
                      <div className="flex justify-between">
                        <span title="Termasuk Server, Domain, Gaji, Marketing & Kontingensi">OPEX Tetap (Gaji, Server, dll)</span>
                        <span className="text-white font-medium">{formatIDR(fixedTotalMonthly - totalCapexAmort)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Amortisasi CAPEX (Modal)</span>
                        <span className="text-white font-medium">{formatIDR(totalCapexAmort)}</span>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                        <span className="font-bold text-zinc-300">Total OPEX Bulanan</span>
                        <span className="text-rose-400 font-bold">{formatIDR(fixedTotalMonthly)}</span>
                      </div>
                      <div className="flex justify-between mt-2">
                        <span>OPEX Variabel / Bulan</span>
                        <span className="text-white font-medium">{formatIDR((variablePerOrderOndemand * estOrdersOndemandMonthly) + (variablePerOrderAggregator * estOrdersAggregatorMonthly))}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-emerald-500/20">
                    <span className="text-xs text-emerald-400 font-bold mb-2 block">TOTAL LABA KOTOR (GROSS MARGIN)</span>
                    <div className="space-y-1.5 text-xs text-zinc-400">
                      <div className="flex justify-between text-amber-300/80">
                        <span>On-Demand ({estOrdersOndemandMonthly.toLocaleString('id-ID')} order)</span>
                        <span className="text-white font-medium">{formatIDR(monthlyNetOpProfitOndemand)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-300/80">
                        <span>Aggregator ({estOrdersAggregatorMonthly.toLocaleString('id-ID')} order)</span>
                        <span className="text-white font-medium">{formatIDR(monthlyNetOpProfitAggregator)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl border flex justify-between items-center ${projectedMonthlyNetProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                  <div>
                    <span className={`text-xs font-bold block ${projectedMonthlyNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      STATUS BULANAN: {projectedMonthlyNetProfit >= 0 ? 'PROFIT / LABA BERSIH' : 'RUGI / BURN RATE'}
                    </span>
                    <span className="text-xs text-zinc-400 block mt-1">Setelah dikurangi semua OPEX Tetap & CAPEX bulanan</span>
                  </div>
                  <span className={`text-2xl font-black ${projectedMonthlyNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {projectedMonthlyNetProfit >= 0 ? '+' : ''}{formatIDR(projectedMonthlyNetProfit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: ANALISIS BEP & P&L */}
      {activeTab === 'breakdown' && (
        <div className="space-y-6">
          {breakdown ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <span className="text-xs text-zinc-400 font-medium">BEP Cost per Order</span>
                <div className="text-2xl font-bold text-amber-400 mt-2">
                  {formatIDR(breakdown.bep_cost_per_order_idr)}
                </div>
                <span className="text-xs text-zinc-500 mt-1 block">
                  Batas impas minimal per order
                </span>
              </div>

              <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <span className="text-xs text-zinc-400 font-medium">Fee On-Demand Rekomendasi</span>
                <div className="text-2xl font-bold text-primary-light mt-2">
                  {formatIDR(breakdown.recommended_ondemand_platform_fee_idr)}
                </div>
                <span className="text-xs text-zinc-500 mt-1 block">
                  Margin {breakdown.target_margin_ondemand_pct}%
                </span>
              </div>

              <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <span className="text-xs text-zinc-400 font-medium">Fee Aggregator Rekomendasi</span>
                <div className="text-2xl font-bold text-emerald-400 mt-2">
                  {formatIDR(breakdown.recommended_aggregator_handling_fee_idr)}
                </div>
                <span className="text-xs text-zinc-500 mt-1 block">
                  Margin {breakdown.target_margin_aggregator_pct}%
                </span>
              </div>

              <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <span className="text-xs text-zinc-400 font-medium">Aktual Net P&L Periode Ini</span>
                <div className="text-2xl font-bold text-white mt-2">
                  {formatIDR(breakdown.actual_net_pnl_idr || 0)}
                </div>
                <span className="text-xs text-zinc-500 mt-1 block">
                  Berdasarkan transaksi riil orders
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-zinc-900/40 border border-white/5 rounded-2xl">
              <AlertCircle className="h-10 w-10 text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">Belum ada konfigurasi aktif. Silakan pilih atau simpan konfigurasi di tab simulasi.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: PERSETUJUAN SUPER ADMIN */}
      {activeTab === 'approval' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">
              Daftar Rekomendasi Harga & Status Approval
            </h3>

            {recommendations.length === 0 ? (
              <p className="text-zinc-400 text-sm">Belum ada rekomendasi harga yang diajukan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="text-xs uppercase text-zinc-400 border-b border-white/10">
                    <tr>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">BEP / Order</th>
                      <th className="py-3 px-4">Fee On-Demand</th>
                      <th className="py-3 px-4">Fee Aggregator</th>
                      <th className="py-3 px-4">Proyeksi Laba / Bulan</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi Super Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {recommendations.map(rec => (
                      <tr key={rec.id} className="hover:bg-white/5">
                        <td className="py-4 px-4 font-medium">{new Date(rec.created_at).toLocaleDateString('id-ID')}</td>
                        <td className="py-4 px-4 text-amber-400 font-semibold">{formatIDR(rec.bep_cost_per_order_idr)}</td>
                        <td className="py-4 px-4 text-primary-light font-bold">{formatIDR(rec.recommended_ondemand_platform_fee_idr)}</td>
                        <td className="py-4 px-4 text-emerald-400 font-bold">{formatIDR(rec.recommended_aggregator_handling_fee_idr)}</td>
                        <td className="py-4 px-4 text-white font-semibold">{formatIDR(rec.projected_monthly_profit_idr)}</td>
                        <td className="py-4 px-4">
                          {rec.status === 'pending_approval' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Menunggu Approval
                            </span>
                          )}
                          {rec.status === 'approved' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                            </span>
                          )}
                          {rec.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              <XCircle className="h-3.5 w-3.5" /> Ditolak
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {rec.status === 'pending_approval' && (
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => handleApproveRecommendation(rec.id)}
                                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs transition-all"
                              >
                                Setujui ke Production
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedRecId(rec.id);
                                  setRejectModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-semibold text-xs transition-all"
                              >
                                Tolak
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4"
            >
              <h3 className="text-lg font-bold text-white">Alasan Penolakan Rekomendasi</h3>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Tulis alasan mengapa rekomendasi harga ini ditolak..."
                rows={4}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300"
                >
                  Batal
                </button>
                <button
                  onClick={handleRejectRecommendation}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold text-white"
                >
                  Konfirmasi Tolak
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
