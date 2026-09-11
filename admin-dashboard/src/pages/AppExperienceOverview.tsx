import { useMemo, useState, type FormEvent } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import {
  EXPERIENCE_CAPABILITIES,
  hasExperiencePermission,
} from "../lib/experiencePermissions";
import {
  campaignNameForManifest,
  type ExperienceAuditRecord,
  type ExperienceManifest,
  type ExperienceSurface,
} from "../components/experience/types";
import { StatusBadge } from "../components/StatusBadge";

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
    startup_regression: number;
    network_regression: number;
    fetch_latency_avg_ms: number;
    fetch_latency_p95_ms: number;
    impressions: number;
    clicks: number;
    dismissals: number;
  };
  breakdown: Array<{
    manifest_id: string;
    manifest_revision: number;
    market_code: string;
    app_version: string;
    total_events: number;
    reliability_total: number;
    reliability_failures: number;
    reliability_failure_rate_pct: number;
    impressions: number;
    clicks: number;
    dismissals: number;
    fetch_latency_avg_ms: number;
    rollback_target_revision: number | null;
  }>;
  guardrail_policy: {
    version: number;
    min_events: number;
    max_failure_rate_pct: number;
    window_hours: number;
    marketing_metrics_excluded: true;
    updated_at: string | null;
    updated_by: string | null;
  };
};

type GuardrailPolicyDraft = {
  min_events: string;
  max_failure_rate_pct: string;
  window_hours: string;
};

type Finding = {
  kind: "schema" | "asset" | "deep_link" | "runtime";
  message: string;
  manifest_id: string;
  revision: number;
  asset_id?: string;
  deep_link?: string;
  rollback_target_revision?: number | null;
};

const requestKey = (action: string) =>
  `admin.experience_${action}.${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

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

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("id-ID") : "—";

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-foreground-muted",
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Clock3;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">
          {label}
        </p>
        <Icon size={16} className="text-foreground-muted" aria-hidden="true" />
      </div>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
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
      <ExternalLink size={12} aria-hidden="true" />
    </Link>
  );
}

export default function AppExperienceOverview() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canEditGuardrail = hasExperiencePermission(
    user,
    EXPERIENCE_CAPABILITIES.guardrailWrite,
  );
  const canRollback = hasExperiencePermission(
    user,
    EXPERIENCE_CAPABILITIES.rollback,
  );
  const [filters, setFilters] = useState<OverviewFilters>(defaultFilters);
  const [auditFilters, setAuditFilters] =
    useState<AuditFilters>(defaultAuditFilters);
  const [guardrailDraft, setGuardrailDraft] =
    useState<GuardrailPolicyDraft | null>(null);
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

  const currentGuardrailDraft = (): GuardrailPolicyDraft => {
    if (guardrailDraft) return guardrailDraft;
    const policy = healthQuery.data?.guardrail_policy;
    return {
      min_events: String(policy?.min_events ?? 20),
      max_failure_rate_pct: String(policy?.max_failure_rate_pct ?? 10),
      window_hours: String(policy?.window_hours ?? 1),
    };
  };
  const updateGuardrailDraft = (
    field: keyof GuardrailPolicyDraft,
    value: string,
  ) => {
    setGuardrailDraft((current) => ({
      ...currentGuardrailDraft(),
      ...current,
      [field]: value,
    }));
  };

  const rollbackMutation = useMutation({
    mutationFn: ({
      manifestId,
      targetRevision,
      reason,
    }: {
      manifestId: string;
      targetRevision: number;
      reason: string;
    }) =>
      api.post(
        `/admin/experience/manifests/${manifestId}/rollback`,
        { target_revision: targetRevision, reason },
        { headers: { "X-Idempotency-Key": requestKey("rollback") } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experience-overview-health"],
      });
      queryClient.invalidateQueries({
        queryKey: ["experience-overview-manifests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["experience-overview-audit"],
      });
      toast.success("Known-good revision restored");
    },
    onError: (error: unknown) => {
      const response = error as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        response.response?.data?.message ||
          response.message ||
          "Rollback failed",
      );
    },
  });

  const guardrailPolicyMutation = useMutation({
    mutationFn: () =>
      api.patch(
        "/admin/experience/guardrail-policy",
        {
          min_events: Number(currentGuardrailDraft().min_events),
          max_failure_rate_pct: Number(
            currentGuardrailDraft().max_failure_rate_pct,
          ),
          window_hours: Number(currentGuardrailDraft().window_hours),
        },
        { headers: { "X-Idempotency-Key": requestKey("guardrail-policy") } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experience-overview-health"],
      });
      toast.success("Reliability guardrail policy updated and audited");
    },
    onError: (error: unknown) => {
      const response = error as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        response.response?.data?.message ||
          response.message ||
          "Guardrail policy update failed",
      );
    },
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
  const policy = healthQuery.data?.guardrail_policy;
  const healthStatus = !health
    ? "UNKNOWN"
    : health.reliability_total === 0
      ? "NO TELEMETRY"
      : health.reliability_failure_rate_pct >=
          (policy?.max_failure_rate_pct ?? 10)
        ? "DEGRADED"
        : health.reliability_failures > 0
          ? "WATCH"
          : "HEALTHY";
  const healthTone =
    healthStatus === "HEALTHY"
      ? "text-success"
      : healthStatus === "UNKNOWN" || healthStatus === "NO TELEMETRY"
        ? "text-foreground-muted"
        : "text-accent";
  const healthBadgeStatus =
    healthStatus === "HEALTHY"
      ? "healthy"
      : healthStatus === "DEGRADED"
        ? "degraded"
        : healthStatus === "WATCH"
          ? "review"
          : "unknown";
  const healthBadgeLabel =
    healthStatus === "HEALTHY"
      ? "Sehat"
      : healthStatus === "DEGRADED"
        ? "Menurun"
        : healthStatus === "WATCH"
          ? "Perlu dipantau"
          : healthStatus === "NO TELEMETRY"
            ? "Belum ada telemetry"
            : "Status belum tersedia";
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
    (healthQuery.data?.breakdown ?? [])
      .filter((item) => item.reliability_failures > 0)
      .forEach((item) => {
        result.push({
          kind: "runtime",
          message: `Runtime reliability has ${item.reliability_failures} failure event(s) (${item.reliability_failure_rate_pct}%)`,
          manifest_id: item.manifest_id,
          revision: item.manifest_revision,
          rollback_target_revision: item.rollback_target_revision,
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
  const requestHealthRollback = (finding: Finding) => {
    if (
      !canRollback ||
      finding.rollback_target_revision == null ||
      finding.manifest_id === "unknown"
    )
      return;
    const reason = window.prompt(
      `Rollback ${finding.manifest_id} revision ${finding.revision} to known-good revision ${finding.rollback_target_revision}. Reason:`,
      "Reliability guardrail breach observed in App Experience health",
    );
    if (!reason?.trim()) return;
    rollbackMutation.mutate({
      manifestId: finding.manifest_id,
      targetRevision: finding.rollback_target_revision,
      reason: reason.trim(),
    });
  };
  const saveGuardrailPolicy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canEditGuardrail) guardrailPolicyMutation.mutate();
  };

  return (
    <div className="space-y-6 animate-in">
      <section className="rounded-3xl border border-primary/25 bg-primary-soft p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-primary-light">
              Operational cockpit
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">
              App Experience Overview
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">
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
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-black uppercase tracking-wide text-foreground-muted"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh cockpit
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Country / market (wajib)
            <input
              required
              aria-required="true"
              aria-label="Country / market (wajib)"
              value={filters.market_code}
              onChange={(event) =>
                updateFilter("market_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="id-jk"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            City
            <input
              value={filters.city_code}
              onChange={(event) =>
                updateFilter("city_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="jakarta-selatan"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Zone
            <input
              value={filters.zone_code}
              onChange={(event) =>
                updateFilter("zone_code", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="zone-south"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Surface
            <select
              value={filters.surface}
              onChange={(event) =>
                updateFilter("surface", event.target.value as ExperienceSurface)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
            >
              {Object.entries(surfaceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Locale
            <input
              value={filters.locale}
              onChange={(event) => updateFilter("locale", event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="id-ID"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            App version
            <input
              value={filters.app_version}
              onChange={(event) =>
                updateFilter("app_version", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="1.0.0"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-foreground">
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
            className="text-xs font-bold text-foreground-muted hover:text-foreground-muted"
          >
            Reset filters
          </button>
        </div>
      </section>
      {manifestsQuery.isError || auditQuery.isError || healthQuery.isError ? (
        <div className="rounded-2xl border border-error bg-error-surface p-4 text-sm text-error">
          <div className="flex items-center gap-2 font-black">
            <XCircle size={17} aria-hidden="true" /> Overview data could not be
            loaded
          </div>
          <p className="mt-1 text-xs text-error">
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
          tone="text-success"
        />
        <MetricCard
          label="Scheduled"
          value={scheduled.length}
          detail="future start window"
          icon={Clock3}
          tone="text-info"
        />
        <MetricCard
          label="Expiring soon"
          value={expiring.length}
          detail="next 72 hours"
          icon={AlertTriangle}
          tone="text-accent"
        />
        <MetricCard
          label="Canary / staged"
          value={canary.length}
          detail="active canary exposure"
          icon={GitBranch}
          tone="text-info"
        />
        <MetricCard
          label="Kill switches"
          value={killSwitches.length}
          detail="published exposure disabled"
          icon={ShieldAlert}
          tone="text-error"
        />
        <MetricCard
          label="Awaiting approval"
          value={awaitingApproval.length}
          detail="maker-checker queue"
          icon={Target}
          tone="text-warning"
        />
      </div>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-surface/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-foreground-muted">
                Manifest fetch / render health
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                24-hour runtime telemetry for the selected market, surface and
                app version.
              </p>
            </div>
            <StatusBadge
              status={healthBadgeStatus}
              label={healthBadgeLabel}
              labelPrefix="Manifest health status"
            />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Reliability events
              </p>
              <p className="mt-1 text-xl font-black text-foreground-muted">
                {health?.reliability_total ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Failures
              </p>
              <p className="mt-1 text-xl font-black text-accent">
                {health?.reliability_failures ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Failure rate
              </p>
              <p className={`mt-1 text-xl font-black ${healthTone}`}>
                {health ? `${health.reliability_failure_rate_pct}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Fetch success
              </p>
              <p className="mt-1 text-xl font-black text-foreground-muted">
                {health?.fetch_success ?? "—"}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-foreground-muted">
            <span>cache hit: {health?.cache_hit ?? "—"}</span>
            <span>· parse fallback: {health?.parse_failure ?? "—"}</span>
            <span>· schema fallback: {health?.schema_fallback ?? "—"}</span>
            <span>· render: {health?.section_render_failure ?? "—"}</span>
            <span>· broken asset: {health?.broken_asset ?? "—"}</span>
            <span>· deep link: {health?.deeplink_failure ?? "—"}</span>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface/[0.03] p-5">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-primary-light" aria-hidden="true" />
            <div>
              <h2 className="text-base font-black text-foreground-muted">
                Latest release activity
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Publish and rollback activity in the selected scope.
              </p>
            </div>
          </div>
          {latestActivity ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface-subtle p-4">
              <p className="text-xs font-black uppercase tracking-wide text-primary-light">
                {latestActivity.action}
              </p>
              <p className="mt-2 text-sm font-bold text-foreground-muted">
                <Link
                  to={`/app-experience/revisions?manifest_id=${latestActivity.manifest_id}&revision=${latestActivity.revision}`}
                  className="hover:underline"
                >
                  Revision {latestActivity.revision}
                </Link>
              </p>
              <p className="mt-2 text-xs text-foreground-muted">
                {latestActivity.actor_id || "system"} ·{" "}
                {formatDate(latestActivity.created_at)}
              </p>
            </div>
          ) : (
            <p className="mt-6 text-sm text-foreground-muted">
              No publish or rollback event in this scope.
            </p>
          )}
        </div>
      </section>
      <section
        className="rounded-3xl border border-border bg-surface/[0.03] p-5"
        aria-labelledby="experience-analytics-release-title"
      >
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <Target
                size={18}
                className="text-primary-light"
                aria-hidden="true"
              />
              <div>
                <h2
                  id="experience-analytics-release-title"
                  className="text-base font-black text-foreground-muted"
                >
                  Marketing performance
                </h2>
                <p className="mt-1 text-xs text-foreground-muted">
                  Impression, click and dismiss are presentation metrics only;
                  they never improve or hide reliability health.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <MetricCard
                label="Impressions"
                value={health?.impressions ?? "—"}
                detail="campaign exposures"
                icon={Target}
                tone="text-info"
              />
              <MetricCard
                label="Clicks"
                value={health?.clicks ?? "—"}
                detail="campaign actions"
                icon={Zap}
                tone="text-primary-light"
              />
              <MetricCard
                label="Dismissals"
                value={health?.dismissals ?? "—"}
                detail="campaign dismissals"
                icon={XCircle}
                tone="text-accent"
              />
              <MetricCard
                label="CTR"
                value={
                  health && health.impressions > 0
                    ? `${((health.clicks / health.impressions) * 100).toFixed(2)}%`
                    : "—"
                }
                detail="clicks / impressions"
                icon={GitBranch}
                tone="text-info"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-subtle p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-foreground-muted">
                  Reliability guardrail policy
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  Policy v{policy?.version ?? "—"}; every change writes
                  before/after values to the administrative audit log.
                </p>
              </div>
              <ShieldAlert
                size={18}
                className="text-accent"
                aria-hidden="true"
              />
            </div>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={saveGuardrailPolicy}
            >
              <label className="text-xs font-bold tracking-wide text-foreground-muted">
                Minimum events
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  disabled={
                    !canEditGuardrail || guardrailPolicyMutation.isPending
                  }
                  value={currentGuardrailDraft().min_events}
                  onChange={(event) =>
                    updateGuardrailDraft("min_events", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs text-foreground-muted disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-bold tracking-wide text-foreground-muted">
                Max failure %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  disabled={
                    !canEditGuardrail || guardrailPolicyMutation.isPending
                  }
                  value={currentGuardrailDraft().max_failure_rate_pct}
                  onChange={(event) =>
                    updateGuardrailDraft(
                      "max_failure_rate_pct",
                      event.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs text-foreground-muted disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-bold tracking-wide text-foreground-muted">
                Window hours
                <input
                  type="number"
                  min="1"
                  max="168"
                  step="0.25"
                  disabled={
                    !canEditGuardrail || guardrailPolicyMutation.isPending
                  }
                  value={currentGuardrailDraft().window_hours}
                  onChange={(event) =>
                    updateGuardrailDraft("window_hours", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs text-foreground-muted disabled:opacity-60"
                />
              </label>
              <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-foreground-muted">
                  Marketing metrics excluded: always enforced · last update{" "}
                  {formatDate(policy?.updated_at)}
                </p>
                {canEditGuardrail ? (
                  <button
                    type="submit"
                    disabled={guardrailPolicyMutation.isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wide text-on-primary disabled:opacity-60"
                  >
                    {guardrailPolicyMutation.isPending
                      ? "Saving…"
                      : "Save audited policy"}
                  </button>
                ) : (
                  <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">
                    Read-only policy
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
        <div role="region" aria-label="Experience runtime health table" tabIndex={0} className="mt-5 overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-[980px] w-full text-left text-xs">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Live revision / campaign
                </th>
                <th scope="col" className="px-3 py-3">
                  Market / app
                </th>
                <th scope="col" className="px-3 py-3">
                  Reliability
                </th>
                <th scope="col" className="px-3 py-3">
                  Fetch latency
                </th>
                <th scope="col" className="px-3 py-3">
                  Marketing
                </th>
                <th scope="col" className="px-3 py-3">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {(healthQuery.data?.breakdown ?? []).slice(0, 20).map((row) => {
                const rowFinding: Finding = {
                  kind: "runtime",
                  message: "",
                  manifest_id: row.manifest_id,
                  revision: row.manifest_revision,
                  rollback_target_revision: row.rollback_target_revision,
                };
                const ctr =
                  row.impressions > 0
                    ? `${((row.clicks / row.impressions) * 100).toFixed(2)}%`
                    : "—";
                return (
                  <tr
                    key={`${row.manifest_id}-${row.manifest_revision}-${row.market_code}-${row.app_version}`}
                    className="border-b border-border text-foreground-muted"
                  >
                    <td className="px-3 py-3">
                      <FindingLink finding={rowFinding} />
                    </td>
                    <td className="px-3 py-3">
                      {row.market_code} · {row.app_version}
                    </td>
                    <td
                      className={`px-3 py-3 font-black ${row.reliability_failure_rate_pct >= (policy?.max_failure_rate_pct ?? 10) ? "text-error" : "text-success"}`}
                    >
                      {row.reliability_failures}/{row.reliability_total} ·{" "}
                      {row.reliability_failure_rate_pct}%
                    </td>
                    <td className="px-3 py-3">
                      {row.fetch_latency_avg_ms} ms avg
                    </td>
                    <td className="px-3 py-3">
                      {row.impressions} / {row.clicks} / {row.dismissals} ·{" "}
                      {ctr} CTR
                    </td>
                    <td className="px-3 py-3">
                      {canRollback &&
                      row.reliability_failures > 0 &&
                      row.rollback_target_revision != null &&
                      row.manifest_id !== "unknown" ? (
                        <button
                          type="button"
                          disabled={rollbackMutation.isPending}
                          onClick={() => requestHealthRollback(rowFinding)}
                          className="rounded-lg border border-accent px-2.5 py-1.5 text-xs font-black uppercase tracking-wide text-accent disabled:opacity-60"
                        >
                          Rollback r{row.rollback_target_revision}
                        </button>
                      ) : (
                        <span className="text-xs text-foreground-muted">
                          {row.reliability_failures > 0
                            ? "No compatible target"
                            : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(healthQuery.data?.breakdown ?? []).length === 0 ? (
            <p className="p-5 text-center text-sm text-foreground-muted">
              No revision telemetry in this scope.
            </p>
          ) : null}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-border bg-surface/[0.03] p-5">
          <div className="flex items-center gap-3">
            <Smartphone
              size={18}
              className="text-primary-light"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-black text-foreground-muted">
                App-version distribution
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Manifest minimums compared with the selected client version.
              </p>
            </div>
          </div>
          {unsupported.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-accent bg-accent-surface p-4">
              <p className="text-2xl font-black text-accent">
                {unsupported.length}
              </p>
              <p className="mt-1 text-xs text-accent">
                revision(s) require a newer app than v{filters.app_version}
              </p>
              <div className="mt-3 space-y-2">
                {unsupported.slice(0, 5).map((manifest) => (
                  <p
                    key={manifest.id}
                    className="text-xs text-foreground-muted"
                  >
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
            <div className="mt-5 rounded-2xl border border-success bg-success-surface p-4 text-sm text-success">
              All scoped revisions support v{filters.app_version}.
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-border bg-surface/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-foreground-muted">
                Warnings requiring action
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Each item points to its offending revision, campaign or asset.
              </p>
            </div>
            <span className="rounded-full bg-surface-subtle px-3 py-1.5 text-xs font-black uppercase tracking-wide text-foreground-muted">
              {findings.length}
            </span>
          </div>
          {findings.length > 0 ? (
            <div className="mt-4 space-y-2">
              {findings.map((finding, index) => (
                <div
                  key={`${finding.kind}-${finding.manifest_id}-${finding.revision}-${finding.asset_id || finding.deep_link || index}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface-subtle p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className="mt-0.5 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="text-foreground-muted">
                      {finding.message}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <FindingLink finding={finding} />
                    {finding.kind === "runtime" &&
                    canRollback &&
                    finding.rollback_target_revision != null &&
                    finding.manifest_id !== "unknown" ? (
                      <button
                        type="button"
                        disabled={rollbackMutation.isPending}
                        onClick={() => requestHealthRollback(finding)}
                        className="rounded-lg border border-accent px-2.5 py-1.5 text-xs font-black uppercase tracking-wide text-accent disabled:opacity-60"
                      >
                        Rollback r{finding.rollback_target_revision}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={16} aria-hidden="true" /> No broken schema,
              assets, deep links or runtime warnings in scope.
            </div>
          )}
        </div>
      </section>
      <section
        className="rounded-3xl border border-border bg-surface/[0.03] p-5"
        aria-labelledby="experience-audit-history-title"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="experience-audit-history-title"
              className="text-base font-black text-foreground-muted"
            >
              Audit history
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Filter every draft, approval, publication, pause/kill-switch and
              rollback decision by campaign, actor, date or action.
            </p>
          </div>
          <span className="text-xs font-bold text-foreground-muted">
            {auditQuery.data?.length ?? 0} event(s)
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Campaign / manifest
            <select
              value={auditFilters.manifest_id}
              onChange={(event) =>
                updateAuditFilter("manifest_id", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
            >
              <option value="">All campaigns</option>
              {Array.from(
                new Map(
                  rawManifests.map((manifest) => [
                    manifest.manifest_id,
                    campaignNameForManifest(manifest),
                  ]),
                ).entries(),
              ).map(([manifestId, name]) => (
                <option key={manifestId} value={manifestId}>
                  {name} · {manifestId.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Actor UUID
            <input
              value={auditFilters.actor_id}
              onChange={(event) =>
                updateAuditFilter("actor_id", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
              placeholder="all actors"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Action
            <select
              value={auditFilters.action}
              onChange={(event) =>
                updateAuditFilter("action", event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
            >
              <option value="">All actions</option>
              {auditActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            From
            <input
              type="date"
              value={auditFilters.date_from.slice(0, 10)}
              onChange={(event) =>
                updateAuditFilter(
                  "date_from",
                  event.target.value
                    ? `${event.target.value}T00:00:00.000Z`
                    : "",
                )
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            To
            <input
              type="date"
              value={auditFilters.date_to.slice(0, 10)}
              onChange={(event) =>
                updateAuditFilter(
                  "date_to",
                  event.target.value
                    ? `${event.target.value}T23:59:59.999Z`
                    : "",
                )
              }
              className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-foreground-muted"
            />
          </label>
        </div>
        <div role="region" aria-label="Experience audit history table" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Campaign / revision
                </th>
                <th scope="col" className="px-3 py-3">
                  Action
                </th>
                <th scope="col" className="px-3 py-3">
                  Actor / timestamp
                </th>
                <th scope="col" className="px-3 py-3">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {(auditQuery.data ?? []).slice(0, 100).map((event) => (
                <tr key={event.id} className="border-b border-border">
                  <td className="px-3 py-3">
                    <Link
                      to={`/app-experience/revisions?manifest_id=${event.manifest_id}&revision=${event.revision}`}
                      className="font-bold text-foreground-muted hover:text-primary-light hover:underline"
                    >
                      Revision {event.revision}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-foreground-muted">
                      {event.manifest_id.slice(0, 8)}…
                    </p>
                  </td>
                  <td className="px-3 py-3 font-black uppercase tracking-wider text-primary-light">
                    {event.action}
                  </td>
                  <td className="px-3 py-3 text-foreground-muted">
                    <span className="font-mono text-foreground-muted">
                      {event.actor_id || "system"}
                    </span>
                    <p className="mt-1">{formatDate(event.created_at)}</p>
                  </td>
                  <td className="max-w-md px-3 py-3 text-foreground-muted">
                    {event.reason || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditQuery.data?.length === 0 && !auditQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              No audit event matches the selected filters.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border border-border bg-surface/[0.03] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-foreground-muted">
              Active revision by market / surface
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              The table is explicitly scoped to {filters.market_code} ·{" "}
              {surfaceLabels[filters.surface]}.
            </p>
          </div>
          <span className="text-xs font-bold text-foreground-muted">
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
              className="rounded-xl border border-border bg-surface-subtle px-3 py-2"
            >
              <StatusBadge
                status={status}
                labelPrefix="Revision status"
                className="text-xs uppercase tracking-wide"
              />
              <p className="mt-1 text-lg font-black text-foreground-muted">
                {states[status] ?? 0}
              </p>
            </div>
          ))}
        </div>
        <div role="region" aria-label="Active experience revisions table" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Campaign / revision
                </th>
                <th scope="col" className="px-3 py-3">
                  Status
                </th>
                <th scope="col" className="px-3 py-3">
                  Locale / app
                </th>
                <th scope="col" className="px-3 py-3">
                  Schedule
                </th>
                <th scope="col" className="px-3 py-3">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {displayManifests.slice(0, 20).map((manifest) => {
                const status = statusFor(manifest, now);
                return (
                  <tr key={manifest.id} className="border-b border-border">
                    <td className="px-3 py-3">
                      <Link
                        to={`/app-experience/revisions?manifest_id=${manifest.manifest_id}&revision=${manifest.revision}`}
                        className="font-bold text-foreground-muted hover:text-primary-light hover:underline"
                      >
                        {titleFor(manifest)}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-foreground-muted">
                        {manifest.manifest_id.slice(0, 8)}… · r
                        {manifest.revision}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        status={status}
                        labelPrefix="Revision status"
                        className="text-xs tracking-wide"
                      />
                      {manifest.kill_switch_active ? (
                        <p className="mt-1 text-xs text-error">
                          kill switch active
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-foreground-muted">
                      {manifest.locale} · v{manifest.min_app_version}
                      {manifest.max_app_version
                        ? `–${manifest.max_app_version}`
                        : "+"}
                    </td>
                    <td className="px-3 py-3 text-foreground-muted">
                      {formatDate(manifest.starts_at)}
                      {manifest.ends_at
                        ? ` → ${formatDate(manifest.ends_at)}`
                        : ""}
                    </td>
                    <td className="px-3 py-3 text-foreground-muted">
                      {formatDate(manifest.updated_at)}
                      <p className="mt-1 text-xs text-foreground-muted">
                        {manifest.updated_by || manifest.created_by || "system"}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {displayManifests.length === 0 && !manifestsQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              No revision matches the selected scope.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
