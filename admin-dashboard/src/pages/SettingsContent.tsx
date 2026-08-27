import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save } from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { useSettingsData } from './useSettingsData'
import { GeneralPanel } from './settings/general';
import { LogisticsAWBPanel } from './settings/logisticsawb';
import { MapsProviderPanel } from './settings/mapsprovider';
import { FeatureFlagsPanel } from './settings/featureflags';
import { SLAConfigPanel } from './settings/slaconfig';
import { InsurancePanel } from './settings/insurance';
import { WalletFeesPanel } from './settings/walletfees';
import { ParametersPanel } from './settings/parameters';
import { SecurityPanel } from './settings/security';
import { TeamPanel } from './settings/team';
import { AuditLogsPanel } from './settings/auditlogs';

export function SettingsContent() {
  const data = useSettingsData();
  const { activeTab, setActiveTab, queryClient, tabs } = data;
  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">System Settings</h1>
          <p className="text-zinc-500 mt-1">Manage platform configuration, feature flags, and dynamic parameters.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              queryClient.invalidateQueries()
              toast.info('Syncing latest configuration...')
            }}
            className="px-8 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Save size={18} />
            Sync Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-200 group text-left",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-lg shadow-primary/10" 
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              )}
            >
              <tab.icon size={20} className={cn(activeTab === tab.id ? "text-white" : "group-hover:text-primary-light")} />
              <span className="font-bold text-sm uppercase tracking-widest">{tab.id}</span>
            </button>
          ))}
          

        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'General' && (
              <GeneralPanel data={data} />
            )}
            {activeTab === 'Logistics AWB' && (
              <LogisticsAWBPanel data={data} />
            )}
            {activeTab === 'Maps Provider' && (
              <MapsProviderPanel data={data} />
            )}
            {activeTab === 'Feature Flags' && (
              <FeatureFlagsPanel data={data} />
            )}
            {activeTab === 'SLA Config' && (
              <SLAConfigPanel data={data} />
            )}
            {activeTab === 'Insurance' && (
              <InsurancePanel data={data} />
            )}
            {activeTab === 'Wallet & Fees' && (
              <WalletFeesPanel data={data} />
            )}
            {activeTab === 'Parameters' && (
              <ParametersPanel data={data} />
            )}
            {activeTab === 'Security' && (
              <SecurityPanel data={data} />
            )}
            {activeTab === 'Team' && (
              <TeamPanel data={data} />
            )}
            {activeTab === 'Audit Logs' && (
              <AuditLogsPanel data={data} />
            )}
      </AnimatePresence>
      </div>
    </div>
  </div>
  );
}
