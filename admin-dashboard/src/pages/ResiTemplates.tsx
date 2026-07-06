import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Code2, Play, Eye, GripVertical, Image as ImageIcon, Type, QrCode, Barcode as BarcodeIcon } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { Button } from '../components/Button'
import Barcode from 'react-barcode'

interface ResiTemplate {
  id: string
  name: string
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type ElementType = 'text' | 'qrcode' | 'barcode' | 'logo'

interface DesignElement {
  id: string
  type: ElementType
  x: number
  y: number
  width?: number
  height?: number
  value: string
  fontSize?: number
}

const TOOLBOX_ITEMS = [
  { type: 'text', label: 'Teks', icon: Type, defaultVal: '{{awb_number}}' },
  { type: 'barcode', label: 'Barcode', icon: BarcodeIcon, defaultVal: '{{awb_number}}' },
  { type: 'qrcode', label: 'QR Code', icon: QrCode, defaultVal: '{{tracking_url}}' },
  { type: 'logo', label: 'Logo', icon: ImageIcon, defaultVal: '/logo.png' }
]

const CANVAS_WIDTH = 384 // A6 approximate scaled (384px width e.g. for thermal)
const CANVAS_HEIGHT = 576

const ResiTemplates = () => {
  const [templates, setTemplates] = useState<ResiTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ResiTemplate | null>(null)
  
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [elements, setElements] = useState<DesignElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

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
      setName(t.name)
      setIsActive(t.is_active)
      try {
        const parsed = JSON.parse(t.content)
        setElements(parsed.elements || [])
      } catch(e) {
        setElements([])
      }
    } else {
      setEditingTemplate(null)
      setName('')
      setIsActive(false)
      setElements([])
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
    
    const content = JSON.stringify({
      layout: 'standard',
      elements
    }, null, 2)

    const payload = {
      name,
      content,
      is_active: isActive
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
        content: t.content,
        is_active: true
      })
      toast.success('Template set as active')
      fetchTemplates()
    } catch (err: any) {
      toast.error('Failed to set active: ' + err.message)
    }
  }

  const onDragStart = (e: React.DragEvent, type: string, defaultVal: string) => {
    e.dataTransfer.setData('type', type)
    e.dataTransfer.setData('defaultVal', defaultVal)
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type') as ElementType
    if (!type) return
    const defaultVal = e.dataTransfer.getData('defaultVal')

    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const newElement: DesignElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x,
      y,
      value: defaultVal,
      fontSize: 14,
      width: type === 'barcode' ? 200 : 100,
      height: type === 'barcode' ? 50 : 100
    }
    setElements([...elements, newElement])
    setSelectedElementId(newElement.id)
  }

  const onCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el))
  }

  const removeElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id))
    if (selectedElementId === id) setSelectedElementId(null)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Resi Template Designer</h1>
          <p className="text-zinc-400 mt-1">Design and manage AWB (Resi) print layouts for customers (Drag & Drop)</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white/5 border border-white/10 rounded-2xl">
            <Code2 className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
            <p className="text-zinc-400">No templates found. Create one to get started.</p>
          </div>
        ) : (
          templates.map((t) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={t.id} 
              className={`bg-white/5 border rounded-2xl p-6 relative overflow-hidden transition-colors ${t.is_active ? 'border-primary/50' : 'border-white/10'}`}
            >
              {t.is_active && (
                <div className="absolute top-0 right-0 bg-primary text-primary-dark text-xs font-bold px-3 py-1 rounded-bl-xl">
                  ACTIVE
                </div>
              )}
              
              <h3 className="text-xl font-bold text-white mb-2 truncate pr-16">{t.name}</h3>
              
              <div className="bg-zinc-950 p-3 rounded-lg mb-4 text-xs font-mono text-zinc-400 h-32 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-950 pointer-events-none" />
                {t.content}
              </div>

              <div className="flex items-center gap-2">
                {!t.is_active && (
                  <Button variant="outline" size="sm" onClick={() => handleSetActive(t.id)} className="flex-1">
                    Set Active
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleOpenModal(t)} className={t.is_active ? 'flex-1' : ''}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                {!t.is_active && (
                  <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-6xl z-10 overflow-hidden flex flex-col h-[90vh]"
            >
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="bg-transparent text-xl font-bold text-white focus:outline-none border-b border-transparent focus:border-primary px-2 py-1"
                  placeholder="Template Name..."
                />
                <button onClick={handleCloseModal} className="text-zinc-400 hover:text-white">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Toolbox */}
                <div className="w-64 border-r border-white/5 bg-zinc-950 p-4 overflow-y-auto">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Elements</h3>
                  <div className="space-y-2">
                    {TOOLBOX_ITEMS.map(item => (
                      <div 
                        key={item.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, item.type, item.defaultVal)}
                        className="flex items-center gap-3 bg-zinc-900 p-3 rounded-xl border border-white/5 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                      >
                        <item.icon className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium text-white">{item.label}</span>
                        <GripVertical className="w-4 h-4 text-zinc-600 ml-auto" />
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 border-t border-white/5 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded border-white/10 bg-zinc-950 text-primary"
                      />
                      <span className="text-sm text-white font-medium">Set as Active</span>
                    </label>
                  </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-zinc-900/50 p-8 overflow-auto flex items-start justify-center">
                  <div 
                    ref={canvasRef}
                    onDrop={onCanvasDrop}
                    onDragOver={onCanvasDragOver}
                    className="bg-white relative shadow-2xl overflow-hidden"
                    style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                  >
                    {elements.map(el => (
                      <div
                        key={el.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
                        className={`absolute cursor-move select-none ${selectedElementId === el.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        style={{ left: el.x, top: el.y }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('moveId', el.id);
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          e.dataTransfer.setData('offsetX', (e.clientX - rect.left).toString());
                          e.dataTransfer.setData('offsetY', (e.clientY - rect.top).toString());
                        }}
                        onDragEnd={(e) => {
                          if (!canvasRef.current) return;
                          const rect = canvasRef.current.getBoundingClientRect();
                          const newX = e.clientX - rect.left;
                          const newY = e.clientY - rect.top;
                          updateElement(el.id, { x: newX, y: newY });
                        }}
                      >
                        {el.type === 'text' && <span style={{ fontSize: el.fontSize || 14, color: '#000', whiteSpace: 'nowrap' }}>{el.value}</span>}
                        {el.type === 'qrcode' && (
                          <div className="w-24 h-24 bg-zinc-200 border border-zinc-300 flex items-center justify-center text-xs text-zinc-500">
                            [QR: {el.value}]
                          </div>
                        )}
                        {el.type === 'barcode' && (
                          <div className="bg-white flex items-center justify-center">
                            <Barcode value={el.value} width={1.5} height={40} fontSize={12} displayValue={false} />
                          </div>
                        )}
                        {el.type === 'logo' && (
                          <div className="w-16 h-16 bg-zinc-200 border border-zinc-300 flex items-center justify-center text-xs text-zinc-500">
                            [LOGO]
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Properties Panel */}
                <div className="w-64 border-l border-white/5 bg-zinc-950 p-4 overflow-y-auto">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Properties</h3>
                  {selectedElementId ? (() => {
                    const el = elements.find(x => x.id === selectedElementId)!;
                    return (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1">Value (e.g. {'{'}{'{'} awb_number {'}'}{'}'})</label>
                          <input 
                            type="text"
                            value={el.value}
                            onChange={(e) => updateElement(el.id, { value: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                          />
                        </div>
                        {el.type === 'text' && (
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Font Size</label>
                            <input 
                              type="number"
                              value={el.fontSize || 14}
                              onChange={(e) => updateElement(el.id, { fontSize: parseInt(e.target.value) })}
                              className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">X Position</label>
                            <input 
                              type="number"
                              value={Math.round(el.x)}
                              onChange={(e) => updateElement(el.id, { x: parseInt(e.target.value) })}
                              className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Y Position</label>
                            <input 
                              type="number"
                              value={Math.round(el.y)}
                              onChange={(e) => updateElement(el.id, { y: parseInt(e.target.value) })}
                              className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                        </div>
                        <div className="pt-4 mt-4 border-t border-white/5">
                          <Button variant="outline" size="sm" onClick={() => removeElement(el.id)} className="w-full text-red-400">
                            Delete Element
                          </Button>
                        </div>
                      </div>
                    )
                  })() : (
                    <p className="text-sm text-zinc-500 text-center mt-10">Select an element to edit properties</p>
                  )}

                  <div className="mt-8 pt-4 border-t border-white/5">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2 tracking-wider">Available Variables</h4>
                    <ul className="text-[10px] text-zinc-400 space-y-1 font-mono">
                      <li>{'{'}{'{'}order_number{'}'}{'}'}</li>
                      <li>{'{'}{'{'}awb_number{'}'}{'}'}</li>
                      <li>{'{'}{'{'}provider_name{'}'}{'}'}</li>
                      <li>{'{'}{'{'}service_type{'}'}{'}'}</li>
                      <li>{'{'}{'{'}customer_name{'}'}{'}'}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-950 flex justify-end gap-3">
                <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                <Button onClick={handleSubmit}>Save Template</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ResiTemplates

