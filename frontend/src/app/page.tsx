'use client';

import { useQuery } from '@tanstack/react-query';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { 
  Activity, 
  Flag, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  Clock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { fetchFlags, fetchReadiness, fetchAllAuditLogs } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { data: flags, isLoading: loadingFlags } = useQuery({ 
    queryKey: ['flags'], 
    queryFn: fetchFlags 
  });
  
  const { data: readiness, isLoading: loadingReadiness } = useQuery({ 
    queryKey: ['readiness'], 
    queryFn: fetchReadiness 
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({ 
    queryKey: ['audit-logs'], 
    queryFn: fetchAllAuditLogs 
  });

  const activeFlagsCount = flags?.filter(f => f.is_enabled).length || 0;
  const totalFlagsCount = flags?.length || 0;

  const STATS = [
    { name: 'Active Flags', value: `${activeFlagsCount}/${totalFlagsCount}`, icon: Flag, change: 'Real-time sync', status: 'info' },
    { name: 'System Health', value: '99.9%', icon: Activity, change: 'Stable', status: 'success' },
    { name: 'SLA Target', value: readiness ? `${readiness.readiness_data?.gate_01_sla_2_kaki?.current_value}%` : '...', icon: TrendingUp, change: 'vs 93% target', status: readiness?.can_activate ? 'success' : 'warning' },
    { name: 'Avg. Latency', value: '18ms', icon: Clock, change: 'Optimization: Active', status: 'success' },
  ];
  
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">System Command Center</h1>
        <p className="text-muted-foreground mt-2">Real-time overview of the LANCAR relay infrastructure.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {loadingFlags ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : STATS.map((stat, i) => (
          <Card key={stat.name} delay={i * 0.1}>
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <StatusBadge status={stat.status as any} label={stat.change} dot={false} />
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
              <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 3-Leg Readiness Preview */}
        <Card delay={0.4} className="flex flex-col h-full">
          <CardHeader>
            <div className="flex-1">
              <CardTitle>3-Leg Readiness</CardTitle>
              <CardDescription>Gate metrics for Model 3-Kaki activation.</CardDescription>
            </div>
            {loadingReadiness ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <StatusBadge 
                status={readiness?.can_activate ? 'success' : 'warning'} 
                label={readiness?.can_activate ? 'READY' : 'IN PROGRESS'} 
              />
            )}
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {loadingReadiness ? (
                <>
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SLA 2-Kaki (Target: 93%)</span>
                      <span className="text-white font-medium">{readiness?.readiness_data?.gate_01_sla_2_kaki?.current_value}%</span>
                    </div>
                    <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-1000" 
                        style={{ width: `${readiness?.readiness_data?.gate_01_sla_2_kaki?.current_value}%` }} 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order Volume (Target: 200/day)</span>
                      <span className="text-white font-medium">{readiness?.readiness_data?.gate_02_volume?.current_value}/day</span>
                    </div>
                    <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.min(100, (readiness?.readiness_data?.gate_02_volume?.current_value / 200) * 100)}%` }} 
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <Button variant="secondary" className="w-full mt-8" asChild>
              <Link href="/readiness">
                View Full Readiness Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity / Audit Log */}
        <Card delay={0.5} className="flex flex-col h-full">
          <CardHeader>
            <div className="flex-1">
              <CardTitle>Recent Configuration Changes</CardTitle>
              <CardDescription>Latest updates to feature flags and system config.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/audit-logs">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <div className="space-y-4">
              {loadingLogs ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
              ) : logs && logs.length > 0 ? (
                logs.slice(0, 4).map((log, i) => (
                  <div key={log.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-border">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <ShieldAlert className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        <span className="text-primary font-bold">{log.admin_id}</span> 
                        <span className="mx-1 text-muted-foreground">{log.action === 'toggle' ? 'toggled' : 'updated'}</span> 
                        <span className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded text-white/70">{log.flag_key}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tight mt-0.5 font-bold">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <StatusBadge 
                      status={log.action === 'toggle' ? 'warning' : 'info'} 
                      label={log.action.toUpperCase()} 
                      dot={false} 
                      className="text-[9px] px-1.5"
                    />
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm">No recent activity found.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
