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
  Sun,
  Trash2
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { FocusTrap } from '../components/a11y/FocusTrap'
import { MapZoomControls } from '../components/MapZoomControls'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_TILE_URL,
  CARTO_LIGHT_ATTRIBUTION,
  CARTO_LIGHT_TILE_URL,
  TOMTOM_RASTER_ATTRIBUTION,
  TomTomRuntimeUnavailable,
  isTomTomRuntimeReady,
  tomTomRasterTileUrl,
  useMapsRuntimeConfig
} from '../components/TomTomMapsRuntime'
import { useTheme } from '../providers/ThemeProvider'

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
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('')
  const [selectedZone, setSelectedZone] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mapCenter] = useState<[number, number]>([-6.2088, 106.8456]) // Jakarta
  const [isDrawing, setIsDrawing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [mapThemeOverride, setMapThemeOverride] = useState<'dark' | 'light' | null>(null)
  const mapTheme = mapThemeOverride ?? resolvedTheme
  const [zonePreview, setZonePreview] = useState<any>(null)
  
  const { data: zones, isLoading, isError, refetch: refetchZones } = useQuery({
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
    : resolvedTheme === 'dark' ? CARTO_DARK_TILE_URL : CARTO_LIGHT_TILE_URL;
  const tileAttribution = shouldRenderTomTomMap
    ? TOMTOM_RASTER_ATTRIBUTION
    : resolvedTheme === 'dark' ? CARTO_DARK_ATTRIBUTION : CARTO_LIGHT_ATTRIBUTION;

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
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Zone Management</h1>
          <p className="text-foreground-muted mt-1">Define operational boundaries and manage meeting points.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => {
              setSelectedZone({ polygon_wkt: '' });
              setIsModalOpen(true);
            }}
            className="px-6 py-3 rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20 hover:bg-primary-light font-black text-sm uppercase tracking-wide transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} aria-hidden="true" />
            Create Zone
          </button>
          <button 
            onClick={() => setIsDrawing(!isDrawing)}
            className={cn(
              "px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wide shadow-lg transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]",
              isDrawing ? "bg-error text-on-error" : "bg-surface-subtle border border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {isDrawing ? <X size={18} aria-hidden="true" /> : <MapIcon size={18} aria-hidden="true" />}
            {isDrawing ? "Cancel Drawing" : "Draw Manual"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Zone List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted group-focus-within:text-primary-light transition-colors" size={18} aria-hidden="true" />
            <input 
              aria-label="Search zones"
              type="text" 
              placeholder="Search zones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-subtle border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted"
            />
          </div>

          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredZones?.map((zone: any) => (
              <motion.div 
                key={zone.id}
                onClick={() => setSelectedZone(zone)}
                whileHover={{ x: 4 }}
                className={cn(
                  "glass-card p-6 rounded-3xl border-border hover:border-border cursor-pointer transition-all group",
                  selectedZone?.id === zone.id && "bg-primary/10 border-primary/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                    <div>
                      <h3 className="font-bold text-foreground-muted">{zone.name}</h3>
                      <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">{zone.code}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={cn(
                    "transition-colors",
                    selectedZone?.id === zone.id ? "text-primary-light" : "text-foreground-muted group-hover:text-primary-light"
                  )} aria-hidden="true" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                   <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                      <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Couriers</p>
                      <p className="text-sm font-black text-foreground-muted mt-1">{zone.max_couriers || 0}</p>
                   </div>
                   <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                      <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Status</p>
                      <span className={cn(
                        "text-xs font-black uppercase",
                        zone.is_active ? "text-success" : "text-error"
                      )}>
                        {zone.is_active ? 'Active' : 'Inactive'}
                      </span>
                   </div>
                </div>
              </motion.div>
            ))}
            {(!filteredZones || filteredZones.length === 0) && (
              <div className="py-20 text-center space-y-4 glass-card rounded-[32px] border-dashed border-border">
                <MapIcon className="mx-auto text-foreground-muted" size={48} aria-hidden="true" />
                <p className="text-foreground-muted font-black italic uppercase tracking-wide italic">
                  No zones mapping detected
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Map Area */}
        <div className="lg:col-span-8 glass-card rounded-[48px] border-border overflow-hidden relative h-[700px] min-h-[700px] bg-background" role="region" aria-label="Zone map editor" aria-describedby="zones-map-summary">
          <p id="zones-map-summary" className="sr-only">
            Zone map editor. {Array.isArray(zones) ? `${zones.length} zone polygon${zones.length === 1 ? '' : 's'} loaded.` : 'Zone data is loading.'} {selectedZone?.name ? `Selected zone: ${selectedZone.name}.` : 'No zone is selected.'} Polygon selection and drawing state are also represented by the visible editor controls.
          </p>
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
            <MapZoomControls label="Kontrol zoom editor zona" />

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
          {isError && (
            <div role="alert" aria-live="assertive" className="absolute inset-x-4 top-20 z-[1000] rounded-2xl border border-error bg-error-surface p-4 text-sm text-error shadow-lg shadow-scrim">
              <p>Data zona belum bisa dimuat.</p>
              <button type="button" onClick={() => refetchZones()} className="mt-3 rounded-xl border border-error px-3 py-2 text-xs font-black uppercase tracking-wide text-error hover:bg-error-surface">
                Coba lagi
              </button>
            </div>
          )}

           {/* Toolbar Overlays */}
           <div className="absolute top-8 left-8 flex flex-col gap-3 z-[1000]">
              <div className="p-1 rounded-2xl bg-surface-raised border border-border flex flex-col">
                <button type="button" aria-label="Maximize zone map" title="Maximize zone map" className="p-4 text-foreground hover:text-primary-light transition-all rounded-xl">
                   <Maximize2 size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapThemeOverride(mapTheme === 'dark' ? 'light' : 'dark')}
                  className="p-4 text-foreground hover:text-primary-light transition-all rounded-xl active:scale-[0.98]"
                  aria-label={mapTheme === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
                  title={mapTheme === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
                >
                   {mapTheme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                </button>
              </div>
           </div>

           <div className="absolute bottom-8 left-8 right-8 z-[1000]">
              <div className="p-6 rounded-[32px] bg-surface-raised border border-border flex items-center justify-between">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                       <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">
                         {selectedZone ? selectedZone.name : mapTheme === 'dark' ? 'Dark Ops View' : 'Light Street View'}
                       </p>
                    </div>
                    <div className="h-4 w-px bg-surface-subtle" />
                    <p className="text-xs text-foreground-muted font-medium italic">
                      {isDrawing ? 'DRAW MODE: Click on map to define perimeter' : 'Select a zone to adjust parameters or view geometry'}
                    </p>
                 </div>
                 
                 <div className="flex items-center gap-3">
                    {selectedZone && (
                      <>
                        <button 
                          onClick={() => setIsModalOpen(true)}
                          className="px-6 py-2.5 rounded-xl bg-surface-subtle border border-border text-foreground-muted hover:text-foreground text-xs font-black uppercase tracking-wide transition-all"
                        >
                           Edit Parameters
                        </button>
                        <button
                          onClick={() => previewMutation.mutate(selectedZone.id)}
                          disabled={previewMutation.isPending}
                          className="px-6 py-2.5 rounded-xl bg-warning-surface border border-warning text-warning hover:bg-warning hover:text-on-warning text-xs font-black uppercase tracking-wide transition-all"
                        >
                          {previewMutation.isPending ? 'Loading Diff' : 'Preview Draft'}
                        </button>
                        <button 
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="px-6 py-2.5 rounded-xl bg-error-surface border border-error text-error hover:bg-error hover:text-on-error text-xs font-black uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
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
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-surface-subtle backdrop-blur-md">
          <FocusTrap active={Boolean(zonePreview)} className="w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zone-revision-preview-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setZonePreview(null)
            }}
            className="w-full max-w-2xl bg-surface border border-warning rounded-[40px] overflow-hidden shadow-2xl"
          >
            <div className="p-10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 id="zone-revision-preview-title" className="text-xl font-black text-foreground-muted uppercase italic">Zone Revision Preview</h2>
                  <p className="text-xs text-foreground-muted mt-2">Revision {zonePreview.draft?.revision_number} · {zonePreview.diff?.active_orders_count || 0} active order assignments preserved</p>
                </div>
                <button type="button" onClick={() => setZonePreview(null)} aria-label="Close zone revision preview" title="Close zone revision preview" className="p-2 text-foreground-muted hover:text-foreground"><X size={20} aria-hidden="true" /></button>
              </div>
              <div className="rounded-2xl bg-surface-subtle border border-border p-5 text-xs text-foreground-muted space-y-2">
                <p className="font-black uppercase tracking-wide text-warning">Changed fields</p>
                <p>{(zonePreview.diff?.changed_fields || []).join(', ') || 'No field changes detected'}</p>
                <p className="font-black uppercase tracking-wide text-warning mt-4">Impact estimate</p>
                <p>
                  Markets: {(zonePreview.diff?.affected_markets || []).join(', ') || 'none'} · Services: {zonePreview.diff?.impact_estimate?.affected_service_count || 0}
                </p>
                {(zonePreview.diff?.affected_services || []).length > 0 && (
                  <p className="text-foreground-muted">
                    Active services: {zonePreview.diff.affected_services.map((service: any) => `${service.service_code} (${service.active_orders_count})`).join(', ')}
                  </p>
                )}
                <p className="text-foreground-muted">Draft changes do not affect routing until approved and published.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {zonePreview.draft?.status === 'draft' && (
                  <button type="button" onClick={() => approveMutation.mutate({ id: selectedZone.id, revisionId: zonePreview.draft.id })} disabled={approveMutation.isPending} className="px-5 py-3 rounded-xl bg-warning text-on-warning font-black text-xs uppercase tracking-wide">Approve</button>
                )}
                {zonePreview.draft?.status === 'approved' && (
                  <button type="button" onClick={() => publishMutation.mutate({ id: selectedZone.id, revisionId: zonePreview.draft.id })} disabled={publishMutation.isPending} className="px-5 py-3 rounded-xl bg-success text-on-success font-black text-xs uppercase tracking-wide">Publish</button>
                )}
                <select
                  aria-label="Rollback target revision"
                  defaultValue=""
                  onChange={(event) => event.target.value && rollbackMutation.mutate({ id: selectedZone.id, revisionId: event.target.value })}
                  disabled={rollbackMutation.isPending}
                  className="px-4 py-3 rounded-xl bg-surface-subtle border border-border text-foreground-muted text-xs font-black uppercase tracking-wide"
                >
                  <option value="">Rollback to published revision…</option>
                  {(zoneRevisions || []).filter((revision: any) => revision.status === 'published' && revision.id !== zonePreview.draft?.id).map((revision: any) => (
                    <option key={revision.id} value={revision.id}>Revision {revision.revision_number}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-foreground-muted">Approval requires a different authenticated actor from the draft maker and TOTP. Publishing never detaches active orders.</p>
            </div>
          </motion.div>
          </FocusTrap>
        </div>
      )}

      {/* Premium Custom Deactivation Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-surface-subtle backdrop-blur-md">
          <FocusTrap active={isDeleteConfirmOpen} className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zone-deactivate-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsDeleteConfirmOpen(false)
            }}
            className="w-full max-w-md bg-surface border border-error rounded-[40px] overflow-hidden shadow-2xl shadow-error"
          >
            <div className="p-10 space-y-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-error-surface border border-error flex items-center justify-center text-error">
                <Trash2 className="w-8 h-8 animate-pulse" aria-hidden="true" />
              </div>

              <div className="space-y-3">
                <h2 id="zone-deactivate-title" className="text-xl font-black text-foreground-muted uppercase italic tracking-tight">Deactivate Zone?</h2>
                <p className="text-sm text-foreground-muted font-medium leading-relaxed">
                  Deactivate <span className="text-error font-bold">"{selectedZone?.name}"</span>? Existing orders keep their captured zone assignment and historical revisions remain available for rollback.
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-surface-raised text-foreground-muted font-black text-xs uppercase tracking-wide transition-all hover:bg-surface-subtle active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteMutation.mutate(selectedZone.id, {
                      onSuccess: () => {
                        setIsDeleteConfirmOpen(false);
                      }
                    });
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-4 rounded-2xl bg-error text-on-error font-black text-xs uppercase tracking-wide shadow-lg shadow-error flex items-center justify-center gap-2 transition-all hover:bg-error active:scale-[0.98]"
                >
                  {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                  Deactivate Now
                </button>
              </div>
            </div>
          </motion.div>
          </FocusTrap>
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-surface-subtle backdrop-blur-sm">
      <FocusTrap active={isOpen} className="w-full max-w-lg">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zone-parameters-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        className="w-full max-w-lg bg-surface border border-border rounded-[40px] overflow-hidden"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <h2 id="zone-parameters-title" className="text-xl font-black text-foreground-muted uppercase italic tracking-tight">Zone Parameters</h2>
            <button type="button" onClick={onClose} aria-label="Tutup detail zona" title="Tutup detail zona" className="p-2 text-foreground-muted hover:text-foreground"><X size={20} aria-hidden="true" /></button>
          </div>

          <div className="space-y-6">
            {!zone?.id && (
              <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 space-y-3">
                <label htmlFor="zone-boundary-search" className="text-xs font-bold text-primary-light tracking-wide">Auto-Fetch Boundary</label>
                <div className="flex gap-3">
                  <input
                    id="zone-boundary-search"
                    name="zone-boundary-search"
                    placeholder="Enter city/region (e.g. Surabaya)"
                    value={searchRegion}
                    onChange={e => setSearchRegion(e.target.value)}
                    className="flex-1 bg-surface-subtle border border-border rounded-xl py-3 px-4 text-xs text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted"
                  />
                  <button
                    type="button"
                    onClick={handleFetchBoundary}
                    disabled={isFetchingRegion}
                    className="px-4 py-3 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary-light font-black text-xs uppercase tracking-wide transition-all flex items-center gap-1.5 active:scale-[0.98]"
                  >
                    {isFetchingRegion ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Search size={12} aria-hidden="true" />}
                    Fetch
                  </button>
                </div>
                <p className="text-xs text-foreground-muted font-medium italic">Queries OpenStreetMap for verified administrative boundaries automatically.</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="zone-name" className="text-xs font-bold text-foreground-muted tracking-wide">Zone Name</label>
              <input
                id="zone-name"
                name="zone-name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="zone-code" className="text-xs font-bold text-foreground-muted tracking-wide">Zone Code</label>
              <input
                id="zone-code"
                name="zone-code"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                disabled={!!zone?.id}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="zone-market-code" className="text-xs font-bold text-foreground-muted tracking-wide">Market Code</label>
              <input
                id="zone-market-code"
                name="zone-market-code"
                value={formData.market_code}
                onChange={e => setFormData({ ...formData, market_code: e.target.value.toUpperCase() })}
                placeholder="ID-JK"
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="zone-max-couriers" className="text-xs font-bold text-foreground-muted tracking-wide">Max Couriers</label>
                <input
                  id="zone-max-couriers"
                  name="zone-max-couriers"
                  type="number"
                  value={formData.max_couriers}
                  onChange={e => setFormData({ ...formData, max_couriers: Number(e.target.value) })}
                  className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
              <div className="space-y-2">
                <span className="text-xs font-black text-foreground-muted uppercase tracking-wide">Status</span>
                <button
                  type="button"
                  aria-pressed={formData.is_active}
                  aria-label={`Zone status ${formData.is_active ? 'active' : 'inactive'}`}
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                    formData.is_active ? "bg-success-surface text-success border border-success" : "bg-error-surface text-error border border-error"
                  )}
                >
                  {formData.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-surface-raised text-foreground-muted font-black text-xs uppercase tracking-wide"
            >
              Abort
            </button>
            <button
              type="button"
              onClick={() => onSave(formData)}
              disabled={isSaving}
              className="flex-1 py-4 rounded-2xl bg-primary text-on-primary font-black text-xs uppercase tracking-wide shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              Commit Changes
            </button>
          </div>
        </div>
      </motion.div>
      </FocusTrap>
    </div>
  );
}
