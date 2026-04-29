'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import Switch from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { 
  Search, 
  Filter, 
  Plus, 
  MoreVertical, 
  Settings2,
  ShieldCheck,
  LayoutGrid,
  List,
  AlertCircle,
  KeyRound,
  MessageSquare
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchFlags, toggleFlag, createFlag, FeatureFlag } from '@/lib/api';
import OTPInput from '@/components/ui/otp-input';

// API Base
const API_URL = 'http://localhost:5000';

const CATEGORIES = ['All', 'Routing', 'Pricing', 'Feature', 'System'];

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [totp, setTotp] = useState('');
  const [reason, setReason] = useState('');

  // Create Flag Form State
  const [newFlag, setNewFlag] = useState({
    key: '',
    category: 'Feature',
    description: '',
    is_enabled: false
  });

  // Fetch flags
  const { data: flags, isLoading, error } = useQuery<FeatureFlag[]>({
    queryKey: ['flags'],
    queryFn: fetchFlags,
  });

  // Toggle Mutation
  const toggleMutation = useMutation({
    mutationFn: ({ key, new_enabled, reason, totp_code }: { key: string; new_enabled: boolean; reason: string; totp_code: string }) => 
      toggleFlag(key, { new_enabled, reason, totp_code }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      toast.success(`Flag ${variables.key} successfully ${variables.new_enabled ? 'enabled' : 'disabled'}`);
      setIsToggleModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to toggle flag');
    }
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: createFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      toast.success(`Flag ${newFlag.key} created successfully`);
      setIsCreateModalOpen(false);
      setNewFlag({ key: '', category: 'Feature', description: '', is_enabled: false });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create flag');
    }
  });

  const filteredFlags = flags?.filter(f => {
    const matchesSearch = f.key.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'All' || f.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleToggleClick = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setIsToggleModalOpen(true);
    setTotp('');
    setReason('');
  };

  const handleConfirmToggle = () => {
    if (!selectedFlag) return;
    toggleMutation.mutate({
      key: selectedFlag.key,
      new_enabled: !selectedFlag.is_enabled,
      reason,
      totp_code: totp
    });
  };

  const handleCreateFlag = () => {
    if (!newFlag.key || !newFlag.category) {
      toast.error('Key and Category are required');
      return;
    }
    createMutation.mutate(newFlag);
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Feature Flags</h1>
          <p className="text-muted-foreground mt-1">Manage system features and gradual rollouts across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-surface-raised p-1 rounded-xl border border-border flex">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'table' ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button className="rounded-xl h-11" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Flag
          </Button>
        </div>
      </header>

      {/* Category Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex bg-surface-raised p-1 rounded-xl border border-border">
          {CATEGORIES.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-lg transition-all",
                activeTab === tab 
                  ? "bg-white/10 text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-white"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search flags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Flags View */}
      {viewMode === 'table' ? (
        <Card animate={false} className="p-0 overflow-hidden border-border/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-white/[0.02]">
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flag Key</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Sync</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-4"><div className="h-4 bg-border rounded w-1/3" /></td>
                    </tr>
                  ))
                ) : filteredFlags?.map((flag) => (
                  <tr key={flag.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                          {flag.key}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{flag.description}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status="muted" label={flag.category} dot={false} className="capitalize px-2 py-0.5 text-[10px]" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <Switch 
                          checked={flag.is_enabled} 
                          onChange={() => handleToggleClick(flag)}
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-white font-medium">{flag.last_updated_by}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(flag.updated_at).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
                          <Link href={`/feature-flags/${flag.key}`}>
                            <Settings2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFlags?.map((flag, i) => (
            <Card key={flag.id} delay={i * 0.05} className="group hover:border-primary/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-xl bg-surface group-hover:bg-primary/10 transition-colors">
                  <ShieldCheck className={cn(
                    "h-6 w-6 transition-colors",
                    flag.is_enabled ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <Switch 
                  checked={flag.is_enabled} 
                  onChange={() => handleToggleClick(flag)}
                  size="md"
                />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{flag.key}</h3>
              <p className="text-sm text-muted-foreground mb-6 line-clamp-2 min-h-[2.5rem]">
                {flag.description}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <StatusBadge status="muted" label={flag.category} dot={false} className="text-[10px] uppercase font-bold" />
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold text-primary" asChild>
                  <Link href={`/feature-flags/${flag.key}`}>
                    CONFIG <ChevronRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Toggle Confirmation Modal */}
      <Modal
        isOpen={isToggleModalOpen}
        onClose={() => setIsToggleModalOpen(false)}
        title={`Secure Toggle: ${selectedFlag?.key}`}
      >
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20 flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="text-sm">
              <p className="text-warning font-bold">Critical System Change</p>
              <p className="text-muted-foreground">This action will affect {selectedFlag?.key === 'model_three_legs' ? 'all routes > 25km' : 'system pricing and routing'}. Audit log will be created.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className="h-3 w-3" /> Change Reason (min 50 chars)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this flag is being changed..."
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
              disabled={toggleMutation.isPending}
            />
          </div>

          <div className="flex gap-4 pt-2">
            <Button 
              variant="secondary" 
              className="flex-1 rounded-2xl" 
              onClick={() => setIsToggleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-12" 
              disabled={reason.length < 50 || totp.length !== 6 || toggleMutation.isPending}
              isLoading={toggleMutation.isPending}
              onClick={handleConfirmToggle}
            >
              Confirm Change
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Create Flag Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Feature Flag"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Flag Key (unique)
            </label>
            <input
              type="text"
              value={newFlag.key}
              onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
              placeholder="e.g. dynamic_eta_v2"
              className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Category
            </label>
            <select
              value={newFlag.category}
              onChange={(e) => setNewFlag({ ...newFlag, category: e.target.value })}
              className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {CATEGORIES.filter(c => c !== 'All').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Description
            </label>
            <textarea
              value={newFlag.description}
              onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
              placeholder="What does this flag control?"
              className="w-full h-20 bg-surface border border-border rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-surface-raised border border-border">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-bold text-white">Initial Status</p>
                <p className="text-xs text-muted-foreground">Start with flag enabled or disabled.</p>
              </div>
            </div>
            <Switch 
              checked={newFlag.is_enabled} 
              onChange={(val) => setNewFlag({ ...newFlag, is_enabled: val })}
              size="sm"
            />
          </div>

          <div className="flex gap-4 pt-2">
            <Button 
              variant="secondary" 
              className="flex-1 rounded-2xl" 
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-12" 
              disabled={!newFlag.key || createMutation.isPending}
              isLoading={createMutation.isPending}
              onClick={handleCreateFlag}
            >
              Create Flag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
