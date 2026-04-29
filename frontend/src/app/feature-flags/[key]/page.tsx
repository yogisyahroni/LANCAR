'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api, fetchFlagLogs, updateConfig, FeatureFlag, AuditLog } from '@/lib/api';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  History, 
  Settings, 
  ShieldCheck, 
  AlertCircle,
  Clock,
  User,
  KeyRound,
  MessageSquare
} from 'lucide-react';
import StatusBadge from '@/components/ui/status-badge';
import Modal from '@/components/ui/modal';
import OTPInput from '@/components/ui/otp-input';

export default function FlagDetailPage() {
  const { key } = useParams() as { key: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const [configValue, setConfigValue] = useState<string>('{}');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [totp, setTotp] = useState('');
  const [reason, setReason] = useState('');

  // Fetch flag details
  const { data: flag, isLoading } = useQuery<FeatureFlag>({
    queryKey: ['flag', key],
    queryFn: async () => {
      const { data } = await api.get(`/admin/feature-flags/${key}`);
      return data;
    },
  });

  // Fetch audit logs
  const { data: logs } = useQuery<AuditLog[]>({
    queryKey: ['flag-logs', key],
    queryFn: () => fetchFlagLogs(key),
  });

  useEffect(() => {
    if (flag?.config) {
      setConfigValue(JSON.stringify(flag.config, null, 2));
    }
  }, [flag]);

  const updateConfigMutation = useMutation({
    mutationFn: (payload: { config: any; reason: string; totp_code: string }) => 
      updateConfig(key, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flag', key] });
      queryClient.invalidateQueries({ queryKey: ['flag-logs', key] });
      toast.success('Configuration updated successfully');
      setIsSaveModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update configuration');
    }
  });

  const handleSave = () => {
    try {
      JSON.parse(configValue);
      setIsSaveModalOpen(true);
      setTotp('');
      setReason('');
    } catch (e) {
      toast.error('Invalid JSON configuration');
    }
  };

  const handleConfirmSave = () => {
    updateConfigMutation.mutate({
      config: JSON.parse(configValue),
      reason,
      totp_code: totp
    });
  };

  if (isLoading) return <div className="animate-pulse space-y-4 pt-12"><div className="h-12 bg-surface rounded-xl w-1/4" /><div className="h-96 bg-surface rounded-3xl" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">{key}</h1>
              <StatusBadge status={flag?.is_enabled ? 'success' : 'muted'} label={flag?.is_enabled ? 'ACTIVE' : 'DISABLED'} />
            </div>
            <p className="text-muted-foreground mt-1">{flag?.description || 'Manage configuration and view audit history.'}</p>
          </div>
        </div>
        <Button onClick={handleSave} className="px-8 rounded-xl h-11">
          <Save className="mr-2 h-4 w-4" />
          Save Configuration
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden border-primary/20">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white/[0.02]">
              <div className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-widest">
                <Settings className="h-4 w-4 text-primary" />
                Config Engine
              </div>
              <div className="text-[10px] text-muted-foreground uppercase font-black">JSON EDITOR</div>
            </div>
            <div className="h-[500px] bg-[#1e1e1e]">
              <Editor
                height="100%"
                defaultLanguage="json"
                theme="vs-dark"
                value={configValue}
                onChange={(val) => setConfigValue(val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  padding: { top: 20 },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                }}
              />
            </div>
          </Card>
        </div>

        {/* Sidebar Info & History */}
        <div className="space-y-6">
          <Card glass>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-primary flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Policy Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Category</span>
                <span className="text-white font-bold">{flag?.category}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Checklist Req.</span>
                <span className={flag?.require_checklist ? "text-warning font-bold" : "text-success font-bold"}>
                  {flag?.require_checklist ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="text-white font-medium">{flag ? new Date(flag.updated_at).toLocaleDateString() : '-'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-primary flex items-center gap-2">
                <History className="h-4 w-4" /> Audit History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {logs?.slice(0, 5).map((log, i) => (
                  <div key={log.id} className="relative pl-6 pb-6 last:pb-0 border-l border-border/50">
                    <div className="absolute left-[-5px] top-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" /> {log.changed_by}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">"{log.reason}"</p>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={log.new_enabled ? 'success' : 'muted'} label={log.new_enabled ? 'ON' : 'OFF'} className="text-[9px] px-1.5" />
                        <span className="text-[10px] text-muted-foreground">Config updated</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!logs?.length && <p className="text-xs text-muted-foreground text-center py-4">No audit logs found.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title="Secure Update: Configuration"
      >
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex gap-3">
            <AlertCircle className="h-5 w-5 text-primary shrink-0" />
            <div className="text-sm">
              <p className="text-primary font-bold">Configuration Sync</p>
              <p className="text-muted-foreground">Updating configuration will trigger real-time updates across all active nodes. This action is irreversible.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className="h-3 w-3" /> Change Reason (min 50 chars)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this configuration is being changed..."
              className="w-full h-24 bg-surface border border-border rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <div className="flex justify-end">
              <span className={cn(
                "text-[10px] font-bold",
                reason.length >= 50 ? "text-success" : "text-muted-foreground"
              )}>
                {reason.length} / 50
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <KeyRound className="h-3 w-3" /> 2FA Authentication
            </label>
            <OTPInput 
              value={totp}
              onChange={setTotp}
              disabled={updateConfigMutation.isPending}
            />
          </div>

          <div className="flex gap-4 pt-2">
            <Button 
              variant="secondary" 
              className="flex-1 rounded-2xl" 
              onClick={() => setIsSaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-12" 
              disabled={reason.length < 50 || totp.length !== 6 || updateConfigMutation.isPending}
              isLoading={updateConfigMutation.isPending}
              onClick={handleConfirmSave}
            >
              Update Config
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
