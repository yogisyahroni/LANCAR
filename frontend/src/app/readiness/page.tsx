'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReadiness, activateThreeLegs } from '@/lib/api';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  TrendingUp,
  MapPin,
  Package,
  Users,
  Info,
  Download,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  Activity,
  Lock,
  KeyRound,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function ReadinessDashboard() {
  const queryClient = useQueryClient();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [justification, setJustification] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const { data, isLoading, error, isRefetching } = useQuery({
    queryKey: ['readiness-three-legs'],
    queryFn: fetchReadiness,
    refetchInterval: 60000, // Auto-sync every minute
  });

  useEffect(() => {
    if (data) {
      setLastRefreshed(new Date());
      if (data.can_activate) {
        // Subtle hint of readiness
        console.log("System Sentinel: 3-Leg Protocol Primed.");
      }
    }
  }, [data]);

  const handleManualRefresh = () => {
    toast.promise(queryClient.invalidateQueries({ queryKey: ['readiness-three-legs'] }), {
      loading: 'Syncing with operational nodes...',
      success: 'Readiness data synchronized.',
      error: 'Failed to sync data.',
    });
  };

  const handleActivateClick = () => {
    if (!data?.can_activate) {
      toast.error('Activation Locked', {
        description: 'System threshold targets not yet met for safe activation.',
      });
      return;
    }
    setIs2FAModalOpen(true);
  };

  const handleFinalActivation = async () => {
    if (otpCode.length !== 6) {
      toast.error('Verification Failed', {
        description: 'Please enter a valid 6-digit TOTP code.',
      });
      return;
    }

    if (!justification.trim()) {
      toast.error('Audit Required', {
        description: 'Please provide a justification for this high-impact action.',
      });
      return;
    }

    setIsActivating(true);
    try {
      await activateThreeLegs({
        totp_code: otpCode,
        justification: justification
      });
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00E5FF', '#007BFF', '#FFFFFF']
      });

      toast.success('3-Leg Model Activated', {
        description: 'Relay nodes are transitioning to the new operational state.',
      });
      setIs2FAModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['readiness-three-legs'] });
    } catch (err: any) {
      toast.error('Activation Error', {
        description: err.response?.data?.message || 'Failed to verify TOTP or authorize activation.',
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    setIsExporting(true);
    const exportToast = toast.loading('Generating Readiness Report...');
    
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0A0A0B'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`3-Leg_Readiness_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast.success('Report Exported', { id: exportToast });
    } catch (err) {
      toast.error('Export Failed', { id: exportToast });
    } finally {
      setIsExporting(false);
    }
  };

  const handleHoverConfetti = () => {
    if (data?.can_activate) {
      confetti({
        particleCount: 40,
        spread: 40,
        origin: { y: 0.7 },
        colors: ['#00E5FF', '#FFFFFF']
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 pb-12 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-white/5 rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-white/5 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
            <div className="h-10 w-48 bg-white/5 rounded-xl animate-pulse" />
          </div>
        </header>
        <div className="h-48 w-full bg-white/5 rounded-[2rem] animate-pulse border border-white/10" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-64 bg-white/5 rounded-[2rem] animate-pulse border border-white/10" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="h-20 w-20 rounded-full bg-danger/10 flex items-center justify-center border border-danger/20">
          <XCircle className="h-10 w-10 text-danger" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Synchronization Error</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Unable to connect to the operational metrics engine. This could be due to network latency or database maintenance.
          </p>
        </div>
        <Button onClick={handleManualRefresh} variant="secondary" className="rounded-xl px-8">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry Connection
        </Button>
      </div>
    );
  }

  const rData = data?.readiness_data || {};
  const isOverallReady = data?.overall_ready ?? false;

  return (
    <div className="space-y-8 pb-12 overflow-x-hidden relative" ref={dashboardRef}>
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            3-Leg Activation Readiness
            {isRefetching && <RefreshCw className="h-5 w-5 text-primary animate-spin" />}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Last auto-sync: {lastRefreshed.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="secondary" 
            className="rounded-xl border border-white/5 hover:bg-white/10 transition-all h-12"
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            <Download className={cn("mr-2 h-4 w-4", isExporting && "animate-bounce")} />
            Export Report
          </Button>
          <Button 
            variant="secondary" 
            className="rounded-xl border border-white/5 hover:bg-white/10 transition-all h-12"
            onClick={handleManualRefresh}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isRefetching && "animate-spin")} />
            Sync
          </Button>
          <div className="h-8 w-[1px] bg-border mx-2 hidden md:block" />
          <Button 
            variant={data?.can_activate ? 'primary' : 'secondary'} 
            disabled={!data?.can_activate} 
            className={cn(
              "px-8 rounded-xl h-12 font-bold shadow-lg transition-all duration-300",
              data?.can_activate && "shadow-primary/20 hover:scale-[1.05] active:scale-[0.98] ring-2 ring-primary/20"
            )}
            onClick={handleActivateClick}
            onMouseEnter={handleHoverConfetti}
          >
            {data?.can_activate ? (
              <>
                Activate 3-Leg Model
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Activation Locked
              </>
            )}
          </Button>
        </div>
      </motion.header>

      {/* Main Readiness Status Banner */}
      <Card glass className={cn(
        "border-2 relative overflow-hidden p-8 transition-colors duration-700",
        isOverallReady ? "border-success/30 bg-success/[0.02]" : "border-warning/30 bg-warning/[0.02]"
      )}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <motion.div 
              initial={false}
              animate={{ 
                scale: isOverallReady ? [1, 1.1, 1] : 1,
                rotate: isOverallReady ? [0, 5, -5, 0] : 0
              }}
              transition={{ repeat: isOverallReady ? Infinity : 0, duration: 2 }}
              className={cn(
                "h-24 w-24 rounded-[2rem] flex items-center justify-center shadow-2xl transition-all duration-500 shrink-0",
                isOverallReady 
                  ? "bg-success/20 text-success border border-success/30" 
                  : "bg-warning/20 text-warning border border-warning/30"
              )}
            >
              {isOverallReady ? (
                <CheckCircle2 className="h-12 w-12" />
              ) : (
                <Activity className="h-12 w-12 animate-pulse" />
              )}
            </motion.div>
            <div className="text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h2 className="text-3xl font-black text-white tracking-tighter">
                  {isOverallReady ? 'SENTINEL-READY' : 'PREPARING PROTOCOL'}
                </h2>
                <StatusBadge 
                  status={isOverallReady ? 'success' : 'warning'} 
                  label={isOverallReady ? 'CERTIFIED' : 'PENDING STABILIZATION'} 
                  className="mt-1 md:mt-0"
                />
              </div>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                {isOverallReady 
                  ? 'Strategic operational equilibrium achieved. All relay nodes report optimal density and SLA stability. System is primed for 3-leg deployment.' 
                  : 'Predictive analysis indicates sub-optimal conditions. Mandatory threshold targets for courier density and field validation are currently in variance.'}
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-center md:items-end p-6 rounded-2xl bg-white/[0.03] border border-white/5 min-w-[200px]">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">Estimated Clearance</span>
            <span className="text-5xl font-black text-primary">
              {data?.estimated_ready_in_weeks === 0 ? 'NOW' : `~${data?.estimated_ready_in_weeks}W`}
            </span>
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-success">
              <TrendingUp className="h-3 w-3" />
              +12.4% vs LAST CYCLE
            </div>
          </div>
        </div>
      </Card>

      {/* Operational Gates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Gate 01: SLA Stability */}
        <Card delay={0.1} className="lg:col-span-2 flex flex-col p-8 group hover:border-primary/40 transition-all duration-500">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-[10px]">
                <TrendingUp className="h-4 w-4" />
                Gate 01: SLA Stability
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">Rolling 2-Leg SLA</h3>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-3xl font-black transition-colors",
                (rData.sla_2_leg?.current ?? 0) >= (rData.sla_2_leg?.target ?? 93) ? "text-success" : "text-white"
              )}>
                {rData.sla_2_leg?.current ?? 0}%
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Target: {rData.sla_2_leg?.target ?? 93}%</div>
            </div>
          </div>

          <div className="flex-1 min-h-[180px] relative mt-4">
            <svg viewBox="0 0 400 100" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="20" x2="400" y2="20" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4 4" />
              <line x1="0" y1="80" x2="400" y2="80" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4 4" />
              
              {rData.sla_2_leg?.history && (
                <>
                  <path
                    d={`M ${rData.sla_2_leg.history.map((v: number, i: number) => 
                      `${(i / (rData.sla_2_leg.history.length - 1)) * 400} ${100 - (v - 80) * 4}`
                    ).join(' L ')}`}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-draw-path"
                  />
                  <path
                    d={`M 0 100 L ${rData.sla_2_leg.history.map((v: number, i: number) => 
                      `${(i / (rData.sla_2_leg.history.length - 1)) * 400} ${100 - (v - 80) * 4}`
                    ).join(' L ')} L 400 100 Z`}
                    fill="url(#chartGradient)"
                  />
                  {rData.sla_2_leg.history.map((v: number, i: number) => (
                    <motion.circle
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      cx={(i / (rData.sla_2_leg.history.length - 1)) * 400}
                      cy={100 - (v - 80) * 4}
                      r="4"
                      fill="var(--color-surface-raised)"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                      className="hover:r-6 transition-all cursor-crosshair"
                    />
                  ))}
                </>
              )}
            </svg>
          </div>
          
          <div className="mt-8 p-5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed italic font-medium">
                "{rData.sla_2_leg?.description ?? 'SLA 2-Kaki stability requirement for relay cutover.'}"
              </p>
            </div>
          </div>
        </Card>

        {/* Gate 02: Network Density */}
        <Card delay={0.2} className="p-8 group hover:border-primary/40 transition-all duration-500">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-[10px]">
                <Users className="h-4 w-4" />
                Gate 02: Network Density
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">Zone Density</h3>
            </div>
            <StatusBadge 
              status={(rData.courier_density?.current ?? 0) >= (rData.courier_density?.target ?? 30) ? "success" : "warning"} 
              label={`${rData.courier_density?.current ?? 0} AVG`} 
            />
          </div>

          <div className="space-y-4">
            {(rData.courier_density?.zones ?? []).map((zone: any, idx: number) => (
              <motion.div 
                key={zone.name} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="p-4 rounded-2xl bg-surface border border-white/5 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{zone.name}</span>
                  {zone.ready ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-warning animate-spin-slow" />
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{zone.count}</span>
                  <span className="text-xs font-bold text-muted-foreground">/ {rData.courier_density?.target ?? 30} COURIERS</span>
                </div>
                <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((zone.count / (rData.courier_density?.target ?? 30)) * 100, 100)}%` }}
                    transition={{ duration: 1.5, ease: "circOut", delay: 0.5 + idx * 0.1 }}
                    className={cn(
                      "h-full rounded-full transition-colors duration-500",
                      zone.ready ? "bg-success shadow-[0_0_8px_rgba(var(--success-rgb),0.4)]" : "bg-warning shadow-[0_0_8px_rgba(var(--warning-rgb),0.4)]"
                    )} 
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* Gate 03: Field Validation */}
        <Card delay={0.3} className="flex flex-col p-8 group hover:border-primary/40 transition-all duration-500">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-[10px]">
                <MapPin className="h-4 w-4" />
                Gate 03: Validation
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">Meetup Points</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">{rData.meetup_points?.current ?? 0}</span>
              <span className="text-xs font-bold text-muted-foreground">/ {rData.meetup_points?.target ?? 5}</span>
            </div>
          </div>
          
          <div className="flex gap-3 my-8">
            {Array.from({ length: rData.meetup_points?.target ?? 5 }).map((_, i) => (
              <motion.div 
                key={i} 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className={cn(
                  "h-4 flex-1 rounded-xl transition-all duration-700",
                  i < (rData.meetup_points?.current ?? 0) 
                    ? "bg-success shadow-[0_0_12px_rgba(var(--success-rgb),0.3)]" 
                    : "bg-white/5 border border-white/5"
                )} 
              />
            ))}
          </div>
          
          <div className="mt-auto p-5 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-muted-foreground leading-relaxed italic font-medium">
              {rData.meetup_points?.description ?? 'Field-validated relay hub requirements.'}
            </p>
          </div>
        </Card>

        {/* Gate 04: Daily Liquidity */}
        <Card delay={0.4} className="flex flex-col p-8 group hover:border-primary/40 transition-all duration-500">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-[10px]">
                <Package className="h-4 w-4" />
                Gate 04: Liquidity
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">Order Volume</h3>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-white">{rData.daily_volume?.current ?? 0}</div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">MIN: {rData.daily_volume?.target ?? 200}</div>
            </div>
          </div>

          <div className="my-8 relative px-2">
            <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((rData.daily_volume?.current ?? 0) / (rData.daily_volume?.target ?? 200)) * 100, 100)}%` }}
                transition={{ duration: 2, ease: "circOut", delay: 0.6 }}
                className="h-full bg-primary rounded-full shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)]" 
              />
            </div>
            {/* Target marker */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 h-8 w-1.5 bg-primary/40 rounded-full blur-[1px]" 
              style={{ left: '100%' }}
              title="Target Threshold" 
            />
          </div>
          
          <div className="mt-auto p-5 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-muted-foreground leading-relaxed italic font-medium">
              {rData.daily_volume?.description ?? 'Minimum daily volume to sustain 3-leg efficiency.'}
            </p>
          </div>
        </Card>

        {/* Summary Metric: Network Health */}
        <Card delay={0.5} className="flex flex-col justify-center p-8 bg-primary/[0.03] border-primary/20 hover:bg-primary/[0.05] transition-all">
          <div className="text-center space-y-5">
            <motion.div 
              animate={{ 
                rotate: [0, 360],
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={cn(
                "mx-auto h-20 w-20 rounded-[2.5rem] flex items-center justify-center transition-all duration-500 border-2",
                isOverallReady ? "bg-success/20 text-success border-success/30 shadow-lg shadow-success/20" : "bg-primary/20 text-primary border-primary/30"
              )}
            >
              {isOverallReady ? <CheckCircle2 className="h-10 w-10" /> : <Activity className="h-10 w-10" />}
            </motion.div>
            <div className="space-y-2">
              <h4 className="text-xl font-black text-white tracking-tight">
                {isOverallReady ? "SYSTEM OPTIMIZED" : "STABILIZING NODES"}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed px-4 font-medium">
                {isOverallReady 
                  ? "All 3-leg relay gates passed sentinel validation. Activation protocol available." 
                  : `Sentinel predicts optimal gate clearance in approximately ${data?.estimated_ready_in_weeks} weeks.`}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer Disclaimer/Info */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="p-8 rounded-[2.5rem] bg-surface-raised border border-white/5 flex flex-col md:flex-row gap-8 items-center shadow-2xl"
      >
        <div className="h-20 w-20 rounded-[1.5rem] bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-inner">
          <ShieldCheck className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            Sentinel-Grade Operational Protocol
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-4xl">
            Activation of the <span className="text-white font-bold">3-Leg Relay Model</span> is a high-impact operation. 
            Force override is strictly restricted to <span className="text-primary font-black underline underline-offset-4 decoration-primary/30">Super Admins</span> and requires a verified cryptographically-signed 2FA payload. 
            System intelligence will automatically trigger deployment only after all operational gates maintain {'>'} 98% stability for 7 consecutive diurnal cycles.
          </p>
        </div>
      </motion.div>

      {/* 2FA Activation Modal */}
      <AnimatePresence>
        {is2FAModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => !isActivating && setIs2FAModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-surface-raised border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Lock className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Security Verification</h2>
                    <p className="text-sm text-muted-foreground">High-impact 3-leg protocol activation.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <KeyRound className="h-3 w-3" />
                      TOTP Verification Code
                    </label>
                    <input 
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-3xl font-black tracking-[0.5em] text-center text-primary focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/10"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      Activation Justification
                    </label>
                    <textarea 
                      placeholder="Mandatory audit trail reason..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-sm font-medium text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30 min-h-[100px] resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    variant="secondary" 
                    className="flex-1 rounded-2xl h-14 font-bold"
                    onClick={() => setIs2FAModalOpen(false)}
                    disabled={isActivating}
                  >
                    Abort Protocol
                  </Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 rounded-2xl h-14 font-bold shadow-lg shadow-primary/20"
                    onClick={handleFinalActivation}
                    disabled={isActivating || otpCode.length !== 6 || !justification.trim()}
                  >
                    {isActivating ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Authorize Activation
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>

                <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                  <p className="text-[11px] text-warning/80 font-medium leading-relaxed">
                    WARNING: This action is irreversible via UI. Manual database rollback will be required if relay nodes destabilize.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
