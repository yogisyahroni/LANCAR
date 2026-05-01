import { useState } from 'react'
import ActiveOrdersTable from '../components/ActiveOrdersTable'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { Download, Plus, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Orders() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [formData, setFormData] = useState({
    customer_id: '',
    pickup_address: '',
    delivery_address: '',
    total_amount: '',
    type: 'standard'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const response = await api.get('/admin/orders/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Orders exported successfully')
    } catch (error) {
      toast.error('Failed to export orders')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      await api.post('/admin/orders', {
        ...formData,
        total_amount: parseFloat(formData.total_amount)
      })
      toast.success('Manual order created successfully')
      setIsCreateModalOpen(false)
      setFormData({
        customer_id: '',
        pickup_address: '',
        delivery_address: '',
        total_amount: '',
        type: 'standard'
      })
      // Refresh table would be better with query invalidation, but ActiveOrdersTable handles its own.
      // For now, simple reload or we could pass a refresh trigger.
      window.location.reload() 
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Orders Management</h1>
          <p className="text-zinc-500 mt-1">Manage and monitor all Lancar logistics orders</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export CSV
          </button>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Plus size={18} />
            Create Manual Order
          </button>
        </div>
      </div>

      <div className="glass-card p-8 rounded-3xl">
        <ActiveOrdersTable />
      </div>

      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-lg p-8 rounded-[32px] relative z-10 border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-100">Create Manual Order</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Customer ID</label>
                  <input
                    required
                    value={formData.customer_id}
                    onChange={e => setFormData({ ...formData, customer_id: e.target.value })}
                    placeholder="Enter customer UUID"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Type</label>
                    <select
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                    >
                      <option value="standard">Standard</option>
                      <option value="express">Express</option>
                      <option value="priority">Priority</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Total Amount</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={e => setFormData({ ...formData, total_amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pickup Address</label>
                  <textarea
                    required
                    value={formData.pickup_address}
                    onChange={e => setFormData({ ...formData, pickup_address: e.target.value })}
                    rows={2}
                    placeholder="Full pickup address..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Delivery Address</label>
                  <textarea
                    required
                    value={formData.delivery_address}
                    onChange={e => setFormData({ ...formData, delivery_address: e.target.value })}
                    rows={2}
                    placeholder="Full delivery address..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-4"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  Create Order
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
