import { useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { AdminPageSkeleton } from "../components/ui/Skeleton";
import { StatusBadge } from "../components/StatusBadge";

type CalendarEntry = {
  id: string;
  title: string;
  kind: "Promo" | "Broadcast";
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  detail: string;
};
const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Tidak dijadwalkan";

export default function CampaignCalendar() {
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const query = useQuery({
    queryKey: ["campaign-calendar"],
    queryFn: async () => {
      const [promos, broadcasts] = await Promise.all([
        api.get("/admin/promos", { params: { limit: 100 } }),
        api.get("/admin/broadcasts", { params: { page: 1, limit: 100 } }),
      ]);
      const promoRows = promos.data?.data || [];
      const broadcastRows = broadcasts.data?.data || [];
      return [
        ...promoRows.map((row: any): CalendarEntry => ({
          id: `promo-${row.id}`,
          title: row.name || row.code,
          kind: "Promo",
          status: row.status,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          detail: row.code || "Promo campaign",
        })),
        ...broadcastRows.map((row: any): CalendarEntry => ({
          id: `broadcast-${row.id}`,
          title: row.title,
          kind: "Broadcast",
          status: row.status,
          startsAt: row.scheduled_at || row.sent_at || row.created_at,
          endsAt: null,
          detail: row.target_type || "Broadcast",
        })),
      ] as CalendarEntry[];
    },
    staleTime: 30_000,
  });
  const entries = useMemo(
    () =>
      (query.data || [])
        .filter((entry) => (entry.startsAt || "").slice(0, 7) === month)
        .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))),
    [query.data, month],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">
            Marketing operations
          </p>
          <h1 className="mt-2 text-3xl font-black text-foreground-muted">
            Campaign Calendar
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Satu timeline untuk promo dan broadcast yang benar-benar tersimpan
            di backend.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            aria-label="Campaign calendar month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-xl border border-border bg-surface-subtle p-3 text-sm text-foreground-muted"
          />
          <button
            type="button"
            aria-label="Refresh campaign calendar" title="Refresh campaign calendar"
            onClick={() => query.refetch()}
            className="rounded-xl border border-border p-3 text-foreground-muted hover:bg-surface-subtle"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-surface-subtle p-5">
        <div className="mb-5 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-light"  aria-hidden="true"/>
          <h2 className="font-black text-foreground-muted">
            Jadwal{" "}
            {new Date(`${month}-01T00:00:00`).toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton />
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-foreground-muted">
            Tidak ada promo atau broadcast pada bulan ini.
          </div>
        ) : (
          <div className="grid gap-3">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-3 rounded-2xl border border-border bg-surface/[0.03] p-4 md:grid-cols-[180px_1fr_auto] md:items-center"
              >
                <div>
                  <p className="text-xs font-black text-primary-light">
                    {dateLabel(entry.startsAt)}
                  </p>
                  {entry.endsAt && (
                    <p className="mt-1 text-[11px] text-foreground-muted">
                      sampai {dateLabel(entry.endsAt)}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-foreground-muted">
                      {entry.title}
                    </h3>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold tracking-wide text-foreground-muted" aria-label={`Campaign type: ${entry.kind}`}>
                      {entry.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {entry.detail}
                  </p>
                </div>
                <StatusBadge status={entry.status} labelPrefix="Campaign status" className="border-primary/20 bg-primary/10 text-primary-light" />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
