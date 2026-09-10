import { useMemo, useState } from "react";
import {
  ExternalLink,
  Link2,
  RefreshCw,
  Route,
  ShieldAlert,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api";
import DeepLinkPicker from "../components/experience/DeepLinkPicker";
import DeepLinkTester from "../components/experience/DeepLinkTester";
import { StatusBadge } from "../components/StatusBadge";
import type {
  DeepLinkRoute,
  DeepLinkUsage,
} from "../components/experience/deepLinkTypes";
import type { ExperienceSurface } from "../components/experience/types";

const errorMessage = (error: unknown) => {
  if (!error || typeof error !== "object") return "Deep-link validation failed";
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
    : "Deep-link validation failed";
};

export default function DeepLinks({
  marketCode,
  surface,
  appVersion,
  schemaVersion,
}: {
  marketCode: string;
  surface: ExperienceSurface;
  appVersion: string;
  schemaVersion: number;
}) {
  const [routeId, setRouteId] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [externalUrl, setExternalUrl] = useState("");
  const [externalResult, setExternalResult] = useState<string | null>(null);
  const registryQuery = useQuery({
    queryKey: ["experience-deep-link-registry"],
    queryFn: async (): Promise<DeepLinkRoute[]> =>
      (await api.get("/admin/experience/deep-link-registry")).data?.data ?? [],
  });
  const usageQuery = useQuery({
    queryKey: ["experience-deep-link-usage", marketCode, surface],
    queryFn: async (): Promise<DeepLinkUsage[]> =>
      (
        await api.get("/admin/experience/deep-links", {
          params: { market_code: marketCode, surface, include_usage: "true" },
        })
      ).data?.data ?? [],
  });
  const routes = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);
  const selectedRoute =
    routes.find((route) => route.route_id === routeId) ?? null;
  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(
        "/admin/experience/deep-links",
        { route_id: routeId, params },
        { params: { market_code: marketCode, surface } },
      );
      return response.data?.data as { deep_link: string; route: DeepLinkRoute };
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const externalMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(
          "/admin/experience/deep-links",
          { external_url: externalUrl },
          { params: { market_code: marketCode, surface } },
        )
      ).data?.data as { external_url: string },
    onSuccess: (result) => {
      setExternalResult(result.external_url);
      toast.success("Allowlisted external URL validated");
    },
    onError: (error) => {
      setExternalResult(null);
      toast.error(errorMessage(error));
    },
  });
  const routeUsage = useMemo(
    () =>
      selectedRoute
        ? (usageQuery.data ?? []).filter(
            (usage) =>
              usage.deep_link.split("?")[0] ===
              selectedRoute.template.split("?")[0],
          )
        : [],
    [selectedRoute, usageQuery.data],
  );
  const usageByRoute = useMemo(
    () =>
      routes.map((route) => ({
        route,
        count: (usageQuery.data ?? []).filter(
          (usage) =>
            usage.deep_link.split("?")[0] === route.template.split("?")[0],
        ).length,
      })),
    [routes, usageQuery.data],
  );
  const runTest = async () => validateMutation.mutateAsync();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">
            Navigation safety
          </p>
          <h1 className="mt-2 text-3xl font-black text-foreground-muted">
            Typed Deep Links
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">
            A registered route registry keeps campaign destinations typed,
            version-aware and recoverable. Deep links are validated before they
            enter a draft; no arbitrary code target is accepted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void registryQuery.refetch();
            void usageQuery.refetch();
          }}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground-muted hover:bg-surface-subtle"
        >
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>
      {registryQuery.isError || usageQuery.isError ? (
        <p
          role="alert"
          className="rounded-2xl border border-error bg-error-surface p-4 text-xs text-error"
        >
          Deep-link registry or usage references could not be loaded.
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <DeepLinkPicker
          routes={routes}
          routeId={routeId}
          params={params}
          onRouteChange={(next) => {
            setRouteId(next);
            setParams({});
          }}
          onParamsChange={setParams}
        />
        <DeepLinkTester
          route={selectedRoute}
          routes={routes}
          surface={surface}
          appVersion={appVersion}
          schemaVersion={schemaVersion}
          onTest={runTest}
        />
      </div>
      <section
        className="rounded-3xl border border-border bg-surface/[0.03] p-5"
        aria-labelledby="external-url-title"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-info-surface p-2 text-info">
            <ExternalLink size={18}  aria-hidden="true"/>
          </div>
          <div>
            <h2
              id="external-url-title"
              className="text-base font-black text-foreground-muted"
            >
              First-party external URL validator
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Only HTTPS on the allowlisted first-party domains is accepted;
              credentials, non-standard ports, hashes and traversal are
              rejected.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="First-party external URL"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://app.bawain.my.id/promo"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted"
          />
          <button
            type="button"
            disabled={!externalUrl.trim() || externalMutation.isPending}
            onClick={() => externalMutation.mutate()}
            className="rounded-xl bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-on-primary disabled:opacity-60"
          >
            Validate URL
          </button>
        </div>
        {externalResult ? (
          <p className="mt-3 rounded-xl border border-success bg-success/[0.06] p-3 text-xs text-success">
            Validated: <span className="font-mono">{externalResult}</span>
          </p>
        ) : null}
      </section>
      <section
        className="rounded-3xl border border-border bg-surface/[0.03] p-5"
        aria-labelledby="route-registry-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="route-registry-title"
              className="text-base font-black text-foreground-muted"
            >
              Route registry and usage safety
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Before deprecating a route, inspect the references below. Live,
              draft and retained revisions remain visible.
            </p>
          </div>
          <Route size={18} className="text-primary-light" aria-hidden="true" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {usageByRoute.map(({ route, count }) => (
            <button
              type="button"
              key={route.route_id}
              onClick={() => {
                setRouteId(route.route_id);
                setParams({});
              }}
              className={`rounded-2xl border p-4 text-left ${route.route_id === routeId ? "border-primary/50 bg-primary/10" : "border-border bg-surface-subtle hover:border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-black text-foreground-muted">
                  {route.label}
                </p>
                <StatusBadge
                  status={route.status}
                  labelPrefix="Route status"
                  className="px-2 py-1 text-[9px] uppercase tracking-widest"
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-foreground-muted">
                {route.template}
              </p>
              <p className="mt-2 text-[10px] text-foreground-muted">
                min app {route.min_app_version} · {count} reference
                {count === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
        {selectedRoute ? (
          <div className="mt-5 rounded-2xl border border-warning bg-warning/[0.06] p-4 text-xs text-warning">
            <p className="font-black uppercase tracking-widest">
              <ShieldAlert size={14} className="mr-1 inline" aria-hidden="true" /> References
              before deprecation
            </p>
            <p className="mt-2">
              {selectedRoute.label} has {routeUsage.length} matching reference
              {routeUsage.length === 1 ? "" : "s"} in this scope. The server
              registry marks deprecated routes unavailable for new drafts, while
              these existing campaign revisions remain identifiable below.
            </p>
            {routeUsage.length ? (
              <div className="mt-3 space-y-1">
                {routeUsage.slice(0, 8).map((usage) => (
                  <p
                    key={`${usage.manifest_id}-${usage.revision}-${usage.deep_link}`}
                    className="font-mono text-[10px]"
                  >
                    {usage.manifest_id} · r{usage.revision} · {usage.state} ·{" "}
                    {usage.deep_link}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 text-xs text-foreground-muted">
            Select a route to inspect deprecation impact.
          </p>
        )}
      </section>
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 text-xs leading-relaxed text-foreground-secondary">
        <div className="flex items-center gap-2 font-black uppercase tracking-widest text-primary-light">
          <Link2 size={14} aria-hidden="true" /> Draft handoff
        </div>
        <p className="mt-2">
          A validated destination is not silently persisted here. Attach the
          returned typed value through the existing versioned campaign draft
          editor; publish remains subject to its normal approval and rollback
          lifecycle.
        </p>
      </div>
    </div>
  );
}
