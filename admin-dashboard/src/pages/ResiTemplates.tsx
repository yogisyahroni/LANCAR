import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, XCircle, Code2, GripVertical, Image as ImageIcon, Type, QrCode, Barcode as BarcodeIcon, Leaf, AlertTriangle, Square, Minus, Upload, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api'
import { adminApiRootUrl } from '../lib/runtimeConfig'
import { createClientId } from '../lib/clientId'
import { toast } from 'sonner'
import { Button } from '../components/Button'
import { FocusTrap } from '../components/a11y/FocusTrap'
import { StatusBadge } from '../components/StatusBadge'
import Barcode from 'react-barcode'

interface ResiTemplate {
  id: string
  name: string
  paper_size?: string
  layout_config: any
  is_active: boolean
  provider_code?: string
  created_at: string
  updated_at: string
}

interface LogisticsProvider {
  id: string
  code: string
  name: string
}

type ElementType = 'text' | 'qrcode' | 'barcode' | 'logo' | 'image' | 'eco_icon' | 'fragile_badge' | 'box' | 'h_line' | 'v_line' | 'tembus_logo'

interface DesignElement {
  id: string
  type: ElementType
  x: number
  y: number
  width?: number
  height?: number
  value: string
  fontSize?: number
  fontWeight?: string
  barWidth?: number
}

interface ResiBranding {
  tembusLogo: string
  providerLogo: string
}

type AssetUploadTarget = 'tembus' | 'provider' | 'image'

const TOOLBOX_ITEMS: Array<{ type: ElementType; label: string; icon: React.ComponentType<{ className?: string }>; defaultVal: string; width?: number; height?: number }> = [
  { type: 'text', label: 'Teks', icon: Type, defaultVal: '{{awb_number}}' },
  { type: 'barcode', label: 'Barcode', icon: BarcodeIcon, defaultVal: '{{awb_number}}' },
  { type: 'qrcode', label: 'QR Code', icon: QrCode, defaultVal: '{{tracking_url}}' },
  { type: 'logo', label: 'Logo Provider (Otomatis)', icon: ImageIcon, defaultVal: 'provider_logo' },
  { type: 'image', label: 'Gambar Custom', icon: ImageIcon, defaultVal: '', width: 100, height: 40 },
  { type: 'eco_icon', label: 'Eco Badge', icon: Leaf, defaultVal: '' },
  { type: 'fragile_badge', label: 'Fragile Badge', icon: AlertTriangle, defaultVal: '' },
  { type: 'box', label: 'Kotak (Box)', icon: Square, defaultVal: '', width: 200, height: 100 },
  { type: 'h_line', label: 'Garis Horisontal', icon: Minus, defaultVal: '', width: 200, height: 2 },
  { type: 'v_line', label: 'Garis Vertikal', icon: Minus, defaultVal: '', width: 2, height: 200 },
  { type: 'tembus_logo', label: 'Logo TEMBUS', icon: ImageIcon, defaultVal: '', width: 120, height: 30 },
]

const PAPER_SIZES = {
  A6: { width: 384, height: 576, label: 'A6 (100 × 150 mm)' },
  A4: { width: 794, height: 1123, label: 'A4 (210 × 297 mm)' },
} as const
type PaperSize = keyof typeof PAPER_SIZES

const DEFAULT_TEMBUS_LOGO = '/tembusweb-resi.svg'
const RESI_ASSET_MAX_BYTES = 2 * 1024 * 1024
const SUPPORTED_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const isSafeImageSource = (value: string) => value.startsWith('/') || /^https?:\/\//i.test(value)
const resolveAdminAssetUrl = (value: string) => value.startsWith('/uploads/') ? `${adminApiRootUrl}${value}` : value

const createDefaultTembusElements = (): DesignElement[] => [
  { id: createClientId('resi-element'), type: 'tembus_logo', x: 12, y: 10, value: '', width: 128, height: 32 },
  { id: createClientId('resi-element'), type: 'text', x: 248, y: 18, value: 'COD: {{cod_amount}}', fontSize: 13, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'h_line', x: 10, y: 52, value: '', width: 364, height: 2 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 62, value: 'No. Resi', fontSize: 10, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'barcode', x: 142, y: 60, value: '{{awb_number}}', width: 230, height: 46, barWidth: 1.7 },
  { id: createClientId('resi-element'), type: 'text', x: 144, y: 110, value: '{{awb_number}}', fontSize: 9 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 120, value: 'BERAT: {{weight}}', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'text', x: 132, y: 120, value: 'QTY: {{total_items}} PCS', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'text', x: 270, y: 120, value: '{{service_name}}', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'h_line', x: 10, y: 140, value: '', width: 364, height: 2 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 150, value: 'PENGIRIM', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 166, value: '{{sender_name}}', fontSize: 10, fontWeight: 'bold', width: 172 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 182, value: '{{sender_phone}}', fontSize: 9, width: 172 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 198, value: '{{sender_address}}', fontSize: 9, width: 172, height: 48 },
  { id: createClientId('resi-element'), type: 'text', x: 204, y: 150, value: 'PENERIMA', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'text', x: 204, y: 166, value: '{{receiver_name}}', fontSize: 10, fontWeight: 'bold', width: 168 },
  { id: createClientId('resi-element'), type: 'text', x: 204, y: 182, value: '{{receiver_phone}}', fontSize: 9, width: 168 },
  { id: createClientId('resi-element'), type: 'text', x: 204, y: 198, value: '{{receiver_address}}', fontSize: 9, width: 168, height: 48 },
  { id: createClientId('resi-element'), type: 'h_line', x: 10, y: 258, value: '', width: 364, height: 2 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 268, value: 'ISI PAKET', fontSize: 9, fontWeight: 'bold' },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 284, value: '{{item_description}}', fontSize: 10, width: 360, height: 32 },
  { id: createClientId('resi-element'), type: 'h_line', x: 10, y: 330, value: '', width: 364, height: 2 },
  { id: createClientId('resi-element'), type: 'qrcode', x: 16, y: 344, value: '{{tracking_url}}', width: 78, height: 78 },
  { id: createClientId('resi-element'), type: 'text', x: 110, y: 350, value: 'SCAN QR UNTUK LACAK PAKET', fontSize: 10, fontWeight: 'bold', width: 250 },
  { id: createClientId('resi-element'), type: 'text', x: 110, y: 370, value: 'Lacak status pengiriman di sistem TEMBUS.', fontSize: 9, width: 250, height: 30 },
  { id: createClientId('resi-element'), type: 'h_line', x: 10, y: 445, value: '', width: 364, height: 2 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 456, value: 'Order ID: {{order_id}}', fontSize: 9, fontWeight: 'bold', width: 145 },
  { id: createClientId('resi-element'), type: 'barcode', x: 160, y: 450, value: '{{order_id}}', width: 210, height: 38, barWidth: 1.2 },
  { id: createClientId('resi-element'), type: 'text', x: 12, y: 516, value: 'Powered by TEMBUS · tembus.id', fontSize: 9, fontWeight: 'bold' },
]

const isWrappedText = (value: string) => /address|description|item_names/i.test(value)

const ResiTemplates = () => {
  const [templates, setTemplates] = useState<ResiTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ResiTemplate | null>(null)
  
  const [name, setName] = useState('')
  const [paperSize, setPaperSize] = useState<PaperSize>('A6')
  const [isActive, setIsActive] = useState(false)
  const [providerCode, setProviderCode] = useState<string>('')
  const [providers, setProviders] = useState<LogisticsProvider[]>([])
  const [elements, setElements] = useState<DesignElement[]>([])
  const [branding, setBranding] = useState<ResiBranding>({ tembusLogo: DEFAULT_TEMBUS_LOGO, providerLogo: '' })
  const [assetUploading, setAssetUploading] = useState<AssetUploadTarget | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const pointerDragRef = useRef<{
    id: string
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const resolvePreviewValue = (val: string) => {
    if (!val) return '';
    return val
      .replace(/{{order_number}}/g, 'ORD-2026-00123')
      .replace(/{{awb_number}}/g, 'JP1234567890')
      .replace(/{{provider_name}}/g, 'JNE EXPRESS')
      .replace(/{{service_type}}/g, 'REG / EZ')
      .replace(/{{service_name}}/g, 'REGULAR')
      .replace(/{{total_price}}/g, 'Rp 25.000')
      .replace(/{{total_price_idr}}/g, '25.000')
      .replace(/{{customer_name}}/g, 'Andi Wijaya')
      .replace(/{{sender_name}}/g, 'Toko TEMBUS Official')
      .replace(/{{sender_phone}}/g, '0812-3456-7890')
      .replace(/{{sender_address}}/g, 'Jl. Sudirman No. 45, Jakarta Pusat 10210')
      .replace(/{{pickup_address}}/g, 'Jl. Sudirman No. 45, Jakarta Pusat 10210')
      .replace(/{{receiver_name}}/g, 'Andi Wijaya')
      .replace(/{{receiver_phone}}/g, '0857-9876-5432')
      .replace(/{{receiver_address}}/g, 'Jl. Gatot Subroto No. 88, Blok C2, Bandung 40123')
      .replace(/{{dropoff_address}}/g, 'Jl. Gatot Subroto No. 88, Blok C2, Bandung 40123')
      .replace(/{{item_names}}/g, '1x Kemeja Batik Pria (L), 2x Kaos Polos')
      .replace(/{{item_description}}/g, '1x Kemeja Batik Pria (L), 2x Kaos Polos')
      .replace(/{{total_weight}}/g, '1.2')
      .replace(/{{weight}}/g, '1.2 kg')
      .replace(/{{total_items}}/g, '3')
      .replace(/{{routing_code}}/g, 'JKT-BDG')
      .replace(/{{cod_amount}}/g, 'Rp 0')
      .replace(/{{order_id}}/g, 'ORD-2026-00123')
      .replace(/{{tracking_url}}/g, 'https://tembus.id/track/JP1234567890');
  };

  useEffect(() => {
    fetchTemplates()
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      const res = await api.get('/admin/logistics-providers')
      setProviders(res.data)
    } catch (err: any) {
      console.error('Failed to fetch providers', err)
    }
  }

  const fetchTemplates = async () => {
    try {
      setIsLoading(true)
      const res = await api.get('/admin/resi-templates')
      setTemplates(res.data)
    } catch (err: any) {
      toast.error('Failed to fetch templates: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenModal = (t?: ResiTemplate) => {
    if (t) {
      setEditingTemplate(t)
      setName(t.name || 'TEMBUS Standard A6')
      setPaperSize(t.paper_size === 'A4' ? 'A4' : 'A6')
      setIsActive(t.is_active)
      setProviderCode(t.provider_code || '')
      try {
        const layoutConfig = typeof t.layout_config === 'string' ? JSON.parse(t.layout_config) : t.layout_config
        setBranding({
          tembusLogo: layoutConfig?.branding?.tembusLogo || DEFAULT_TEMBUS_LOGO,
          providerLogo: layoutConfig?.branding?.providerLogo || '',
        })
        setElements(Array.isArray(layoutConfig?.elements) && layoutConfig.elements.length > 0
          ? layoutConfig.elements
          : createDefaultTembusElements())
      } catch(e) {
        setBranding({ tembusLogo: DEFAULT_TEMBUS_LOGO, providerLogo: '' })
        setElements(createDefaultTembusElements())
      }
    } else {
      setEditingTemplate(null)
      setName('TEMBUS Standard A6')
      setPaperSize('A6')
      setIsActive(true)
      setProviderCode('')
      setBranding({ tembusLogo: DEFAULT_TEMBUS_LOGO, providerLogo: '' })
      setElements(createDefaultTembusElements())
    }
    setSelectedElementId(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingTemplate(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const layout_config = {
      layout: 'standard',
      branding,
      elements
    }

    const payload = {
      name,
      paper_size: paperSize,
      layout_config,
      is_active: isActive,
      provider_code: providerCode === '' ? null : providerCode
    }

    try {
      if (editingTemplate) {
        await api.put(`/admin/resi-templates/${editingTemplate.id}`, payload)
        toast.success('Template updated successfully')
      } else {
        await api.post('/admin/resi-templates', payload)
        toast.success('Template created successfully')
      }
      handleCloseModal()
      fetchTemplates()
    } catch (err: any) {
      toast.error('Failed to save template: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      await api.delete(`/admin/resi-templates/${id}`)
      toast.success('Template deleted')
      fetchTemplates()
    } catch (err: any) {
      toast.error('Failed to delete template: ' + err.message)
    }
  }

  const handleSetActive = async (id: string) => {
    try {
      const t = templates.find(x => x.id === id)
      if (!t) return
      await api.put(`/admin/resi-templates/${id}`, {
        name: t.name,
        paper_size: t.paper_size || 'A6',
        layout_config: t.layout_config,
        is_active: true,
        provider_code: t.provider_code || null,
      })
      toast.success('Template set as active')
      fetchTemplates()
    } catch (err: any) {
      toast.error('Failed to set active: ' + err.message)
    }
  }

  const onDragStart = (e: React.DragEvent, item: typeof TOOLBOX_ITEMS[number]) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('type', item.type)
    e.dataTransfer.setData('defaultVal', item.defaultVal)
    e.dataTransfer.setData('width', String(item.width || ''))
    e.dataTransfer.setData('height', String(item.height || ''))
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type') as ElementType
    if (!type) return
    const defaultVal = e.dataTransfer.getData('defaultVal')

    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const width = Number(e.dataTransfer.getData('width')) || (type === 'barcode' ? 200 : type === 'qrcode' ? 80 : 100)
    const height = Number(e.dataTransfer.getData('height')) || (type === 'barcode' ? 50 : type === 'qrcode' ? 80 : 40)
    const canvasSize = PAPER_SIZES[paperSize]
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))
    const x = clamp(e.clientX - rect.left, 0, canvasSize.width - width)
    const y = clamp(e.clientY - rect.top, 0, canvasSize.height - height)

    const newElement: DesignElement = {
      id: createClientId('resi-element'),
      type,
      x,
      y,
      value: defaultVal,
      fontSize: 14,
      width,
      height,
    }
    setElements(current => [...current, newElement])
    setSelectedElementId(newElement.id)
  }

  const onCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleAssetUpload = async (target: AssetUploadTarget, file?: File) => {
    if (!file) return
    if (!SUPPORTED_ASSET_TYPES.includes(file.type)) {
      toast.error('Gunakan file PNG, JPG, atau WebP untuk aset resi.')
      return
    }
    if (file.size > RESI_ASSET_MAX_BYTES) {
      toast.error('Ukuran aset resi maksimal 2 MB.')
      return
    }

    setAssetUploading(target)
    try {
      const payload = new FormData()
      payload.append('file', file)
      const response = await api.post('/admin/resi-templates/upload-asset', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const fileUrl = String(response.data?.data?.file_url || '')
      if (!fileUrl) throw new Error('URL aset tidak diterima dari server')

      if (target === 'image') {
        if (selectedElementId) updateElement(selectedElementId, { value: fileUrl })
      } else {
        setBranding((current) => ({ ...current, [target === 'tembus' ? 'tembusLogo' : 'providerLogo']: fileUrl }))
      }
      toast.success(target === 'image' ? 'Gambar berhasil diupload' : 'Logo berhasil diupload')
    } catch (error: any) {
      toast.error(`Upload aset gagal: ${error.response?.data?.error || error.message}`)
    } finally {
      setAssetUploading(null)
    }
  }

  const addElement = (item: typeof TOOLBOX_ITEMS[number], x = 12, y = 12) => {
    const width = item.width || (item.type === 'barcode' ? 200 : item.type === 'qrcode' ? 80 : 100)
    const height = item.height || (item.type === 'barcode' ? 50 : item.type === 'qrcode' ? 80 : 40)
    const element: DesignElement = {
      id: createClientId('resi-element'),
      type: item.type,
      x: Math.min(x, Math.max(0, canvasSize.width - width)),
      y: Math.min(y, Math.max(0, canvasSize.height - height)),
      value: item.defaultVal,
      fontSize: 14,
      width,
      height,
    }
    setElements(current => [...current, element])
    setSelectedElementId(element.id)
  }

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left) * (canvasSize.width / rect.width),
      y: (clientY - rect.top) * (canvasSize.height / rect.height),
    }
  }

  const startElementPointerDrag = (event: React.PointerEvent<HTMLDivElement>, element: DesignElement) => {
    if (event.button !== 0) return
    const point = getCanvasPoint(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    pointerDragRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      offsetX: point.x - element.x,
      offsetY: point.y - element.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedElementId(element.id)
  }

  const moveElementWithPointer = (event: React.PointerEvent<HTMLDivElement>, element: DesignElement) => {
    const drag = pointerDragRef.current
    if (!drag || drag.id !== element.id || drag.pointerId !== event.pointerId) return
    const point = getCanvasPoint(event.clientX, event.clientY)
    if (!point) return
    const { width, height } = getElementSize(element)
    updateElement(element.id, {
      x: Math.min(Math.max(0, point.x - drag.offsetX), Math.max(0, canvasSize.width - width)),
      y: Math.min(Math.max(0, point.y - drag.offsetY), Math.max(0, canvasSize.height - height)),
    })
  }

  const finishElementPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerDragRef.current?.pointerId === event.pointerId) {
      pointerDragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    setElements(current => current.map(el => el.id === id ? { ...el, ...updates } : el))
  }

  const removeElement = (id: string) => {
    setElements(current => current.filter(el => el.id !== id))
    if (selectedElementId === id) setSelectedElementId(null)
  }

  const canvasSize = PAPER_SIZES[paperSize]
  const getElementSize = (element: DesignElement) => ({
    width: element.width || (element.type === 'qrcode' ? 80 : element.type === 'barcode' ? 200 : 100),
    height: element.height || (element.type === 'qrcode' ? 80 : element.type === 'barcode' ? 50 : 40),
  })
  const parseNumber = (value: string, fallback: number, minimum = 0) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Resi Template Designer</h1>
          <p className="text-foreground-muted mt-1">Design and manage AWB (Resi) print layouts for customers (Drag & Drop)</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2"  aria-hidden="true"/>
          New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-surface-subtle border border-border rounded-2xl">
            <Code2 className="w-12 h-12 text-foreground-muted mx-auto mb-4" aria-hidden="true" />
            <p className="text-foreground-muted">No templates found. Create one to get started.</p>
          </div>
        ) : (
          templates.map((t) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={t.id} 
              className={`bg-surface-subtle border rounded-2xl p-6 relative overflow-hidden transition-colors ${t.is_active ? 'border-primary/50' : 'border-border'}`}
            >
              {t.is_active && <div className="absolute top-0 right-0"><StatusBadge status="active" label="Aktif" labelPrefix="Resi template status" className="rounded-none rounded-bl-xl border-primary bg-primary text-on-primary" /></div>}
              
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold text-foreground truncate" title={t.name}>{t.name}</h3>
                {t.provider_code && (
                  <span className="px-2.5 py-1 rounded text-xs font-bold tracking-wide bg-surface-raised text-foreground-muted">
                    {t.provider_code}
                  </span>
                )}
                {!t.provider_code && (
                  <span className="px-2.5 py-1 rounded text-xs font-bold tracking-wide bg-primary/20 text-primary border border-primary/20">
                    Default
                  </span>
                )}
              </div>
              
              <div className="bg-background p-3 rounded-lg mb-4 text-xs font-mono text-foreground-muted h-32 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-subtle pointer-events-none" />
                {JSON.stringify(t.layout_config, null, 2)}
              </div>

              <div className="flex items-center gap-2">
                {!t.is_active && (
                  <Button variant="outline" size="sm" onClick={() => handleSetActive(t.id)} className="flex-1">
                    Set Active
                  </Button>
                )}
                <Button variant="outline" size="sm" type="button" onClick={() => handleOpenModal(t)} aria-label={`Edit ${t.name}`} title={`Edit ${t.name}`} className={t.is_active ? 'flex-1' : ''}>
                  <Edit2 className="w-4 h-4" aria-hidden="true" />
                  <span>Edit</span>
                </Button>
                {!t.is_active && (
                  <Button variant="outline" size="sm" type="button" onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`} title={`Delete ${t.name}`} className="text-error hover:text-error">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    <span>Delete</span>
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-scrim/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <FocusTrap active={isModalOpen} className="relative z-10 w-full max-w-6xl h-[90vh]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="resi-template-editor-title"
              onKeyDown={(event) => {
                if (event.key === 'Escape') handleCloseModal()
              }}
              className="bg-surface border border-border rounded-2xl w-full max-w-6xl z-10 overflow-hidden flex flex-col h-[90vh]"
            >
              <div className="p-4 border-b border-border flex justify-between items-center bg-surface-subtle">
                <div className="flex items-center gap-4 flex-1">
                  <input
                    aria-label="Nama template resi"
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="bg-transparent text-xl font-bold text-foreground focus:outline-none border-b border-transparent focus:border-primary px-2 py-1 flex-1 max-w-sm"
                    placeholder="Template Name..."
                  />
                  <select
                    aria-label="Provider template resi"
                    value={providerCode}
                    onChange={e => setProviderCode(e.target.value)}
                    className="bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="">(Default) Semua Provider</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.code}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  <select
                    aria-label="Ukuran kertas template resi"
                    value={paperSize}
                    onChange={e => setPaperSize(e.target.value as PaperSize)}
                    className="bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {Object.entries(PAPER_SIZES).map(([size, config]) => (
                      <option key={size} value={size}>{config.label}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={handleCloseModal} aria-label="Tutup editor template resi" title="Tutup editor template resi" className="text-foreground-muted hover:text-foreground">
                  <XCircle className="w-6 h-6" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3 border-b border-border bg-background/70">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Branding Resi</h2>
                    <p className="text-[11px] text-foreground-muted mt-1">Upload logo di sini. Canvas dan hasil cetak otomatis hitam putih.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground-muted">
                    <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden="true" />
                    Monokrom wajib
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-white px-2">
                      <img src={resolveAdminAssetUrl(branding.tembusLogo || DEFAULT_TEMBUS_LOGO)} alt="Preview logo TEMBUS" className="max-h-8 max-w-full object-contain" style={{ filter: 'grayscale(1) contrast(1.15)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">Logo TEMBUS</p>
                      <p className="truncate text-[11px] text-foreground-muted">Logo utama platform</p>
                    </div>
                    <label htmlFor="resi-logo-tembus" className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-foreground hover:border-primary hover:text-primary">
                      {assetUploading === 'tembus' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                      {assetUploading === 'tembus' ? 'Uploading' : 'Upload'}
                    </label>
                    <input id="resi-logo-tembus" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={assetUploading !== null} onChange={(event) => { void handleAssetUpload('tembus', event.target.files?.[0]); event.currentTarget.value = '' }} />
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-white px-2">
                      {branding.providerLogo && isSafeImageSource(branding.providerLogo) ? (
                        <img src={resolveAdminAssetUrl(branding.providerLogo)} alt="Preview logo kurir" className="max-h-8 max-w-full object-contain" style={{ filter: 'grayscale(1) contrast(1.15)' }} />
                      ) : (
                        <span className="text-center text-[10px] font-bold uppercase text-slate-500">Logo kurir</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">Logo Kurir</p>
                      <p className="truncate text-[11px] text-foreground-muted">{providers.find((provider) => provider.code === providerCode)?.name || providerCode || 'Provider yang dipilih'}</p>
                    </div>
                    <label htmlFor="resi-logo-provider" className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-foreground hover:border-primary hover:text-primary">
                      {assetUploading === 'provider' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                      {assetUploading === 'provider' ? 'Uploading' : 'Upload'}
                    </label>
                    <input id="resi-logo-provider" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={assetUploading !== null} onChange={(event) => { void handleAssetUpload('provider', event.target.files?.[0]); event.currentTarget.value = '' }} />
                  </div>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Toolbox */}
                <div className="w-64 border-r border-border bg-background p-4 overflow-y-auto">
                    <h2 id="resi-template-editor-title" className="sr-only">Edit Resi Template</h2>
                    <h3 className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-4">Elements</h3>
                  <div className="space-y-2">
                    {TOOLBOX_ITEMS.map(item => (
                      <button
                        type="button"
                        key={item.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, item)}
                        onClick={() => addElement(item)}
                        aria-label={`Tambahkan ${item.label}`}
                        className="w-full flex items-center gap-3 bg-surface p-3 rounded-xl border border-border cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors text-left"
                      >
                        <item.icon className="w-5 h-5 text-primary" aria-hidden="true" />
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                        <GripVertical className="w-4 h-4 text-foreground-muted ml-auto" aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 border-t border-border pt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded border-border bg-background text-primary"
                      />
                      <span className="text-sm text-foreground font-medium">Set as Active</span>
                    </label>
                  </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-surface-subtle p-8 overflow-auto flex items-start justify-center">
                  <div 
                    ref={canvasRef}
                    onDrop={onCanvasDrop}
                    onDragOver={onCanvasDragOver}
                    onClick={() => setSelectedElementId(null)}
                    className="bg-surface relative shadow-2xl overflow-hidden"
                    style={{ width: canvasSize.width, height: canvasSize.height }}
                  >
                    {elements.map(el => (
                      <div
                        key={el.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedElementId(el.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Pilih elemen ${el.type}`}
                        className={`absolute cursor-move select-none ${selectedElementId === el.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        style={{
                          left: el.x,
                          top: el.y,
                          width: el.width || (isWrappedText(el.value) ? 160 : undefined),
                          minHeight: el.height || undefined,
                          touchAction: 'none',
                        }}
                        onPointerDown={(event) => startElementPointerDrag(event, el)}
                        onPointerMove={(event) => moveElementWithPointer(event, el)}
                        onPointerUp={finishElementPointerDrag}
                        onPointerCancel={finishElementPointerDrag}
                      >
                        {el.type === 'text' && <span style={{ fontSize: el.fontSize || 14, color: '#000', whiteSpace: isWrappedText(el.value) ? 'normal' : 'nowrap', lineHeight: 1.25, fontWeight: el.fontWeight || 'normal' }}>{resolvePreviewValue(el.value)}</span>}
                        {el.type === 'qrcode' && (
                          <div style={{ width: el.width || 80, height: el.height || 80 }} className="bg-surface border border-border flex flex-col items-center justify-center p-1 text-center font-mono overflow-hidden">
                            <QrCode style={{ width: (el.width || 80) - 20, height: (el.height || 80) - 20 }} className="text-foreground-muted" aria-hidden="true" />
                          </div>
                        )}
                        {el.type === 'barcode' && (
                          <div style={{ width: el.width, height: el.height }} className="bg-surface flex items-center justify-center overflow-hidden">
                            <Barcode value={resolvePreviewValue(el.value) || 'JP1234567890'} width={el.barWidth || 1.5} height={el.height || 40} fontSize={10} displayValue={false} margin={0} />
                          </div>
                        )}
                        {el.type === 'logo' && (
                          branding.providerLogo && isSafeImageSource(branding.providerLogo) ? (
                            <img
                              src={resolveAdminAssetUrl(branding.providerLogo)}
                              alt="Logo kurir"
                              style={{ width: el.width || 120, height: el.height || 32, objectFit: 'contain', filter: 'grayscale(1) contrast(1.15)' }}
                              draggable={false}
                            />
                          ) : (
                            <div style={{ width: el.width || 120, height: el.height || 32 }} className="bg-surface-subtle border border-border flex items-center justify-center text-xs text-foreground-muted font-bold tracking-wide rounded">
                              LOGO KURIR
                            </div>
                          )
                        )}
                        {el.type === 'image' && (
                          isSafeImageSource(el.value) ? (
                            <img
                              src={resolveAdminAssetUrl(el.value)}
                              alt="Gambar template resi"
                              style={{ width: el.width || 100, height: el.height || 40, objectFit: 'contain' }}
                              draggable={false}
                            />
                          ) : (
                            <div style={{ width: el.width || 100, height: el.height || 40 }} className="border border-dashed border-border flex items-center justify-center text-[10px] text-foreground-muted text-center p-1">
                              Masukkan path atau URL gambar yang aman
                            </div>
                          )
                        )}
                        {el.type === 'eco_icon' && (
                          <div className="w-10 h-10 bg-success border border-success rounded-full flex items-center justify-center text-success">
                            <Leaf className="w-6 h-6" aria-hidden="true" />
                          </div>
                        )}
                        {el.type === 'fragile_badge' && (
                          <div className="w-10 h-10 bg-error border border-error rounded-full flex items-center justify-center text-error">
                            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
                          </div>
                        )}
                        {el.type === 'box' && (
                          <div style={{ width: el.width || 100, height: el.height || 50 }} className="border-2 border-border bg-transparent">
                          </div>
                        )}
                        {el.type === 'h_line' && (
                          <div style={{ width: el.width || 200, height: Math.max(1, el.height || 2) }} className="bg-scrim">
                          </div>
                        )}
                        {el.type === 'v_line' && (
                          <div style={{ width: Math.max(1, el.width || 2), height: el.height || 200 }} className="bg-scrim">
                          </div>
                        )}
                        {el.type === 'tembus_logo' && (
                          <img
                            src={resolveAdminAssetUrl(branding.tembusLogo || DEFAULT_TEMBUS_LOGO)}
                            alt="Logo TEMBUS"
                            style={{ width: el.width || 120, height: el.height || 30, objectFit: 'contain', filter: 'grayscale(1) contrast(1.15)' }}
                            draggable={false}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Properties Panel */}
                <div className="w-64 border-l border-border bg-background p-4 overflow-y-auto">
                  <h3 className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-2">Properties</h3>
                  <p className="text-xs text-foreground-muted mb-4">Klik elemen untuk memilih. Geser langsung di kertas atau ubah angka posisinya.</p>
                  {selectedElementId ? (() => {
                    const el = elements.find(x => x.id === selectedElementId)!;
                    return (
                      <div className="space-y-4">
                        {!['logo', 'tembus_logo'].includes(el.type) ? (
                          <div>
                            <label className="block text-xs font-medium text-foreground-muted mb-1">{el.type === 'image' ? 'Path atau URL gambar (opsional)' : <>Value (e.g. {'{'}{'{'} awb_number {'}'}{'}'})</>}</label>
                            <input
                              type="text"
                              aria-label="Value"
                              value={el.value}
                              onChange={(e) => updateElement(el.id, { value: e.target.value })}
                              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                              placeholder={el.type === 'image' ? 'Upload file atau masukkan /path atau URL https' : undefined}
                            />
                          </div>
                        ) : (
                          <div className="rounded-lg border border-border bg-surface p-3 text-xs text-foreground-muted">
                            {el.type === 'tembus_logo' ? 'Menggunakan Logo TEMBUS dari panel Branding Resi.' : 'Menggunakan Logo Kurir dari panel Branding Resi.'}
                            <span className="mt-1 block font-semibold text-foreground">Selalu hitam putih di canvas dan hasil cetak.</span>
                          </div>
                        )}
                        {el.type === 'image' && (
                          <div className="rounded-lg border border-dashed border-border bg-surface p-3">
                            <label htmlFor={`resi-image-upload-${el.id}`} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:border-primary hover:text-primary">
                              {assetUploading === 'image' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                              {assetUploading === 'image' ? 'Uploading gambar...' : 'Upload file gambar'}
                            </label>
                            <input id={`resi-image-upload-${el.id}`} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={assetUploading !== null} onChange={(event) => { void handleAssetUpload('image', event.target.files?.[0]); event.currentTarget.value = '' }} />
                            <p className="mt-2 text-[10px] leading-relaxed text-foreground-muted">PNG, JPG, atau WebP maksimal 2 MB.</p>
                          </div>
                        )}
                        {el.type === 'text' && (
                          <div>
                            <label className="block text-xs font-medium text-foreground-muted mb-1">Font Size</label>
                            <input 
                              type="number"
                              aria-label="Font Size"
                              value={el.fontSize || 14}
                              onChange={(e) => updateElement(el.id, { fontSize: parseNumber(e.target.value, el.fontSize || 14, 1) })}
                              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                            />
                          </div>
                        )}
                        {['box', 'h_line', 'v_line', 'image', 'qrcode', 'barcode', 'logo', 'tembus_logo'].includes(el.type) && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-foreground-muted mb-1">Width (px)</label>
                              <input 
                                type="number"
                                aria-label="Width (px)"
                                value={el.width || 100}
                                onChange={(e) => updateElement(el.id, { width: parseNumber(e.target.value, el.width || 100, 1) })}
                                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-foreground-muted mb-1">Height (px)</label>
                              <input 
                                type="number"
                                aria-label="Height (px)"
                                value={el.height || 50}
                                onChange={(e) => updateElement(el.id, { height: parseNumber(e.target.value, el.height || 50, 1) })}
                                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                              />
                            </div>
                          </div>
                        )}
                        {el.type === 'barcode' && (
                          <div>
                            <label className="block text-xs font-medium text-foreground-muted mb-1">Bar Width (1.0 - 3.0)</label>
                            <input 
                              type="number"
                              aria-label="Bar Width (1.0 - 3.0)"
                              step="0.1"
                              value={el.barWidth || 1.5}
                              onChange={(e) => updateElement(el.id, { barWidth: parseNumber(e.target.value, el.barWidth || 1.5, 0.1) })}
                              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-foreground-muted mb-1">X Position</label>
                            <input 
                              type="number"
                              aria-label="X Position"
                              value={Math.round(el.x)}
                              onChange={(e) => updateElement(el.id, { x: Math.min(parseNumber(e.target.value, el.x, 0), Math.max(0, canvasSize.width - getElementSize(el).width)) })}
                              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-foreground-muted mb-1">Y Position</label>
                            <input 
                              type="number"
                              aria-label="Y Position"
                              value={Math.round(el.y)}
                              onChange={(e) => updateElement(el.id, { y: Math.min(parseNumber(e.target.value, el.y, 0), Math.max(0, canvasSize.height - getElementSize(el).height)) })}
                              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-foreground"
                            />
                          </div>
                        </div>
                        <div className="pt-4 mt-4 border-t border-border">
                          <Button type="button" variant="outline" size="sm" onClick={() => removeElement(el.id)} className="w-full text-error">
                            Delete Element
                          </Button>
                        </div>
                      </div>
                    )
                  })() : (
                    <p className="text-sm text-foreground-muted text-center mt-10">Select an element to edit properties</p>
                  )}

                  <div className="mt-8 pt-4 border-t border-border">
                    <h4 className="text-xs font-bold text-foreground-muted uppercase mb-2 tracking-wide">Available Variables</h4>
                    <ul className="text-xs text-foreground-muted space-y-1 font-mono h-40 overflow-y-auto">
                      <li>{'{'}{'{'}order_number{'}'}{'}'}</li>
                      <li>{'{'}{'{'}awb_number{'}'}{'}'}</li>
                      <li>{'{'}{'{'}provider_name{'}'}{'}'}</li>
                      <li>{'{'}{'{'}service_type{'}'}{'}'}</li>
                      <li>{'{'}{'{'}sender_name{'}'}{'}'}</li>
                      <li>{'{'}{'{'}sender_phone{'}'}{'}'}</li>
                      <li>{'{'}{'{'}pickup_address{'}'}{'}'}</li>
                      <li>{'{'}{'{'}receiver_name{'}'}{'}'}</li>
                      <li>{'{'}{'{'}receiver_phone{'}'}{'}'}</li>
                      <li>{'{'}{'{'}dropoff_address{'}'}{'}'}</li>
                      <li>{'{'}{'{'}item_description{'}'}{'}'}</li>
                      <li>{'{'}{'{'}weight{'}'}{'}'}</li>
                      <li>{'{'}{'{'}routing_code{'}'}{'}'}</li>
                      <li>{'{'}{'{'}total_price_idr{'}'}{'}'}</li>
                      <li>{'{'}{'{'}cod_amount{'}'}{'}'}</li>
                      <li>{'{'}{'{'}payment_type{'}'}{'}'}</li>
                      <li>{'{'}{'{'}tracking_url{'}'}{'}'}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border bg-background flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleCloseModal}>Batal</Button>
                <Button type="button" onClick={handleSubmit}>Simpan Template</Button>
              </div>
            </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ResiTemplates

