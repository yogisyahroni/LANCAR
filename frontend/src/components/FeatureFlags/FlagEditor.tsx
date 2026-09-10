import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { FocusTrap } from '@/components/a11y/FocusTrap';

interface FlagEditorProps {
  flagKey: string;
  initialConfig: string;
  isEnabled: boolean;
  onSave: (newConfig: string, reason: string) => Promise<void>;
  onClose: () => void;
}

export default function FlagEditor({ flagKey, initialConfig, isEnabled, onSave, onClose }: FlagEditorProps) {
  const [config, setConfig] = useState(initialConfig);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      if (reason.length < 10) {
        setError('Alasan perubahan minimal 10 karakter.');
        return;
      }
      
      // Validate JSON
      JSON.parse(config);
      setError(null);
      setIsSaving(true);
      await onSave(config, reason);
    } catch (err: any) {
      if (err.name === 'SyntaxError') {
        setError('Format JSON tidak valid.');
      } else {
        setError(err.message || 'Gagal menyimpan konfigurasi.');
      }
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-sm"
    >
      <FocusTrap active className="w-full max-w-3xl">
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-flag-editor-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isSaving) onClose();
        }}
        className="bg-card border border-border/50 shadow-2xl rounded-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-5 border-b border-border/40">
          <div>
            <h2 id="feature-flag-editor-title" className="text-lg font-bold text-foreground">Edit Configuration: {flagKey}</h2>
            <p className="text-xs text-muted-foreground mt-1">Status saat ini: <span className={isEnabled ? "text-success font-bold" : "text-destructive font-bold"}>{isEnabled ? 'ACTIVE' : 'INACTIVE'}</span></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup editor feature flag" title="Tutup editor feature flag" className="p-2 hover:bg-muted rounded-xl transition-all">
            <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div id="flag-editor-error" role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="feature-flag-config" className="text-sm font-semibold text-foreground">Configuration (JSON)</label>
            <p className="text-xs text-muted-foreground">Konfigurasi format JSON. Harap berhati-hati saat mengubah parameter.</p>
            <textarea
              id="feature-flag-config"
              name="feature-flag-config"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'flag-editor-error' : undefined}
              className="w-full h-64 p-4 font-mono text-sm bg-muted/30 border border-border/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="feature-flag-reason" className="text-sm font-semibold text-foreground">Audit Reason <span className="text-destructive">*</span></label>
            <input
              id="feature-flag-reason"
              name="feature-flag-reason"
              type="text"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'flag-editor-error' : undefined}
              className="w-full p-3 bg-muted/30 border border-border/50 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm text-foreground"
              placeholder="Contoh: Menambahkan zona JAK-SEL untuk perluasan layanan P2P."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Alasan akan dicatat dalam Audit Logs dan tidak bisa dihapus.</p>
          </div>
        </div>

        <div className="p-5 border-t border-border/40 bg-muted/10 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
            disabled={isSaving}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-on-primary rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {isSaving ? (
              <span className="animate-pulse">Menyimpan...</span>
            ) : (
              <>
                <Save className="h-4 w-4"  aria-hidden="true"/> Simpan Config
              </>
            )}
          </button>
        </div>
      </motion.div>
      </FocusTrap>
    </motion.div>
  );
}
