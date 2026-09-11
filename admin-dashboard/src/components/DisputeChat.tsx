import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, User, MessageSquare, Loader2, X, Image as ImageIcon, Paperclip } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import { cn } from '../lib/utils'
import { toast } from 'sonner'

interface Message {
  id: string
  sender_id: string
  sender_name: string
  sender_role: string
  message: string
  message_type: 'text' | 'image'
  created_at: string
}

interface DisputeChatProps {
  disputeId: string
  onClose: () => void
  currentUserId: string
}

export default function DisputeChat({ disputeId, onClose, currentUserId }: DisputeChatProps) {
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const socket = useSocket()

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['dispute-chats', disputeId],
    queryFn: async () => {
      const res = await api.get(`/admin/disputes/${disputeId}/chats`)
      return res.data.data
    }
  })

  const sendMutation = useMutation({
    mutationFn: async ({ text, type = 'text' }: { text: string, type?: 'text' | 'image' }) => {
      await api.post(`/admin/disputes/${disputeId}/chats`, { message: text, message_type: type })
    },
    onSuccess: () => {
      setMessage('')
      setPreviewImage(null)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['dispute-chats', disputeId] })
    },
    onError: () => toast.error('Failed to send message')
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!socket) return

    // Join dispute room
    socket.emit('join_dispute_room', { dispute_id: disputeId })

    const handleNewMessage = (newMsg: Message) => {
      queryClient.setQueryData(['dispute-chats', disputeId], (old: any) => {
        const list = old || []
        if (list.find((m: any) => m.id === newMsg.id)) return list
        return [...list, newMsg]
      })
    }

    socket.on('new_dispute_chat', handleNewMessage)

    return () => {
      socket.off('new_dispute_chat', handleNewMessage)
      socket.emit('leave_dispute_room', { dispute_id: disputeId })
    }
  }, [socket, disputeId, queryClient])

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await api.post(`/admin/disputes/${disputeId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      if (res.data.success) {
        sendMutation.mutate({ text: res.data.url, type: 'image' })
      }
    } catch (error) {
      toast.error('Gagal mengunggah gambar')
    } finally {
      setUploading(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          setSelectedFile(file)
          setPreviewImage(URL.createObjectURL(file))
        }
      }
    }
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (previewImage && selectedFile) {
      handleFileUpload(selectedFile)
      return
    }
    if (!message.trim() || sendMutation.isPending) return
    sendMutation.mutate({ text: message })
  }

  const triggerFileInput = () => fileInputRef.current?.click()

  return (
    <div className="flex flex-col h-[600px] w-full bg-surface-subtle rounded-3xl border border-border overflow-hidden backdrop-blur-xl">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-surface/[0.02]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <MessageSquare size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground-muted uppercase tracking-wide">Dispute Chat</h3>
            <p className="text-xs font-bold text-foreground-muted uppercase tracking-wide">Live Support Channel</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup percakapan sengketa" title="Tutup percakapan sengketa" className="p-2 hover:bg-surface-subtle rounded-lg text-foreground-muted hover:text-foreground transition-all">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-white/5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-primary" size={24} aria-hidden="true" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-foreground-muted gap-2">
            <MessageSquare size={32} opacity={0.2} aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-wide">No messages yet</p>
          </div>
        ) : (
          messages.map((msg: Message) => {
            const isMe = msg.sender_id === currentUserId
            const isImage = msg.message_type === 'image'
            return (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-xs font-black text-foreground-muted uppercase tracking-wide">
                    {msg.sender_name}
                  </span>
                  <span className="text-xs font-bold text-foreground-muted uppercase tracking-wide">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={cn(
                  "px-1 py-1 rounded-2xl text-sm leading-relaxed overflow-hidden",
                  isMe 
                    ? "bg-primary text-on-primary rounded-tr-none shadow-lg shadow-primary/20"
                    : "bg-surface-subtle text-foreground-muted border border-border rounded-tl-none",
                  !isImage && "px-4 py-3"
                )}>
                  {isImage ? (
                    <img 
                      src={`${api.defaults.baseURL}${msg.message}`} 
                      alt="Attachment" 
                      className="max-w-full rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(`${api.defaults.baseURL}${msg.message}`, '_blank')}
                    />
                  ) : (
                    msg.message
                  )}
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Preview Section */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-surface-subtle border-t border-border flex items-center gap-4"
          >
            <div className="relative group">
              <img src={previewImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-border" />
              <button 
                type="button"
                onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
                aria-label="Remove image preview"
                title="Remove image preview"
                className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-error px-2 py-1 text-xs font-bold text-on-error shadow-lg opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={12} aria-hidden="true" />
                <span>Remove</span>
              </button>
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-primary uppercase tracking-wide">Image ready to send</p>
              <p className="text-xs text-foreground-muted">Press send to upload and share this screenshot</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 bg-surface/[0.02] border-t border-border">
        <div className="relative flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                setSelectedFile(file)
                setPreviewImage(URL.createObjectURL(file))
              }
            }}
          />
          <button 
            type="button"
            onClick={triggerFileInput}
            aria-label="Attach image to dispute message"
            title="Attach image"
            className="p-3 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-all"
          >
            <ImageIcon size={20} aria-hidden="true" />
          </button>
          <input 
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={previewImage ? "Attachment caption" : "Message"}
            onPaste={handlePaste}
            placeholder={previewImage ? "Add a caption (optional)..." : "Type message or paste screenshot..."}
            className="flex-1 bg-surface-subtle border border-border rounded-xl px-4 py-3 text-sm text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <button 
            type="submit"
            disabled={(!message.trim() && !previewImage) || sendMutation.isPending || uploading}
            aria-label="Send dispute message"
            title="Send message"
            className="p-3 rounded-xl bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-60 disabled:grayscale disabled:hover:scale-100"
          >
            {sendMutation.isPending || uploading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : <Send size={20}  aria-hidden="true"/>}
          </button>
        </div>
      </form>
    </div>
  )
}

