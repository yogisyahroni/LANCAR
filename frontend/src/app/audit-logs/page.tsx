'use client';

import { useState } from 'react';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { 
  History, 
  User, 
  ArrowRight, 
  Calendar,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { fetchAllAuditLogs, AuditLog } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

const DiffView = ({ oldVal, newVal, action }: { oldVal: any; newVal: any; action: string }) => {
  if (action === 'toggle') {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${oldVal ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {oldVal ? 'Enabled' : 'Disabled'}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${newVal ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {newVal ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
        <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Previous Config</p>
        <pre className="text-[11px] font-mono text-red-200/70 overflow-x-auto">
          {JSON.stringify(oldVal, null, 2)}
        </pre>
      </div>
      <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/10">
        <p className="text-[10px] font-bold text-green-500 uppercase mb-1">New Config</p>
        <pre className="text-[11px] font-mono text-green-200/70 overflow-x-auto">
          {JSON.stringify(newVal, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: fetchAllAuditLogs,
    refetchInterval: 30000, // Poll every 30s for audit logs
  });

  const filteredLogs = logs?.filter(log => 
    log.flag_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.admin_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.justification.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">System Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Immutable record of all configuration and feature flag changes.</p>
        </div>
        <Button variant="secondary" className="hidden sm:flex">
          <Download className="mr-2 h-4 w-4" />
          Export History
        </Button>
      </header>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-surface-raised p-4 rounded-2xl border border-border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by flag, admin, or justification..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="md" className="flex-1 sm:flex-initial">
            <Calendar className="mr-2 h-4 w-4" />
            Date Range
          </Button>
          <Button variant="outline" size="md" className="flex-1 sm:flex-initial">
            <Filter className="mr-2 h-4 w-4" />
            Actions
          </Button>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))
        ) : filteredLogs && filteredLogs.length > 0 ? (
          filteredLogs.map((log, i) => {
            const isExpanded = expandedLog === log.id;
            return (
              <Card key={log.id} delay={i * 0.02} className={`p-0 overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-primary/30' : ''}`}>
                <div className="flex flex-col">
                  <div 
                    className="flex flex-col md:flex-row cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className="md:w-48 p-6 bg-white/[0.02] border-r border-border flex flex-col justify-center">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Timestamp</p>
                      <p className="text-sm font-medium text-white mt-1">
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                        {format(new Date(log.created_at), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    
                    <div className="flex-1 p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white flex items-center gap-2">
                              {log.admin_id} 
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-primary font-mono">{log.flag_key}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <StatusBadge 
                                status={log.action === 'toggle' ? 'warning' : 'success'} 
                                label={log.action.toUpperCase()} 
                              />
                              <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                                <Database className="h-2.5 w-2.5" /> Direct DB Write
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-muted-foreground hover:text-white"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                      
                      <div className="mt-4 p-4 rounded-xl bg-surface-raised border border-border/50">
                        <div className="flex items-start gap-2">
                          <History className="h-3 w-3 text-primary mt-0.5" />
                          <div>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
                              Justification
                            </p>
                            <p className="text-sm text-white/90 leading-relaxed">
                              {log.justification}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expansion Area for Diffs */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-0 border-t border-border bg-black/20">
                      <div className="mt-4">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Changes Detected</p>
                        <DiffView 
                          oldVal={log.old_value} 
                          newVal={log.new_value} 
                          action={log.action} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-surface-raised rounded-3xl border border-dashed border-border">
            <History className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <p className="text-muted-foreground font-medium">No audit logs found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
