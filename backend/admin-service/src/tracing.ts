import dotenv from 'dotenv';
import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter as OTLPGrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPHttpTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';

dotenv.config();
dotenv.config({ path: '../../.env' });

type ShutdownLogger = {
  info?: (message: string, meta?: unknown) => void;
  warn?: (message: string, meta?: unknown) => void;
};

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOCAL_ENDPOINT_PATTERN = /\/\/(?:localhost|127\.0\.0\.1|\[::1\])/i;
const DEFAULT_SERVICE_NAME = 'admin-service';
const DEFAULT_HTTP_ENDPOINT = 'http://otel-collector:4318/v1/traces';
const DEFAULT_GRPC_ENDPOINT = 'http://otel-collector:4317';
const REDACTED_QUERY_PARAMS = [
  'access_token',
  'api_key',
  'auth',
  'authorization',
  'code',
  'cookie',
  'key',
  'otp',
  'password',
  'pin',
  'refresh_token',
  'secret',
  'signature',
  'token',
];
const MASKED_QUERY_VALUE = '[REDACTED]';
const SENSITIVE_QUERY_PARAMS = new Set(REDACTED_QUERY_PARAMS.map((value) => value.toLowerCase()));

let sdk: NodeSDK | undefined;

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const isTracingEnabled = () => process.env.OTEL_ENABLED === 'true';

const normalizeProtocol = () => process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf';

const normalizeHttpTraceEndpoint = (endpoint: string | undefined) => {
  const base = endpoint?.trim() || DEFAULT_HTTP_ENDPOINT;
  if (base.endsWith('/v1/traces')) return base;
  return `${base.replace(/\/+$/, '')}/v1/traces`;
};

const normalizeGrpcEndpoint = (endpoint: string | undefined) =>
  endpoint?.trim() || DEFAULT_GRPC_ENDPOINT;

const createTraceExporter = () => {
  const protocol = normalizeProtocol();
  if (protocol === 'grpc') {
    return new OTLPGrpcTraceExporter({
      url: normalizeGrpcEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    });
  }

  return new OTLPHttpTraceExporter({
    url: normalizeHttpTraceEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
  });
};

const createSampler = () => {
  const sampler = process.env.OTEL_TRACES_SAMPLER || 'traceidratio';
  if (sampler === 'always_on') return new ParentBasedSampler({ root: new AlwaysOnSampler() });
  if (sampler === 'always_off') return new ParentBasedSampler({ root: new AlwaysOffSampler() });

  const ratio = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? (isProductionRuntime() ? '0.05' : '1'));
  const safeRatio = Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0.05;
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(safeRatio) });
};

const safeHeaderId = (value: string | string[] | number | undefined) => {
  if (Array.isArray(value)) return safeHeaderId(value[0]);
  const candidate = String(value ?? '').trim();
  return SAFE_ID_PATTERN.test(candidate) ? candidate : undefined;
};

const outgoingHeaderValue = (
  headers: Record<string, string | string[] | number | undefined> | readonly string[] | undefined,
  name: string
) => {
  if (!headers || Array.isArray(headers)) return undefined;
  const headerMap = headers as Record<string, string | string[] | number | undefined>;
  return headerMap[name] ?? headerMap[name.toLowerCase()];
};

const firstHeaderValue = (value: unknown) => {
  if (Array.isArray(value)) return firstHeaderValue(value[0]);
  if (value === undefined || value === null) return undefined;
  const candidate = String(value).trim();
  return candidate || undefined;
};

const redactSearchParams = (params: URLSearchParams) => {
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      params.set(key, MASKED_QUERY_VALUE);
    }
  }
};

const sanitizeTarget = (target: string | undefined) => {
  if (!target) return undefined;
  const queryIndex = target.indexOf('?');
  if (queryIndex === -1) return target;

  const path = target.slice(0, queryIndex);
  const query = target.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  redactSearchParams(params);

  const sanitizedQuery = params.toString();
  return sanitizedQuery ? `${path}?${sanitizedQuery}` : path;
};

const sanitizeUrl = (rawUrl: string | undefined, baseUrl: string | undefined) => {
  if (!rawUrl) return undefined;

  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    redactSearchParams(url.searchParams);
    return url.toString();
  } catch {
    return sanitizeTarget(rawUrl);
  }
};

const getRequestTarget = (request: unknown) => {
  const requestRecord = request as { url?: unknown; path?: unknown };
  if (typeof requestRecord.url === 'string') return requestRecord.url;
  if (typeof requestRecord.path === 'string') return requestRecord.path;
  return undefined;
};

const getRequestBaseUrl = (request: unknown) => {
  const requestRecord = request as {
    headers?: Record<string, unknown>;
    getHeader?: (name: string) => unknown;
    host?: unknown;
    protocol?: unknown;
    socket?: { encrypted?: boolean };
  };

  const host =
    firstHeaderValue(requestRecord.headers?.host) ||
    firstHeaderValue(requestRecord.getHeader?.('host')) ||
    firstHeaderValue(requestRecord.host);
  if (!host) return undefined;

  const protocol =
    typeof requestRecord.protocol === 'string'
      ? requestRecord.protocol.replace(/:$/, '')
      : requestRecord.socket?.encrypted
        ? 'https'
        : 'http';
  return `${protocol}://${host}`;
};

const setSanitizedHttpUrlAttributes = (
  span: { setAttribute: (key: string, value: string) => unknown },
  request: unknown
) => {
  const sanitizedTarget = sanitizeTarget(getRequestTarget(request));
  const sanitizedUrl = sanitizeUrl(getRequestTarget(request), getRequestBaseUrl(request));

  if (sanitizedTarget) {
    span.setAttribute('http.target', sanitizedTarget);
  }
  if (sanitizedUrl) {
    span.setAttribute('http.url', sanitizedUrl);
    span.setAttribute('url.full', sanitizedUrl);
  }
};

const shouldIgnoreIncomingRequest = (url?: string) => {
  const path = url?.split('?')[0] || '';
  return path === '/health' || path === '/metrics';
};

if (isTracingEnabled()) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (isProductionRuntime() && endpoint && LOCAL_ENDPOINT_PATTERN.test(endpoint)) {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must use an internal collector host, not localhost, in production');
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
      'deployment.environment':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT ||
        process.env.ENVIRONMENT ||
        process.env.NODE_ENV ||
        'development',
    }),
    sampler: createSampler(),
    traceExporter: createTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => shouldIgnoreIncomingRequest(request.url),
          redactedQueryParams: REDACTED_QUERY_PARAMS,
          requestHook: (span, request) => setSanitizedHttpUrlAttributes(span, request),
          applyCustomAttributesOnSpan: (span, request) => setSanitizedHttpUrlAttributes(span, request),
          startIncomingSpanHook: (request) => ({
            'request.id': safeHeaderId(request.headers['x-request-id']) || 'generated',
            'deployment.environment':
              process.env.OTEL_DEPLOYMENT_ENVIRONMENT ||
              process.env.ENVIRONMENT ||
              process.env.NODE_ENV ||
              'development',
          }),
          startOutgoingSpanHook: (request) => ({
            'request.id': safeHeaderId(outgoingHeaderValue(request.headers, 'x-request-id')) || 'generated',
          }),
        },
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: false,
          addSqlCommenterCommentToQueries: false,
        },
        '@opentelemetry/instrumentation-ioredis': {
          requireParentSpan: true,
        },
      }),
    ],
  });

  sdk.start();
}

export const getActiveTraceContext = () => {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  if (!spanContext || /^0+$/.test(spanContext.traceId) || /^0+$/.test(spanContext.spanId)) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
};

export const annotateActiveSpan = (attributes: Record<string, string | number | boolean | undefined>) => {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  const safeAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | boolean>;

  if (Object.keys(safeAttributes).length > 0) {
    activeSpan.setAttributes(safeAttributes);
  }
};

export const shutdownTracing = async (logger?: ShutdownLogger) => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    logger?.info?.('OpenTelemetry SDK shut down', { event: 'otel_shutdown_complete' });
  } catch (error) {
    logger?.warn?.('OpenTelemetry SDK shutdown failed', {
      event: 'otel_shutdown_failed',
      error_name: error instanceof Error ? error.name : 'UnknownError',
      error_message: error instanceof Error ? error.message : 'Unknown tracing shutdown failure',
    });
  }
};
