import React from "react";
import { AlertTriangle, Loader2, RefreshCw, WifiOff } from "lucide-react";

type AsyncRecoveryStateProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  offline?: boolean;
};

export function AsyncRecoveryState({ title, message, onRetry, retrying = false, offline = false }: AsyncRecoveryStateProps) {
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center" role="alert" aria-live="assertive">
      <Icon className="h-9 w-9 text-amber-300" aria-hidden="true" />
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying || offline}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        {retrying ? "Mencoba lagi..." : offline ? "Menunggu koneksi" : "Coba lagi"}
      </button>
    </section>
  );
}

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;
  return (
    <div className="fixed inset-x-0 bottom-16 z-[130] border-t border-amber-400/30 bg-amber-950/95 px-4 py-3 text-center text-sm text-amber-100 shadow-2xl md:bottom-0" role="alert" aria-live="assertive">
      <span className="font-semibold">Koneksi internet terputus.</span> Perubahan belum dikirim ke server. Hubungkan kembali untuk mencoba lagi.
    </div>
  );
}
