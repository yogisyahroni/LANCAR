import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Target,
  XCircle,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  campaignNameForManifest,
  type ExperienceAuditRecord,
  type ExperienceManifest,
  type ExperienceSurface,
} from "../components/experience/types";

type OverviewFilters = {
  market_code: string;
  city_code: string;
  zone_code: string;
  surface: ExperienceSurface;
  locale: string;
  app_version: string;
};

type AuditFilters = {
  manifest_id: string;
  actor_id: string;
  action: string;
  date_from: string;
  date_to: string;
};

type ObservabilitySummary = {
  summary: {
    reliability_total: number;
    reliability_failures: number;
    reliability_failure_rate_pct: number;
    fetch_success: number;
    fetch_failure: number;
    cache_hit: number;
    parse_failure: number;
    schema_fallback: number;
    section_render_failure: number;
    broken_asset: number;
    deeplink_failure: number;
  };
  breakdown: Array<{
    manifest_id: string;
    manifest_revision: number;
    reliability_failures: number;
    reliability_failure_rate_pct: number;
  }>;
};

type Finding = {
  kind: "schema" | "asset" | "deep_link" | "runtime";
  message: string;
  manifest_id: string;
  revision: number;
  asset_id?: string;
  deep_link?: string;
};

const defaultFilters: OverviewFilters = {
  market_code: "id-jk",
  city_code: "",
  zone_code: "",
  surface: "customer_android",
  locale: "id-ID",
  app_version: "1.0.0",
};

const defaultAuditFilters: AuditFilters = {
  manifest_id: "",
  actor_id: "",
  action: "",
  date_from: "",
  date_to: "",
};

const auditActions = [
  "draft_created",
  "draft_updated",
  "previewed",
  "approval_requested",
  "approved",
  "rejected",
  "published",
  "superseded",
  "rolled_back",
  "kill_switched",
  "kill_switch_cleared",
];

const surfaceLabels: Record<ExperienceSurface, string> = {
  customer_android: "Customer Android",
  customer_web: "Customer Web",
  merchant_android: "Merchant Android",
  courier_android: "Courier Android",
};

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const compareVersions = (left: string, right: string): number => {
  const parse = (value: string) =>
    value
      .split(/[+-]/, 1)[0]
      .split(".")
      .map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0))
      return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  }
  return 0;
};

const supportsAppVersion = (manifest: ExperienceManifest, version: string) =>
  !version ||
  (compareVersions(version, manifest.min_app_version) >= 0 &&
    (!manifest.max_app_version ||
      compareVersions(version, manifest.max_app_version) <= 0));

const titleFor = (manifest: ExperienceManifest) => {
  return campaignNameForManifest(manifest);
};

const deepLinksIn = (value: unknown, result: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((item) => deepLinksIn(item, result));
  else if (value && typeof value === "object")
    Object.entries(value).forEach(([key, nested]) => {
      if (key === "deep_link" && typeof nested === "string")
        result.push(nested);
      deepLinksIn(nested, result);
    });
  return result;
};

const isSafeDeepLink = (value: string) =>
  /^(?:lancar:\/\/(?:home|food|promo|orders|support|profile)|\/(?:home|food|promo|orders|support|profile))(?:[/?#].*)?$/.test(
    value,
  );

const statusFor = (manifest: ExperienceManifest, now: number): string => {
  const startsAt = new Date(manifest.starts_at).getTime();
  const endsAt = manifest.ends_at ? new Date(manifest.ends_at).getTime() : null;
  if (manifest.state === "rolled_back") return "ROLLED_BACK";
  if (
    manifest.state === "draft" &&
    manifest.requires_approval &&
    manifest.approval_status === "pending"
  )
    return "AWAITING_APPROVAL";
  if (endsAt !== null && endsAt <= now) return "EXPIRED";
  if (manifest.state === "published" && manifest.kill_switch_active)
    return "KILL_SWITCHED";
  if (startsAt > now) return "SCHEDULED";
  if (
    manifest.rollout_stage === "canary" &&
    manifest.state === "published" &&
    !manifest.kill_switch_active
  )
    return "CANARY";
  if (manifest.state === "published" && !manifest.kill_switch_active)
    return "LIVE";
  return manifest.state.toUpperCase();
};

const statusStyles: Record<string, string> = {
  LIVE: "bg-emerald-500/10 text-emerald-300",
  SCHEDULED: "bg-blue-500/10 text-blue-300",
  CANARY: "bg-violet-500/10 text-violet-300",
  DRAFT: "bg-amber-500/10 text-amber-300",
  AWAITING_APPROVAL: "bg-orange-500/10 text-orange-200",
  ROLLED_BACK: "bg-zinc-700 text-zinc-300",
  EXPIRED: "bg-red-500/10 text-red-300",
  KILL_SWITCHED: "bg-red-500/10 text-red-200",
  SUPERSEDED: "bg-zinc-800 text-zinc-500",
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("id-ID") : "—";

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-zinc-100",
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Clock3;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          {label}
        </p>
        <Icon size={16} className="text-zinc-600" />
      </div>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}

function FindingLink({ finding }: { finding: Finding }) {
  const label = finding.asset_id
    ? `asset ${finding.asset_id}`
    : finding.deep_link
      ? finding.deep_link
      : `revision ${finding.revision}`;
  const to = finding.asset_id
    ? `/app-experience/revisions?manifest_id=${encodeURIComponent(finding.manifest_id)}&revision=${finding.revision}&asset_id=${encodeURIComponent(finding.asset_id)}`
    : `/app-experience/revisions?manifest_id=${encodeURIComponent(finding.manifest_id)}&revision=${finding.revision}`;
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 font-bold text-primary-light hover:underline"
    >
      <span>
        {label} · r{finding.revision}
      </span>
      <ExternalLink size={12} />
    </Link>
  );
}

export default function AppExperienceOverview() {
  const [filters, setFilters] = useState<OverviewFilters>(defaultFilters);
  const [auditFilters, setAuditFilters] =
    useState<AuditFilters>(defaultAuditFilters);
  const params = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).filter(
          ([key, value]) => key !== "app_version" && value.trim(),
        ),
      ),
    [filters],
  );
  const auditParams = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({
          market_code: filters.market_code,
          surface: filters.surface,
          ...auditFilters,
        }).filter(([, value]) => value.trim()),
      ),
    [auditFilters, filters.market_code, filters.surface],
  );
  const manifestsQuery = useQuery({
    queryKey: ["experience-overview-manifests", params],
    queryFn: async (): Promise<ExperienceManifest[]> =>
      (await api.get("/admin/experience/manifests", { params })).data?.data ??
      [],
  });
  const auditQuery = useQuery({
    queryKey: ["experience-overview-audit", auditParams],
    queryFn: async (): Promise<ExperienceAuditRecord[]> =>
      (await api.get("/admin/experience/audit", { params: auditParams })).data
        ?.data ?? [],
  });
  const healthQuery = useQuery({
    queryKey: [
      "experience-overview-health",
      filters.market_code,
      filters.surface,
      filters.app_version,
    ],
    queryFn: async (): Promise<ObservabilitySummary | null> =>
      (
        await api.get("/admin/experience/observability", {
          params: {
            range: "24H",
            market_code: filters.market_code,
            surface: filters.surface,
            app_version: filters.app_version,
          },
        })
      ).data?.data ?? null,
  });

  const now = Date.now();
  const rawManifests = manifestsQuery.data ?? [];
  const displayManifests = useMemo(
    () =>
      rawManifests.filter((manifest) =>
        supportsAppVersion(manifest, filters.app_version),
      ),
    [rawManifests, filters.app_version],
  );
  const states = useMemo(
    () =>
      displayManifests.reduce<Record<string, number>>((result, manifest) => {
        const status = statusFor(manifest, now);
        result[status] = (result[status] ?? 0) + 1;
        return result;
      }, {}),
    [displayManifests, now],
  );
  const live = displayManifests.filter(
    (manifest) => statusFor(manifest, now) === "LIVE",
  );
  const scheduled = displayManifests.filter(
    (manifest) => statusFor(manifest, now) === "SCHEDULED",
  );
  const expiring = displayManifests.filter((manifest) => {
    if (
      manifest.state !== "published" ||
      !manifest.ends_at ||
      manifest.kill_switch_active
    )
      return false;
    const end = new Date(manifest.ends_at).getTime();
    return end > now && end <= now + 72 * 60 * 60 * 1000;
  });
  const canary = displayManifests.filter(
    (manifest) => statusFor(manifest, now) === "CANARY",
  );
  const killSwitches = displayManifests.filter(
    (manifest) => manifest.state === "published" && manifest.kill_switch_active,
  );
  const awaitingApproval = displayManifests.filter(
    (manifest) => statusFor(manifest, now) === "AWAITING_APPROVAL",
  );
  const unsupported = rawManifests.filter(
    (manifest) => !supportsAppVersion(manifest, filters.app_version),
  );
  const health = healthQuery.data?.summary;
  const healthStatus = !health
    ? "UNKNOWN"
    : health.reliability_total === 0
      ? "NO TELEMETRY"
      : health.reliability_failure_rate_pct >= 10
        ? "DEGRADED"
        : health.reliability_failures > 0
          ? "WATCH"
          : "HEALTHY";
  const healthTone =
    healthStatus === "HEALTHY"
      ? "text-emerald-300"
      : healthStatus === "UNKNOWN" || healthStatus === "NO TELEMETRY"
        ? "text-zinc-300"
        : "text-orange-300";
  const latestActivity = (auditQuery.data ?? []).find(
    (event) => event.action === "published" || event.action === "rolled_back",
  );
  const findings = useMemo<Finding[]>(() => {
    const result: Finding[] = [];
    displayManifests.forEach((manifest) => {
      if (manifest.schema_version !== 1 || manifest.sections.length === 0) {
        result.push({
          kind: "schema",
          message: "Schema is not supported by the current manifest contract",
          manifest_id: manifest.manifest_id,
          revision: manifest.revision,
        });
      }
      manifest.asset_references.forEach((asset) => {
        const expiresAt = asset.expires_at
          ? new Date(asset.expires_at).getTime()
          : null;
        if (
          !asset.uri ||
          !asset.checksum ||
          (expiresAt !== null && expiresAt <= now)
        ) {
          result.push({
            kind: "asset",
            message: `Asset ${asset.asset_id} is missing delivery metadata or has expired`,
            manifest_id: manifest.manifest_id,
            revision: manifest.revision,
            asset_id: asset.asset_id,
          });
        }
      });
      deepLinksIn(manifest.sections)
        .filter((deepLink) => !isSafeDeepLink(deepLink))
        .forEach((deepLink) => {
          result.push({
            kind: "deep_link",
            message: `Deep link ${deepLink} is outside the allowlisted runtime routes`,
            manifest_id: manifest.manifest_id,
            revision: manifest.revision,
            deep_link: deepLink,
          });
        });
    });
    healthQuery.data?.breakdown
      .filter((item) => item.reliability_failures > 0)
      .forEach((item) => {
        result.push({
          kind: "runtime",
          message: `Runtime reliability has ${item.reliability_failures} failure event(s) (${item.reliability_failure_rate_pct}%)`,
          manifest_id: item.manifest_id,
          revision: item.manifest_revision,
        });
      });
    return result.slice(0, 30);
  }, [displayManifests, healthQuery.data, now]);

  const updateFilter = <K extends keyof OverviewFilters>(
    key: K,
    value: OverviewFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const updateAuditFilter = <K extends keyof AuditFilters>(
    key: K,
    value: AuditFilters[K],
  ) => setAuditFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => {
    setFilters(defaultFilters);
    setAuditFilters(defaultAuditFilters);
  };

  return (
    <div className="space-y-6 animate-in">
      <section className="rounded-3xl border border-primary/25 bg-primary/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">
              Operational cockpit
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">
              App Experience Overview
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
              A scoped view of presentation manifests, rollout exposure,
              approval work and runtime health. This view never treats one
              market configuration as global.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              manifestsQuery.refetch();
              auditQuery.refetch();
              healthQuery.refetch();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"
          >
            <RefreshCw size={14} /> Refresh cockpit
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Country / market
            <input
              required
              value={filters.market_code}
              onChange={(event) =>
                updateFilter("market_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
              placeholder="id-jk"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            City
            <input
              value={filters.city_code}
              onChange={(event) =>
                updateFilter("city_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
              placeholder="jakarta-selatan"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Zone
            <input
              value={filters.zone_code}
              onChange={(event) =>
                updateFilter("zone_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
              placeholder="zone-south"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Surface
            <select
              value={filters.surface}
              onChange={(event) =>
                updateFilter("surface", event.target.value as ExperienceSurface)
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
            >
              {Object.entries(surfaceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Locale
            <input
              value={filters.locale}
              onChange={(event) => updateFilter("locale", event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
              placeholder="id-ID"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            App version
            <input
              value={filters.app_version}
              onChange={(event) =>
                updateFilter("app_version", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"
              placeholder="1.0.0"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-primary-light">
            Viewing scope: {filters.market_code || "not selected"} ·{" "}
            {surfaceLabels[filters.surface]} · {filters.locale || "all locales"}{" "}
            ·{" "}
            {filters.app_version
              ? `v${filters.app_version}`
              : "all app versions"}
            {filters.city_code ? ` · ${filters.city_code}` : ""}
            {filters.zone_code ? ` · ${filters.zone_code}` : ""}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-bold text-zinc-500 hover:text-zinc-200"
          >
            Reset filters
          </button>
        </div>
      </section>
      {manifestsQuery.isError || auditQuery.isError || healthQuery.isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
          <div className="flex items-center gap-2 font-black">
            <XCircle size={17} /> Overview data could not be loaded
          </div>
          <p className="mt-1 text-xs text-red-300/80">
            Check the selected scope and retry. The backend rejects unscoped or
            invalid market filters.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Live revisions"
          value={live.length}
          detail="published and exposed now"
          icon={CheckCircle2}
          tone="text-emerald-300"
        />
        <MetricCard
          label="Scheduled"
          value={scheduled.length}
          detail="future start window"
          icon={Clock3}
          tone="text-blue-300"
        />
        <MetricCard
          label="Expiring soon"
          value={expiring.length}
          detail="next 72 hours"
          icon={AlertTriangle}
          tone="text-orange-300"
        />
        <MetricCard
          label="Canary / staged"
          value={canary.length}
          detail="active canary exposure"
          icon={GitBranch}
          tone="text-violet-300"
        />
        <MetricCard
          label="Kill switches"
          value={killSwitches.length}
          detail="published exposure disabled"
          icon={ShieldAlert}
          tone="text-red-300"
        />
        <MetricCard
          label="Awaiting approval"
          value={awaitingApproval.length}
          detail="maker-checker queue"
          icon={Target}
          tone="text-amber-300"
        />
      </div>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-zinc-100">
                Manifest fetch / render health
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                24-hour runtime telemetry for the selected market, surface and
                app version.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${healthStatus === "HEALTHY" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
            >
              {healthStatus}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                Reliability events
              </p>
              <p className="mt-1 text-xl font-black text-zinc-200">
                {health?.reliability_total ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                Failures
              </p>
              <p className="mt-1 text-xl font-black text-orange-300">
                {health?.reliability_failures ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                Failure rate
              </p>
              <p className={`mt-1 text-xl font-black ${healthTone}`}>
                {health ? `${health.reliability_failure_rate_pct}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                Fetch success
              </p>
              <p className="mt-1 text-xl font-black text-zinc-200">
                {health?.fetch_success ?? "—"}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-zinc-500">
            <span>cache hit: {health?.cache_hit ?? "—"}</span>
            <span>· parse fallback: {health?.parse_failure ?? "—"}</span>
            <span>· schema fallback: {health?.schema_fallback ?? "—"}</span>
            <span>· render: {health?.section_render_failure ?? "—"}</span>
            <span>· broken asset: {health?.broken_asset ?? "—"}</span>
            <span>· deep link: {health?.deeplink_failure ?? "—"}</span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-primary-light" />
            <div>
              <h2 className="text-base font-black text-zinc-100">
                Latest release activity
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Publish and rollback activity in the selected scope.
              </p>
            </div>
          </div>
          {latestActivity ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-primary-light">
                {latestActivity.action}
              </p>
              <p className="mt-2 text-sm font-bold text-zinc-200">
                <Link
                  to={`/app-experience/revisions?manifest_id=${latestActivity.manifest_id}&revision=${latestActivity.revision}`}
                  className="hover:underline"
                >
                  Revision {latestActivity.revision}
                </Link>
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {latestActivity.actor_id || "system"} ·{" "}
                {formatDate(latestActivity.created_at)}
              </p>
            </div>
          ) : (
            <p className="mt-6 text-sm text-zinc-600">
              No publish or rollback event in this scope.
            </p>
          )}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <Smartphone size={18} className="text-primary-light" />
            <div>
              <h2 className="text-base font-black text-zinc-100">
                App-version distribution
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Manifest minimums compared with the selected client version.
              </p>
            </div>
          </div>
          {unsupported.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="text-2xl font-black text-orange-300">
                {unsupported.length}
              </p>
              <p className="mt-1 text-xs text-orange-200">
                revision(s) require a newer app than v{filters.app_version}
              </p>
              <div className="mt-3 space-y-2">
                {unsupported.slice(0, 5).map((manifest) => (
                  <p key={manifest.id} className="text-xs text-zinc-400">
                    <FindingLink
                      finding={{
                        kind: "schema",
                        message: "",
                        manifest_id: manifest.manifest_id,
                        revision: manifest.revision,
                      }}
                    />{" "}
                    · minimum v{manifest.min_app_version}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
              All scoped revisions support v{filters.app_version}.
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-zinc-100">
                Warnings requiring action
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Each item points to its offending revision, campaign or asset.
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
              {findings.length}
            </span>
          </div>
          {findings.length > 0 ? (
            <div className="mt-4 space-y-2">
              {findings.map((finding, index) => (
                <div
                  key={`${finding.kind}-${finding.manifest_id}-${finding.revision}-${finding.asset_id || finding.deep_link || index}`}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/10 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className="mt-0.5 shrink-0 text-orange-300"
                    />
                    <span className="text-zinc-400">{finding.message}</span>
                  </div>
                  <div className="shrink-0">
                    <FindingLink finding={finding} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={16} /> No broken schema, assets, deep links or
              runtime warnings in scope.
            </div>
          )}
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="experience-audit-history-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="experience-audit-history-title" className="text-base font-black text-zinc-100">Audit history</h2>
            <p className="mt-1 text-xs text-zinc-500">Filter every draft, approval, publication, pause/kill-switch and rollback decision by campaign, actor, date or action.</p>
          </div>
          <span className="text-xs font-bold text-zinc-500">{auditQuery.data?.length ?? 0} event(s)</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Campaign / manifest<select value={auditFilters.manifest_id} onChange={(event) => updateAuditFilter('manifest_id', event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"><option value="">All campaigns</option>{Array.from(new Map(rawManifests.map((manifest) => [manifest.manifest_id, campaignNameForManifest(manifest)])).entries()).map(([manifestId, name]) => <option key={manifestId} value={manifestId}>{name} · {manifestId.slice(0, 8)}…</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Actor UUID<input value={auditFilters.actor_id} onChange={(event) => updateAuditFilter('actor_id', event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100" placeholder="all actors" /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Action<select value={auditFilters.action} onChange={(event) => updateAuditFilter('action', event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100"><option value="">All actions</option>{auditActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">From<input type="date" value={auditFilters.date_from.slice(0, 10)} onChange={(event) => updateAuditFilter('date_from', event.target.value ? `${event.target.value}T00:00:00.000Z` : '')} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100" /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">To<input type="date" value={auditFilters.date_to.slice(0, 10)} onChange={(event) => updateAuditFilter('date_to', event.target.value ? `${event.target.value}T23:59:59.999Z` : '')} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-zinc-100" /></label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-zinc-600"><tr><th className="px-3 py-3">Campaign / revision</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Actor / timestamp</th><th className="px-3 py-3">Reason</th></tr></thead>
            <tbody>{(auditQuery.data ?? []).slice(0, 100).map((event) => <tr key={event.id} className="border-b border-white/5"><td className="px-3 py-3"><Link to={`/app-experience/revisions?manifest_id=${event.manifest_id}&revision=${event.revision}`} className="font-bold text-zinc-200 hover:text-primary-light hover:underline">Revision {event.revision}</Link><p className="mt-1 font-mono text-[10px] text-zinc-600">{event.manifest_id.slice(0, 8)}…</p></td><td className="px-3 py-3 font-black uppercase tracking-wider text-primary-light">{event.action}</td><td className="px-3 py-3 text-zinc-500"><span className="font-mono text-zinc-400">{event.actor_id || 'system'}</span><p className="mt-1">{formatDate(event.created_at)}</p></td><td className="max-w-md px-3 py-3 text-zinc-500">{event.reason || '—'}</td></tr>)}</tbody>
          </table>
          {auditQuery.data?.length === 0 && !auditQuery.isLoading ? <p className="py-8 text-center text-sm text-zinc-600">No audit event matches the selected filters.</p> : null}
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-zinc-100">
              Active revision by market / surface
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              The table is explicitly scoped to {filters.market_code} ·{" "}
              {surfaceLabels[filters.surface]}.
            </p>
          </div>
          <span className="text-xs font-bold text-zinc-500">
            {displayManifests.length} revision(s) in view
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "LIVE",
            "SCHEDULED",
            "CANARY",
            "DRAFT",
            "AWAITING_APPROVAL",
            "ROLLED_BACK",
            "EXPIRED",
            "KILL_SWITCHED",
          ].map((status) => (
            <div
              key={status}
              className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {status.replace("_", " ")}
              </p>
              <p className="mt-1 text-lg font-black text-zinc-200">
                {states[status] ?? 0}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-zinc-600">
              <tr>
                <th className="px-3 py-3">Campaign / revision</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Locale / app</th>
                <th className="px-3 py-3">Schedule</th>
                <th className="px-3 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {displayManifests.slice(0, 20).map((manifest) => {
                const status = statusFor(manifest, now);
                return (
                  <tr key={manifest.id} className="border-b border-white/5">
                    <td className="px-3 py-3">
                      <Link
                        to={`/app-experience/revisions?manifest_id=${manifest.manifest_id}&revision=${manifest.revision}`}
                        className="font-bold text-zinc-200 hover:text-primary-light hover:underline"
                      >
                        {titleFor(manifest)}
                      </Link>
                      <p className="mt-1 font-mono text-[10px] text-zinc-600">
                        {manifest.manifest_id.slice(0, 8)}… · r
                        {manifest.revision}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black tracking-widest ${statusStyles[status] || "bg-zinc-800 text-zinc-400"}`}
                      >
                        {status.replace("_", " ")}
                      </span>
                      {manifest.kill_switch_active ? (
                        <p className="mt-1 text-[10px] text-red-300">
                          kill switch active
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {manifest.locale} · v{manifest.min_app_version}
                      {manifest.max_app_version
                        ? `–${manifest.max_app_version}`
                        : "+"}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {formatDate(manifest.starts_at)}
                      {manifest.ends_at
                        ? ` → ${formatDate(manifest.ends_at)}`
                        : ""}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {formatDate(manifest.updated_at)}
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {manifest.updated_by || manifest.created_by || "system"}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {displayManifests.length === 0 && !manifestsQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-zinc-600">
              No revision matches the selected scope.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
