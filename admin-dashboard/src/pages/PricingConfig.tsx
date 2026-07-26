import { useState, useEffect } from 'react'
import { 
  Settings, 
  TrendingUp, 
  Zap, 
  CloudRain, 
  Clock, 
  Map, 
  Save, 
  Info,
  ChevronRight,
  Plus,
  Loader2
} from 'lucide-react'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import DeliveryServices from './DeliveryServices'

import { useNavigate } from 'react-router-dom'

export default function PricingConfig() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('P2P')
  const [formData, setFormData] = useState<{
    baseFare: number | '';
    perKm: number | '';
    volumetricDiv: number | '';
  }>({
    baseFare: 0,
    perKm: 0,
    volumetricDiv: 6000
  })
  const [calcDimensions, setCalcDimensions] = useState<{
    length: number | '';
    width: number | '';
    height: number | '';
  }>({ length: 10, width: 10, height: 10 })

  const { data: configs, isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => {
      const res = await api.get('/admin/pricing');
      return res.data;
    }
  });

  const { data: pricingFlags } = useQuery({
    queryKey: ['pricing-flags'],
    queryFn: async () => {
      const res = await api.get('/admin/feature-flags', { params: { category: 'pricing' } });
      return res.data;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (updatedConfig: any) => {
      const res = await api.put('/admin/pricing', updatedConfig);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      toast.success('Pricing configuration updated successfully');
    },
    onError: (err: any) => {
      toast.error(`Update failed: ${err.message}`);
    }
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async ({ key, isEnabled }: { key: string; isEnabled: boolean }) => {
      const res = await api.patch(`/admin/feature-flags/${key}/toggle`, {
        new_enabled: isEnabled,
        reason: `Toggled ${key} from Pricing Configuration dashboard`
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-flags'] });
      toast.success('Surge trigger updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || `Update failed: ${err.message}`);
    }
  });

  useEffect(() => {
    if (configs) {
      const current = configs.find((c: any) => ['p2p', 'standard'].includes(c.service_type));
      if (current) {
        setFormData({
          baseFare: parseFloat(current.base_fare),
          perKm: parseFloat(current.per_km_rate),
          volumetricDiv: parseInt(current.volumetric_div) || 6000
        });
      }
    }
  }, [configs, activeTab]);

  const handleSave = () => {
    if (formData.baseFare === '' || formData.perKm === '' || formData.volumetricDiv === '') {
      toast.error('All global fare fields must be filled and cannot be empty!');
      return;
    }
    updateMutation.mutate({
      service_type: 'p2p',
      base_fare: formData.baseFare,
      per_km_rate: formData.perKm,
      volumetric_div: formData.volumetricDiv
    });
  };

  const baseFareVal = formData.baseFare === '' ? 0 : formData.baseFare;
  const perKmVal = formData.perKm === '' ? 0 : formData.perKm;
  const lVal = calcDimensions.length === '' ? 0 : calcDimensions.length;
  const wVal = calcDimensions.width === '' ? 0 : calcDimensions.width;
  const hVal = calcDimensions.height === '' ? 0 : calcDimensions.height;

  const simulationData = [
    { distance: 0, price: baseFareVal },
    { distance: 2, price: baseFareVal },
    { distance: 5, price: baseFareVal + (3 * perKmVal) },
    { distance: 8, price: baseFareVal + (6 * perKmVal) },
    { distance: 10, price: baseFareVal + (8 * perKmVal) },
    { distance: 15, price: baseFareVal + (13 * perKmVal) },
    { distance: 20, price: baseFareVal + (18 * perKmVal) },
  ];

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Pricing Configuration</h1>
          <p className="text-zinc-500 mt-1">Configure base rates, surge multipliers, and dynamic pricing rules.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/cost-intelligence')}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500/20 to-primary/20 border border-amber-500/30 text-amber-300 font-bold text-sm hover:scale-[1.02] transition-all flex items-center gap-2"
          >
            <Zap size={16} /> OPEX & CAPEX Simulator
          </button>
          <button className="px-8 py-3 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-sm uppercase tracking-widest hover:text-white transition-all">
            Discard
          </button>
          <button 
            onClick={handleSave}
            disabled={updateMutation.isPending || formData.baseFare === '' || formData.perKm === '' || formData.volumetricDiv === ''}
            className="px-8 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:hover:scale-100"
          >
            {updateMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Editor */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                <Settings className="text-primary-light" size={24} />
                Global Fare Rules
              </h2>
              <div className="flex gap-2">
                {['P2P', 'Tambal Ban Motor', 'Tambal Ban Mobil', 'Towing Motor', 'Towing Mobil'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      activeTab === t ? "bg-primary/20 text-primary-light border border-primary/20" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="space-y-4">
                <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Base Fare (Rp)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                  <input 
                    type="number" 
                    value={formData.baseFare}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, baseFare: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all",
                      formData.baseFare === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                {formData.baseFare === '' ? (
                  <p className="text-[10px] text-destructive font-black mt-1">⚠️ Tarif dasar wajib diisi dan tidak boleh kosong!</p>
                ) : (
                  <p className="text-[10px] text-zinc-600 font-bold italic">Applied to the first 2.0 km of any delivery.</p>
                )}
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Distance Rate (Rp/km)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                  <input 
                    type="number" 
                    value={formData.perKm}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, perKm: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all",
                      formData.perKm === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                {formData.perKm === '' ? (
                  <p className="text-[10px] text-destructive font-black mt-1">⚠️ Tarif per km wajib diisi dan tidak boleh kosong!</p>
                ) : (
                  <p className="text-[10px] text-zinc-600 font-bold italic">Incremental rate added after base distance.</p>
                )}
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Volumetric Divisor</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={formData.volumetricDiv}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, volumetricDiv: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-2xl py-4 px-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all",
                      formData.volumetricDiv === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                {formData.volumetricDiv === '' ? (
                  <p className="text-[10px] text-destructive font-black mt-1">⚠️ Pembagi volumetrik wajib diisi!</p>
                ) : (
                  <p className="text-[10px] text-zinc-600 font-bold italic">Divisor for dimension weight. Production default is 6000.</p>
                )}
              </div>
            </div>

            {/* Interactive Volumetric Calculator */}
            <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
              <div className="flex items-center gap-2">
                <Info className="text-primary-light" size={18} />
                <h4 className="text-xs font-black text-zinc-300 uppercase tracking-widest">Bobot Volumetrik Simulator</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-wider">Panjang (L - cm)</span>
                  <input 
                    type="number" 
                    value={calcDimensions.length} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setCalcDimensions(prev => ({ ...prev, length: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-xl p-3 text-sm text-zinc-100 font-bold focus:outline-none focus:ring-1 focus:ring-primary",
                      calcDimensions.length === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-wider">Lebar (W - cm)</span>
                  <input 
                    type="number" 
                    value={calcDimensions.width} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setCalcDimensions(prev => ({ ...prev, width: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-xl p-3 text-sm text-zinc-100 font-bold focus:outline-none focus:ring-1 focus:ring-primary",
                      calcDimensions.width === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-wider">Tinggi (H - cm)</span>
                  <input 
                    type="number" 
                    value={calcDimensions.height} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setCalcDimensions(prev => ({ ...prev, height: val === '' ? '' : Number(val) }));
                    }}
                    className={cn(
                      "w-full bg-white/5 border rounded-xl p-3 text-sm text-zinc-100 font-bold focus:outline-none focus:ring-1 focus:ring-primary",
                      calcDimensions.height === '' ? "border-destructive/50" : "border-white/10"
                    )}
                  />
                </div>
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-primary-light uppercase tracking-wider">Hasil (Bobot Volume)</span>
                  <span className="text-lg font-black text-zinc-100">
                    {((lVal * wVal * hVal) / (formData.volumetricDiv === '' ? 6000 : formData.volumetricDiv || 6000)).toFixed(2)} kg
                  </span>
                </div>
              </div>
              {(calcDimensions.length === '' || calcDimensions.width === '' || calcDimensions.height === '') ? (
                <p className="text-[10px] text-destructive font-black mt-1">⚠️ Dimensi simulator wajib diisi dan tidak boleh kosong!</p>
              ) : (
                <p className="text-[10px] text-zinc-600 font-bold italic">
                  Rumus: (Panjang × Lebar × Tinggi) ÷ Divisor = {calcDimensions.length} × {calcDimensions.width} × {calcDimensions.height} ÷ {formData.volumetricDiv === '' ? 6000 : formData.volumetricDiv || 6000} = {((lVal * wVal * hVal) / (formData.volumetricDiv === '' ? 6000 : formData.volumetricDiv || 6000)).toFixed(2)} kg
                </p>
              )}
            </div>

            <div className="pt-10 border-t border-white/5 space-y-8">
              <h3 className="text-lg font-black text-zinc-100 flex items-center gap-3">
                <Zap className="text-amber-400" size={20} />
                Dynamic Surge Triggers
              </h3>
              
              <div className="space-y-6">
                {[
                  { key: 'dynamic_pricing_peak_hour', icon: Clock, label: 'Peak Hour Surge', desc: 'Auto-apply 1.5x during 16:00 - 19:00' },
                  { key: 'dynamic_pricing_weather', icon: CloudRain, label: 'Weather Surge', desc: 'Apply 1.2x when rainfall exceeds 5mm/h' },
                  { key: 'dynamic_pricing_demand_supply', icon: TrendingUp, label: 'High Demand Surge', desc: 'Apply 1.3x if pending orders > 50 in zone' },
                ].map((rule) => {
                  const dbFlag = (pricingFlags || []).find((f: any) => f.key === rule.key);
                  const active = dbFlag ? dbFlag.is_enabled : false;
                  return (
                    <div key={rule.key} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-3 rounded-2xl bg-white/5", active ? "text-primary-light" : "text-zinc-600")}>
                          <rule.icon size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-zinc-200">{rule.label}</p>
                          <p className="text-xs text-zinc-600 font-medium">{rule.desc}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => toggleFlagMutation.mutate({ key: rule.key, isEnabled: !active })}
                        disabled={toggleFlagMutation.isPending}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-all duration-300 disabled:opacity-50",
                          active ? "bg-primary" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                          active ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>
                  );
                })}
              </div>
              
              <button 
                onClick={() => navigate('/feature-flags')}
                className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest"
              >
                <Plus size={16} />
                Add New Trigger Rule
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Preview & Analytics */}
        <div className="space-y-8">
          <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
            <p className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={14} />
              Pricing Simulation
            </p>
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={simulationData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#006437" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#006437" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="distance" 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `${val}km`}
                  />
                  <YAxis 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `Rp${val/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }}
                    itemStyle={{ color: '#006437', fontWeight: 'bold' }}
                    formatter={(value) => [`Rp ${Number(value).toLocaleString()}`, 'Price']}
                  />
                  <Area type="monotone" dataKey="price" stroke="#006437" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20 text-primary-light">
                  <Info size={16} />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed italic font-medium">
                  At current settings, a <span className="text-primary-light font-bold">10km</span> delivery will cost <span className="text-zinc-100 font-bold">Rp {(baseFareVal + 8 * perKmVal).toLocaleString()}</span> ({activeTab}).
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
             <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">Pricing Strategy Health</p>
             <div className="space-y-6">
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-zinc-400 font-bold">Gross Margin</span>
                      <span className="text-xs text-emerald-400 font-black">22.4%</span>
                   </div>
                   <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '22.4%' }} />
                   </div>
                </div>
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-zinc-400 font-bold">Courier Take-Home</span>
                      <span className="text-xs text-primary-light font-black">78.0%</span>
                   </div>
                   <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: '78%' }} />
                   </div>
                </div>
             </div>
          </div>

          <button 
            onClick={() => navigate('/zones')}
            className="w-full group p-6 rounded-[32px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all text-left"
          >
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 rounded-2xl bg-white/5 text-zinc-400 group-hover:text-primary-light transition-colors">
                      <Map size={20} />
                   </div>
                   <div>
                      <p className="text-sm font-black text-zinc-200">Zonal Pricing</p>
                      <p className="text-xs text-zinc-600">Configure rates per specific zone</p>
                   </div>
                </div>
                <ChevronRight size={18} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
             </div>
          </button>
        </div>
      </div>

      <div className="pt-4">
        <div className="mb-6">
          <h2 className="text-2xl font-black text-zinc-100 tracking-tight">Service Product Pricing</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Konfigurasi harga per layanan customer: Instant, Prioritas, Hemat, Same Day, Mobil, dan layanan baru berikutnya.
          </p>
        </div>
        <DeliveryServices embedded />
      </div>
    </div>
  )
}

