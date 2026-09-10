import { useMemo, useState } from "react";
import { Filter, Image, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import {
  EXPERIENCE_CAPABILITIES,
  hasExperiencePermission,
} from "../lib/experiencePermissions";
import AssetDetailDrawer from "../components/experience/AssetDetailDrawer";
import AssetUploader from "../components/experience/AssetUploader";
import type {
  AssetLifecycle,
  AssetUsage,
  LibraryAsset,
} from "../components/experience/assetLibraryTypes";
import type {
  ExperienceAsset,
  ExperienceManifest,
  ExperienceSurface,
} from "../components/experience/types";

type AssetApiRow = ExperienceAsset & { manifest_id: string; revision: number };
type LifecycleFilter = "all" | AssetLifecycle;

const assetKey = (asset: ExperienceAsset) =>
  `${asset.asset_id}:${asset.version || "1"}:${asset.checksum}`;
const placementForComponent = (component: string) =>
  ({
    hero_banner: "hero",
    campaign_strip: "campaign_strip",
    promo_carousel: "carousel",
    notice: "header",
  })[component] || component;
const stateClass: Record<AssetLifecycle, string> = {
  active: "border-success bg-success-surface text-success",
  deprecated: "border-border bg-surface-subtle text-foreground-muted",
  scheduled_deletion: "border-warning bg-warning-surface text-warning",
};

const referencesAsset = (value: unknown, assetId: string): boolean => {
  if (Array.isArray(value))
    return value.some((item) => referencesAsset(item, assetId));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      (key.endsWith("asset_id") && nested === assetId) ||
      referencesAsset(nested, assetId),
  );
};

const usageFor = (
  manifest: ExperienceManifest,
  assetId: string,
): AssetUsage => ({
  manifest_id: manifest.manifest_id,
  revision: manifest.revision,
  state: manifest.state,
  market_code: manifest.market_code,
  surface: manifest.surface,
  starts_at: manifest.starts_at,
  ends_at: manifest.ends_at,
  placements: manifest.sections
    .filter((section) => referencesAsset(section.properties, assetId))
    .map((section) => placementForComponent(section.component)),
});

const lifecycleFor = (
  asset: ExperienceAsset,
  usages: AssetUsage[],
  now: number,
): AssetLifecycle => {
  const live = usages.some(
    (usage) =>
      usage.state === "published" &&
      new Date(usage.starts_at).getTime() <= now &&
      (!usage.ends_at || new Date(usage.ends_at).getTime() > now),
  );
  if (live) return "active";
  if (asset.retention_until && new Date(asset.retention_until).getTime() > now)
    return "scheduled_deletion";
  return "deprecated";
};

const buildLibrary = (
  apiRows: AssetApiRow[],
  manifests: ExperienceManifest[],
): LibraryAsset[] => {
  const byKey = new Map<
    string,
    { asset: ExperienceAsset; usages: AssetUsage[] }
  >();
  const add = (asset: ExperienceAsset, usage?: AssetUsage) => {
    const key = assetKey(asset);
    const current = byKey.get(key) ?? { asset, usages: [] };
    if (
      usage &&
      !current.usages.some(
        (candidate) =>
          candidate.manifest_id === usage.manifest_id &&
          candidate.revision === usage.revision,
      )
    )
      current.usages.push(usage);
    byKey.set(key, current);
  };
  apiRows.forEach((row) => add(row));
  manifests.forEach((manifest) =>
    manifest.asset_references.forEach((asset) =>
      add(asset, usageFor(manifest, asset.asset_id)),
    ),
  );
  const now = Date.now();
  return Array.from(byKey.entries())
    .map(([key, value]) => ({
      ...value.asset,
      key,
      usages: value.usages.sort(
        (left, right) => right.revision - left.revision,
      ),
      lifecycle: lifecycleFor(value.asset, value.usages, now),
    }))
    .sort(
      (left, right) =>
        left.asset_id.localeCompare(right.asset_id) ||
        left.key.localeCompare(right.key),
    );
};

const errorMessage = (error: unknown) => {
  if (!error || typeof error !== "object") return "Asset validation failed";
  const response = error as {
    response?: { data?: { message?: unknown; error?: unknown } };
    message?: unknown;
  };
  if (typeof response.response?.data?.message === "string")
    return response.response.data.message;
  if (typeof response.response?.data?.error === "string")
    return response.response.data.error;
  return typeof response.message === "string"
    ? response.message
    : "Asset validation failed";
};

export default function ExperienceAssets({
  marketCode,
  surface,
}: {
  marketCode: string;
  surface: ExperienceSurface;
}) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canAssetWrite = hasExperiencePermission(
    user,
    EXPERIENCE_CAPABILITIES.assetWrite,
  );
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const assetsQuery = useQuery({
    queryKey: ["experience-assets", marketCode, surface],
    queryFn: async (): Promise<AssetApiRow[]> =>
      (
        await api.get("/admin/experience/assets", {
          params: { market_code: marketCode, surface },
        })
      ).data?.data ?? [],
  });
  const revisionsQuery = useQuery({
    queryKey: ["experience-asset-revisions", marketCode, surface],
    queryFn: async (): Promise<ExperienceManifest[]> =>
      (
        await api.get("/admin/experience/revisions", {
          params: { market_code: marketCode, surface },
        })
      ).data?.data ?? [],
  });
  const assets = useMemo(
    () => buildLibrary(assetsQuery.data ?? [], revisionsQuery.data ?? []),
    [assetsQuery.data, revisionsQuery.data],
  );
  const visibleAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          (lifecycle === "all" || asset.lifecycle === lifecycle) &&
          (!search.trim() ||
            `${asset.asset_id} ${asset.uri} ${asset.checksum}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())),
      ),
    [assets, lifecycle, search],
  );
  const selected =
    assets.find((asset) => asset.key === selectedKey) ??
    visibleAssets[0] ??
    null;
  const validateMutation = useMutation({
    mutationFn: async (asset: ExperienceAsset) =>
      (
        await api.post("/admin/experience/assets", asset, {
          params: { market_code: marketCode, surface },
        })
      ).data?.data as ExperienceAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experience-assets"] });
      queryClient.invalidateQueries({
        queryKey: ["experience-asset-revisions"],
      });
      toast.success(
        "Asset reference validated; attach it to a draft manifest to publish",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">
            Presentation source of truth
          </p>
          <h1 className="mt-2 text-3xl font-black text-foreground-muted">
            Asset Library
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">
            Browse immutable asset references declared by live, draft and
            retained revisions. The library never creates a second storage
            registry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-info bg-info-surface px-3 py-2 text-[10px] font-black uppercase tracking-widest text-info">
            <ShieldCheck size={13} className="mr-1 inline" aria-hidden="true" /> upload and publish
            are separate
          </span>
          <button
            type="button"
            onClick={() => {
              void assetsQuery.refetch();
              void revisionsQuery.refetch();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground-muted hover:bg-surface-subtle"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section
          className="rounded-3xl border border-border bg-surface/[0.03] p-4"
          aria-labelledby="asset-list-title"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="asset-list-title"
              className="text-sm font-black uppercase tracking-wider text-foreground-muted"
            >
              Scoped references
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
              {visibleAssets.length}/{assets.length}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-3 text-foreground-muted" aria-hidden="true" />
              <input
                aria-label="Search asset references by label, URI, or checksum"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search label, URI, checksum"
                className="w-full rounded-xl border border-border bg-surface-subtle py-2.5 pl-9 pr-3 text-xs text-foreground-muted outline-none focus:border-primary/50"
              />
            </label>
            <label className="sr-only" htmlFor="asset-lifecycle-filter">
              Lifecycle
            </label>
            <select
              id="asset-lifecycle-filter"
              value={lifecycle}
              onChange={(event) =>
                setLifecycle(event.target.value as LifecycleFilter)
              }
              className="w-10 rounded-xl border border-border bg-surface-subtle px-2 text-xs text-foreground-muted"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
              <option value="scheduled_deletion">Scheduled deletion</option>
            </select>
            <Filter
              size={14}
              className="mt-3 -ml-7 pointer-events-none text-foreground-muted"
             aria-hidden="true"/>
          </div>
          {assetsQuery.isError || revisionsQuery.isError ? (
            <p className="mt-4 rounded-xl border border-error bg-error-surface p-3 text-xs text-error">
              Asset references could not be loaded for this scope.
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {assetsQuery.isLoading || revisionsQuery.isLoading ? (
              <p className="p-5 text-center text-xs text-foreground-muted">
                Loading asset references...
              </p>
            ) : null}
            {visibleAssets.map((asset) => (
              <button
                type="button"
                key={asset.key}
                onClick={() => setSelectedKey(asset.key)}
                className={`w-full rounded-2xl border p-3 text-left transition ${selected?.key === asset.key ? "border-primary/50 bg-primary/10" : "border-border bg-surface-subtle hover:border-border"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-mono text-xs font-bold text-foreground-muted" title={asset.asset_id}>
                    {asset.asset_id}
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${stateClass[asset.lifecycle]}`}
                  >
                    {asset.lifecycle.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-2 truncate text-[10px] text-foreground-muted" title={`${asset.content_type || asset.kind} · v${asset.version || "1"}`}>
                  {asset.content_type || asset.kind} · v{asset.version || "1"}
                </p>
                <p className="mt-1 text-[10px] text-foreground-muted">
                  {asset.usages.length} usage refs ·{" "}
                  {asset.width && asset.height
                    ? `${asset.width}×${asset.height}`
                    : "dimensions unknown"}
                </p>
              </button>
            ))}
            {!assetsQuery.isLoading &&
            !revisionsQuery.isLoading &&
            visibleAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-5 text-center text-xs text-foreground-muted">
                No asset reference in this scope.
              </div>
            ) : null}
          </div>
        </section>
        <div className="space-y-6">
          {selected ? (
            <AssetDetailDrawer
              asset={selected}
              onClose={() => setSelectedKey(null)}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center text-foreground-muted">
              <Image size={34} className="mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm">
                Select an asset to inspect its preview and usage references.
              </p>
            </div>
          )}
          {canAssetWrite ? (
            <AssetUploader
              disabled={validateMutation.isPending}
              onValidate={async (asset) => {
                await validateMutation.mutateAsync(asset);
              }}
            />
          ) : (
            <div className="rounded-3xl border border-warning bg-warning/[0.06] p-5 text-sm text-warning">
              <p className="font-black">
                Asset registration is permissioned separately.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-warning">
                Your account can browse references, but needs{" "}
                <code>experience.asset.write</code> to validate/register one.
                Campaign publish remains controlled by{" "}
                <code>experience.publish</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
