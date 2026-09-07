import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  Map as MapIcon, 
  Plus, 
  ChevronRight,
  Search,
  Loader2,
  X,
  Maximize2,
  Moon,
  Save,
  Sun
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_TILE_URL,
  TOMTOM_RASTER_ATTRIBUTION,
  TomTomRuntimeUnavailable,
  isTomTomRuntimeReady,
  tomTomRasterTileUrl,
  useMapsRuntimeConfig
} from '../components/TomTomMapsRuntime'

// Leaflet Imports
import { AttributionControl, MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

// Fix for default markers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Helper to convert Leaflet coordinates to WKT
const coordsToWKT = (latlngs: any) => {
  // Geoman handles different types of layers, but for polygons we want the first array
  const points = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
  const coords = points.map((ll: any) => `${ll.lng} ${ll.lat}`).join(', ');
  // Close the polygon
  const first = points[0];
  const last = points[points.length - 1];
  const closedCoords = first.lng === last.lng && first.lat === last.lat ? coords : `${coords}, ${first.lng} ${first.lat}`;
  return `POLYGON((${closedCoords}))`;
};

// Helper to parse WKT to Leaflet coordinates
const WKTToCoords = (wkt: string): L.LatLngTuple[] => {
  if (!wkt) return [];
  const cleanStr = wkt
    .replace(/^[A-Za-z]+\s*/, '') // Remove geometry type name
    .replace(/[()]/g, '')        // Strip all parentheses
    .trim();
  
  if (!cleanStr) return [];
  
  return cleanStr.split(',').map(pair => {
    const parts = pair.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (isNaN(lng) || isNaN(lat)) return null;
    return [lat, lng] as L.LatLngTuple;
  }).filter((coord): coord is L.LatLngTuple => coord !== null);
};

export default function Zones() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('')
  const [selectedZone, setSelectedZone] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mapCenter] = useState<[number, number]>([-6.2088, 106.8456]) // Jakarta
  const [isDrawing, setIsDrawing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark')
  const [zonePreview, setZonePreview] = useState<any>(null)
  
  const { data: zones, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const res = await api.get('/admin/zones');
      return res.data;
    }
  });
  const { data: mapsRuntimeConfig } = useMapsRuntimeConfig('web_admin');
  const { data: zoneRevisions } = useQuery({
    queryKey: ['zone-revisions', selectedZone?.id],
    queryFn: async () => (await api.get(`/admin/zones/${selectedZone.id}/revisions`)).data,
    enabled: Boolean(selectedZone?.id),
  });
  const shouldRenderTomTomMap = isTomTomRuntimeReady(mapsRuntimeConfig);
  const tileUrl = shouldRenderTomTomMap
    ? tomTomRasterTileUrl(mapsRuntimeConfig?.tomtom_maps?.browser_api_key || '', mapTheme === 'dark' ? 'night' : 'main')
    : CARTO_DARK_TILE_URL;
  const tileAttribution = shouldRenderTomTomMap
    ? TOMTOM_RASTER_ATTRIBUTION
    : CARTO_DARK_ATTRIBUTION;

  const createMutation = useMutation({
    mutationFn: (newZone: any) => api.post('/admin/zones', newZone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone created successfully');
      setIsModalOpen(false);
      setIsDrawing(false);
    },
    onError: (err: any) => toast.error(`Failed to create zone: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => api.patch(`/admin/zones/${id}`, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      queryClient.invalidateQueries({ queryKey: ['zone-revisions', selectedZone?.id] });
      toast.success('Zone draft created. Preview and approve it before publishing.');
      setSelectedZone((current: any) => ({ ...current, polygon: response.data?.revision?.polygon || current?.polygon }));
      setIsModalOpen(false);
    },
    onError: (err: any) => toast.error(`Failed to update zone: ${err.message}`)
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => api.get(`/admin/zones/${id}/revisions/preview`),
    onSuccess: (response) => setZonePreview(response.data),
    onError: (err: any) => toast.error(`Unable to preview zone draft: ${err.message}`),
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, revisionId }: { id: string, revisionId: string }) => api.post(`/admin/zones/${id}/revisions/${revisionId}/approve`),
    onSuccess: () => {
      toast.success('Zone draft approved. Publish it when ready.');
      setZonePreview((current: any) => current ? { ...current, draft: { ...current.draft, status: 'approved' } } : current);
      queryClient.invalidateQueries({ queryKey: ['zone-revisions', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(`Unable to approve zone draft: ${err.message}`),
  });
  const publishMutation = useMutation({
    mutationFn: ({ id, revisionId }: { id: string, revisionId: string }) => api.post(`/admin/zones/${id}/revisions/${revisionId}/publish`),
    onSuccess: () => {
      toast.success('Zone revision published. Existing orders remain assigned to their captured zone.');
      setZonePreview(null);
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      queryClient.invalidateQueries({ queryKey: ['zone-revisions', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(`Unable to publish zone revision: ${err.message}`),
  });
  const rollbackMutation = useMutation({
    mutationFn: ({ id, revisionId }: { id: string, revisionId: string }) => api.post(`/admin/zones/${id}/revisions/rollback`, { revision_id: revisionId }),
    onSuccess: () => {
      toast.success('Zone rolled back. Existing orders remain assigned to their captured zone.');
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      queryClient.invalidateQueries({ queryKey: ['zone-revisions', selectedZone?.id] });
    },
    onError: (err: any) => toast.error(`Unable to rollback zone: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/zones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      setSelectedZone(null);
      toast.success('Zone deactivated. Existing order assignments were preserved.');
    },
    onError: (err: any) => toast.error(`Failed to delete zone: ${err.message}`)
  });

  const filteredZones = zones?.filter((z: any) => 
    String(z?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(z?.code || '').toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Zone Management</h1>
          <p className="text-zinc-500 mt-1">Define operational boundaries and manage meeting points.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => {
              setSelectedZone({ polygon_wkt: '' });
              setIsModalOpen(true);
            }}
            className="px-6 py-3 rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-light font-black text-sm uppercase tracking-widest transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} />
            Create Zone
          </button>
          <button 
            onClick={() => setIsDrawing(!isDrawing)}
            className={cn(
              "px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]",
              isDrawing ? "bg-red-500 text-white" : "bg-white/5 border border-white/10 text-zinc-300 hover:text-white"
            )}
          >
            {isDrawing ? <X size={18} /> : <MapIcon size={18} />}
            {isDrawing ? "Cancel Drawing" : "Draw Manual"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Zone List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search zones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredZones?.map((zone: any) => (
              <motion.div 
                key={zone.id}
                onClick={() => setSelectedZone(zone)}
                whileHover={{ x: 4 }}
                className={cn(
                  "glass-card p-6 rounded-3xl border-white/5 hover:border-white/10 cursor-pointer transition-all group",
                  selectedZone?.id === zone.id && "bg-primary/10 border-primary/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                    <div>
                      <h3 className="font-bold text-zinc-100">{zone.name}</h3>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{zone.code}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={cn(
                    "transition-colors",
                    selectedZone?.id === zone.id ? "text-primary-light" : "text-zinc-700 group-hover:text-primary-light"
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                   <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Couriers</p>
                      <p className="text-sm font-black text-zinc-200 mt-1">{zone.max_couriers || 0}</p>
                   </div>
                   <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Status</p>
                      <span className={cn(
                        "text-[10px] font-black uppercase",
                        zone.is_active ? "text-emerald-400" : "text-red-400"
                      )}>
                        {zone.is_active ? 'Active' : 'Inactive'}
                      </span>
                   </div>
                </div>
              </motion.div>
            ))}
            {(!filteredZones || filteredZones.length === 0) && (
              <div className="py-20 text-center space-y-4 glass-card rounded-[32px] border-dashed border-white/10">
                <MapIcon className="mx-auto text-zinc-800" size={48} />
                <p className="text-zinc-500 font-black italic uppercase tracking-widest italic">
                  No zones mapping detected
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Map Area */}
        <div className="lg:col-span-8 glass-card rounded-[48px] border-white/5 overflow-hidden relative h-[700px] min-h-[700px] bg-zinc-950">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <AttributionControl prefix={false} />
            <TileLayer
              url={tileUrl}
              attribution={tileAttribution}
            />

            <GeomanControl
              isDrawing={isDrawing}
              onCreated={(wkt: string) => {
                setSelectedZone({ polygon_wkt: wkt });
                setIsModalOpen(true);
              }}
            />

            {zones?.map((zone: any) => (
              <Polygon
                key={zone.id}
                positions={WKTToCoords(zone.polygon || zone.polygon_wkt)}
                pathOptions={{
                  color: '#10b981', // Premium bright emerald green outline
                  fillColor: '#10b981',
                  fillOpacity: selectedZone?.id === zone.id ? 0.35 : 0.08,
                  weight: selectedZone?.id === zone.id ? 4 : 1.5
                }}
                eventHandlers={{
                  click: () => setSelectedZone(zone)
                }}
              />
            ))}

            {selectedZone && !selectedZone.id && selectedZone.polygon_wkt && (
              <Polygon
                positions={WKTToCoords(selectedZone.polygon_wkt)}
                pathOptions={{
                  color: '#10b981', // Translucent emerald preview outline
                  fillColor: '#10b981',
                  fillOpacity: 0.4,
                  weight: 4,
                  dashArray: '6, 6' // Premium dashed look for unsaved preview
                }}
              />
            )}

            <MapEvents center={mapCenter} selectedZone={selectedZone} />
          </MapContainer>
          {mapsRuntimeConfig?.active_provider === 'tomtom_maps' && !shouldRenderTomTomMap && !isDrawing && (
            <TomTomRuntimeUnavailable message="TomTom Maps aktif, tetapi browser key runtime belum tersedia. Zone viewer memakai fallback map sementara." />
          )}

           {/* Toolbar Overlays */}
           <div className="absolute top-8 left-8 flex flex-col gap-3 z-[1000]">
              <div className="p-1 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 flex flex-col">
                <button className="p-4 text-white hover:text-primary-light transition-all rounded-xl">
                   <Maximize2 size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setMapTheme((current) => current === 'dark' ? 'light' : 'dark')}
                  className="p-4 text-white hover:text-primary-light transition-all rounded-xl active:scale-[0.98]"
                  aria-label={mapTheme === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
                >
                   {mapTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
           </div>

           <div className="absolute bottom-8 left-8 right-8 z-[1000]">
              <div className="p-6 rounded-[32px] bg-black/80 backdrop-blur-3xl border border-white/10 flex items-center justify-between">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                       <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-xs font-black text-zinc-300 uppercase tracking-widest">
                         {selectedZone ? selectedZone.name : mapTheme === 'dark' ? 'Dark Ops View' : 'Light Street View'}
                       </p>
                    </div>
                    <div className="h-4 w-px bg-white/10" />
                    <p className="text-[10px] text-zinc-500 font-medium italic">
                      {isDrawing ? 'DRAW MODE: Click on map to define perimeter' : 'Select a zone to adjust parameters or view geometry'}
                    </p>
                 </div>
                 
                 <div className="flex items-center gap-3">
                    {selectedZone && (
                      <>
                        <button 
                          onClick={() => setIsModalOpen(true)}
                          className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                           Edit Parameters
                        </button>
                        <button
                          onClick={() => previewMutation.mutate(selectedZone.id)}
                          disabled={previewMutation.isPending}
                          className="px-6 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          {previewMutation.isPending ? 'Loading Diff' : 'Preview Draft'}
                        </button>
                        <button 
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="px-6 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                           Deactivate Zone
                        </button>
                      </>
                    )}
                 </div>
              </div>
           </div>
        </div>
      </div>

      <ZoneModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (!selectedZone?.id) setSelectedZone(null);
        }}
        zone={selectedZone}
        onUpdatePolygon={(wkt: string) => setSelectedZone({ ...selectedZone, polygon_wkt: wkt })}
        onSave={(data: any) => {
          if (selectedZone?.id) {
            updateMutation.mutate({ id: selectedZone.id, data });
          } else {
            if (!selectedZone?.polygon_wkt) {
              toast.error('Perimeter boundary is required. Please fetch or draw a boundary first!');
              return;
            }
            createMutation.mutate({ ...data, polygon: selectedZone.polygon_wkt });
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      {zonePreview && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl bg-zinc-900 border border-amber-500/20 rounded-[40px] overflow-hidden shadow-2xl">
            <div className="p-10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-zinc-100 uppercase italic">Zone Revision Preview</h3>
                  <p className="text-xs text-zinc-500 mt-2">Revision {zonePreview.draft?.revision_number} · {zonePreview.diff?.active_orders_count || 0} active order assignments preserved</p>
                </div>
                <button onClick={() => setZonePreview(null)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-xs text-zinc-300 space-y-2">
                <p className="font-black uppercase tracking-widest text-amber-300">Changed fields</p>
                <p>{(zonePreview.diff?.changed_fields || []).join(', ') || 'No field changes detected'}</p>
                <p className="font-black uppercase tracking-widest text-amber-300 mt-4">Impact estimate</p>
                <p>
                  Markets: {(zonePreview.diff?.affected_markets || []).join(', ') || 'none'} · Services: {zonePreview.diff?.impact_estimate?.affected_service_count || 0}
                </p>
                {(zonePreview.diff?.affected_services || []).length > 0 && (
                  <p className="text-zinc-400">
                    Active services: {zonePreview.diff.affected_services.map((service: any) => `${service.service_code} (${service.active_orders_count})`).join(', ')}
                  </p>
                )}
                <p className="text-zinc-500">Draft changes do not affect routing until approved and published.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {zonePreview.draft?.status === 'draft' && (
                  <button onClick={() => approveMutation.mutate({ id: selectedZone.id, revisionId: zonePreview.draft.id })} disabled={approveMutation.isPending} className="px-5 py-3 rounded-xl bg-amber-500 text-zinc-950 font-black text-[10px] uppercase tracking-widest">Approve</button>
                )}
                {zonePreview.draft?.status === 'approved' && (
                  <button onClick={() => publishMutation.mutate({ id: selectedZone.id, revisionId: zonePreview.draft.id })} disabled={publishMutation.isPending} className="px-5 py-3 rounded-xl bg-emerald-500 text-zinc-950 font-black text-[10px] uppercase tracking-widest">Publish</button>
                )}
                <select
                  aria-label="Rollback target revision"
                  defaultValue=""
                  onChange={(event) => event.target.value && rollbackMutation.mutate({ id: selectedZone.id, revisionId: event.target.value })}
                  disabled={rollbackMutation.isPending}
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-black uppercase tracking-widest"
                >
                  <option value="">Rollback to published revision…</option>
                  {(zoneRevisions || []).filter((revision: any) => revision.status === 'published' && revision.id !== zonePreview.draft?.id).map((revision: any) => (
                    <option key={revision.id} value={revision.id}>Revision {revision.revision_number}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-zinc-500">Approval requires a different authenticated actor from the draft maker and TOTP. Publishing never detaches active orders.</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Premium Custom Deactivation Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-red-500/20 rounded-[40px] overflow-hidden shadow-2xl shadow-red-500/5"
          >
            <div className="p-10 space-y-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-black text-zinc-100 uppercase italic tracking-tight">Deactivate Zone?</h3>
                <p className="text-sm text-zinc-400 font-medium leading-relaxed">
                  Deactivate <span className="text-red-400 font-bold">"{selectedZone?.name}"</span>? Existing orders keep their captured zone assignment and historical revisions remain available for rollback.
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-xs uppercase tracking-widest transition-all hover:bg-zinc-700 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    deleteMutation.mutate(selectedZone.id, {
                      onSuccess: () => {
                        setIsDeleteConfirmOpen(false);
                      }
                    });
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 transition-all hover:bg-red-600 active:scale-[0.98]"
                >
                  {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Deactivate Now
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function MapEvents({ center, selectedZone }: any) {
  const map = useMap();
  
  useEffect(() => {
    if (selectedZone) {
      const coords = WKTToCoords(selectedZone.polygon || selectedZone.polygon_wkt);
      if (coords.length > 0) {
        map.fitBounds(coords as any, { padding: [50, 50] });
      }
    } else {
      map.setView(center, 13);
    }
  }, [selectedZone, center, map]);

  return null;
}

function GeomanControl({ isDrawing, onCreated }: { isDrawing: boolean, onCreated: (wkt: string) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map.pm) return;

    map.pm.setGlobalOptions({
      hintlineStyle: { color: '#006437', dashArray: [5, 5] },
      templineStyle: { color: '#006437' },
    });

    if (isDrawing) {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
        finishOn: 'dblclick',
      });
    } else {
      map.pm.disableDraw();
    }

    const handleCreate = (e: any) => {
      const { layer } = e;
      const wkt = coordsToWKT(layer.getLatLngs());
      onCreated(wkt);
      map.removeLayer(layer);
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.off('pm:create', handleCreate);
      map.pm.disableDraw();
    };
  }, [map, isDrawing, onCreated]);

  return null;
}

function ZoneModal({ isOpen, onClose, zone, onUpdatePolygon, onSave, isSaving }: any) {
  const [formData, setFormData] = useState<any>({
    name: '',
    code: '',
    market_code: 'ID-JK',
    max_couriers: 10,
    is_active: true
  });

  const [searchRegion, setSearchRegion] = useState('');
  const [isFetchingRegion, setIsFetchingRegion] = useState(false);

  const handleFetchBoundary = async () => {
    if (!searchRegion) {
      toast.error('Please enter a region name first (e.g. Surabaya)');
      return;
    }
    setIsFetchingRegion(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchRegion)}&format=json&polygon_geojson=1&limit=10`);
      const data = await res.json();
      if (!data || data.length === 0) {
        toast.error('No administrative region found for that name.');
        return;
      }
      // Find the first result that is a Polygon or MultiPolygon
      let item = data.find((d: any) => {
        const geo = d.geojson || d.polygon_geojson;
        return geo && (geo.type === 'Polygon' || geo.type === 'MultiPolygon');
      });
      if (!item) {
        // Fallback to first item that has geojson
        item = data.find((d: any) => d.geojson || d.polygon_geojson);
      }
      if (!item) {
        toast.error('The selected location does not provide polygon boundary data.');
        return;
      }
      
      // Convert to WKT
      const geojson = item.geojson || item.polygon_geojson;
      let wkt = '';
      if (geojson.type === 'Polygon') {
        const ring = geojson.coordinates[0];
        const pts = ring.map((pt: any) => `${pt[0]} ${pt[1]}`).join(', ');
        wkt = `POLYGON((${pts}))`;
      } else if (geojson.type === 'MultiPolygon') {
        const polygons = geojson.coordinates.map((polygon: any[]) => {
          const rings = polygon.map((ring: any[]) => `(${ring.map((pt: any) => `${pt[0]} ${pt[1]}`).join(', ')})`);
          return `(${rings.join(', ')})`;
        });
        wkt = `MULTIPOLYGON(${polygons.join(', ')})`;
      }

      if (!wkt) {
        toast.error('Unable to convert region boundary geometry to WKT format.');
        return;
      }

      onUpdatePolygon(wkt);
      setFormData((prev: any) => ({
        ...prev,
        name: prev.name || item.name || item.display_name.split(',')[0],
        code: prev.code || (item.name || item.display_name.split(',')[0]).substring(0, 4).toUpperCase()
      }));
      toast.success(`Successfully fetched boundary for ${item.name || item.display_name.split(',')[0]}`);
    } catch (err: any) {
      toast.error(`Error querying Nominatim API: ${err.message}`);
    } finally {
      setIsFetchingRegion(false);
    }
  };

  useEffect(() => {
    if (zone?.id) {
      setFormData({
        name: zone.name,
        code: zone.code,
        market_code: zone.market_code || 'ID-JK',
        max_couriers: zone.max_couriers,
        is_active: zone.is_active
      });
    } else {
      setFormData({
        name: '',
        code: '',
        market_code: 'ID-JK',
        max_couriers: 10,
        is_active: true
      });
      setSearchRegion('');
    }
  }, [zone]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[40px] overflow-hidden"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-zinc-100 uppercase italic tracking-tight">Zone Parameters</h2>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
          </div>

          <div className="space-y-6">
            {!zone?.id && (
              <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 space-y-3">
                <label className="text-[10px] font-black text-primary-light uppercase tracking-widest">Auto-Fetch Boundary</label>
                <div className="flex gap-3">
                  <input 
                    placeholder="Enter city/region (e.g. Surabaya)"
                    value={searchRegion}
                    onChange={e => setSearchRegion(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={handleFetchBoundary}
                    disabled={isFetchingRegion}
                    className="px-4 py-3 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary-light font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-[0.98]"
                  >
                    {isFetchingRegion ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    Fetch
                  </button>
                </div>
                <p className="text-[9px] text-zinc-500 font-medium italic">Queries OpenStreetMap for verified administrative boundaries automatically.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Zone Name</label>
              <input 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Zone Code</label>
              <input 
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                disabled={!!zone?.id}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Market Code</label>
              <input
                value={formData.market_code}
                onChange={e => setFormData({ ...formData, market_code: e.target.value.toUpperCase() })}
                placeholder="ID-JK"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Max Couriers</label>
                <input 
                  type="number"
                  value={formData.max_couriers}
                  onChange={e => setFormData({ ...formData, max_couriers: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Status</label>
                <button 
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
                    formData.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}
                >
                  {formData.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-xs uppercase tracking-widest"
            >
              Abort
            </button>
            <button 
              onClick={() => onSave(formData)}
              disabled={isSaving}
              className="flex-1 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Commit Changes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
