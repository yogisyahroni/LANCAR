import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, UploadCloud } from "lucide-react";
import type { ExperienceAsset } from "./types";

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);
const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

type Props = {
  disabled?: boolean;
  onValidate: (asset: ExperienceAsset) => Promise<void> | void;
};

type Preflight = {
  fileName: string;
  bytes: number;
  checksum: string;
  width: number;
  height: number;
  contentType: string;
};

const newAsset = (): ExperienceAsset => ({
  asset_id: "",
  uri: "",
  kind: "image",
  checksum: "",
  content_type: "image/webp",
  width: null,
  height: null,
  aspect_ratio: null,
  size_limit_bytes: MAX_ASSET_BYTES,
  version: "1",
  expires_at: null,
  cache_policy: "private",
  retention_until: null,
  fallback_asset_id: null,
});
const kindForType = (type: string): ExperienceAsset["kind"] =>
  type.startsWith("video/")
    ? "video"
    : type === "image/gif"
      ? "animation"
      : "image";
const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
const toIsoDate = (value: string) =>
  value ? new Date(value).toISOString() : null;
const inputDate = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

const mediaDimensions = (
  file: File,
  objectUrl: string,
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("The media file is corrupt or cannot be decoded"));
      };
      video.src = objectUrl;
      return;
    }
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The image file is corrupt or cannot be decoded"));
    };
    image.src = objectUrl;
  });

export default function AssetUploader({ disabled = false, onValidate }: Props) {
  const [asset, setAsset] = useState<ExperienceAsset>(newAsset);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const update = (patch: Partial<ExperienceAsset>) =>
    setAsset((current) => ({ ...current, ...patch }));
  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreflight(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      if (!ALLOWED_TYPES.has(file.type))
        throw new Error(
          "Unsupported asset type. Use AVIF, GIF, JPEG, PNG, WebP, MP4 or WebM.",
        );
      if (file.size > MAX_ASSET_BYTES)
        throw new Error("Asset is larger than the 5 MiB publish limit.");
      const [digest, dimensions] = await Promise.all([
        crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        mediaDimensions(file, objectUrl),
      ]);
      const checksum = toHex(digest);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
      setPreflight({
        fileName: file.name,
        bytes: file.size,
        checksum,
        width: dimensions.width,
        height: dimensions.height,
        contentType: file.type,
      });
      update({
        content_type: file.type,
        kind: kindForType(file.type),
        checksum,
        width: dimensions.width,
        height: dimensions.height,
        aspect_ratio: dimensions.width / dimensions.height,
        size_limit_bytes: MAX_ASSET_BYTES,
      });
    } catch (caught) {
      URL.revokeObjectURL(objectUrl);
      setError(
        caught instanceof Error ? caught.message : "Asset preflight failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    setError(null);
    if (!asset.asset_id.trim() || !asset.uri.trim())
      return setError(
        "Internal label and approved HTTPS or /assets URI are required",
      );
    if (!/^[a-f0-9]{64}$/i.test(asset.checksum))
      return setError(
        "SHA-256 checksum must contain 64 hexadecimal characters",
      );
    if (!asset.size_limit_bytes || asset.size_limit_bytes > MAX_ASSET_BYTES)
      return setError("Size limit must be between 1 byte and 5 MiB");
    if ((asset.width == null) !== (asset.height == null))
      return setError("Width and height must be supplied together");
    if (preflight && asset.size_limit_bytes < preflight.bytes)
      return setError(
        "The declared size limit is smaller than the preflighted file",
      );
    await onValidate({
      ...asset,
      asset_id: asset.asset_id.trim(),
      uri: asset.uri.trim(),
      checksum: asset.checksum.toLowerCase(),
      version: asset.version?.trim() || "1",
    });
  };
  return (
    <section
      className="rounded-3xl border border-border bg-surface/[0.03] p-5"
      aria-labelledby="asset-uploader-title"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2
            id="asset-uploader-title"
            className="text-base font-black text-foreground-muted"
          >
            Register approved asset
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground-muted">
            Preflight a local file here, then register the immutable HTTPS or
            /assets reference. Upload tokens and object-storage credentials
            never enter the browser.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-sm font-bold tracking-wide text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <UploadCloud size={14} aria-hidden="true" /> Preflight file
          <input
            type="file"
            aria-label="Preflight asset file"
            className="sr-only"
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/webm"
            disabled={disabled || busy}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {preflight ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-success bg-success/[0.06] p-3 text-xs text-success">
          <FileCheck2 size={15} aria-hidden="true" />
          <span>
            {preflight.fileName} ·{" "}
            {(preflight.bytes / (1024 * 1024)).toFixed(2)} MiB ·{" "}
            {preflight.width}×{preflight.height}
          </span>
          <CheckCircle2 size={14}  aria-hidden="true"/>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-error bg-error-surface p-3 text-xs text-error"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Internal label
          <input
            className={inputClass}
            disabled={disabled || busy}
            value={asset.asset_id}
            onChange={(event) => update({ asset_id: event.target.value })}
            placeholder="hero-home-2026-09"
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted md:col-span-2">
          Approved URI
          <input
            className={inputClass}
            disabled={disabled || busy}
            value={asset.uri}
            onChange={(event) => update({ uri: event.target.value })}
            placeholder="https://cdn.example.com/hero.webp"
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Kind
          <select
            className={inputClass}
            disabled={disabled || busy}
            value={asset.kind}
            onChange={(event) =>
              update({ kind: event.target.value as ExperienceAsset["kind"] })
            }
          >
            <option value="image">Image</option>
            <option value="animation">Animation</option>
            <option value="icon">Icon</option>
            <option value="video">Video</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Content type
          <select
            className={inputClass}
            disabled={disabled || busy}
            value={asset.content_type || ""}
            onChange={(event) => update({ content_type: event.target.value })}
          >
            <option value="image/webp">image/webp</option>
            <option value="image/avif">image/avif</option>
            <option value="image/png">image/png</option>
            <option value="image/jpeg">image/jpeg</option>
            <option value="image/gif">image/gif</option>
            <option value="video/mp4">video/mp4</option>
            <option value="video/webm">video/webm</option>
          </select>
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Width
          <input
            type="number"
            min="1"
            max="4096"
            className={inputClass}
            disabled={disabled || busy}
            value={asset.width ?? ""}
            onChange={(event) =>
              update({
                width: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Height
          <input
            type="number"
            min="1"
            max="4096"
            className={inputClass}
            disabled={disabled || busy}
            value={asset.height ?? ""}
            onChange={(event) =>
              update({
                height: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Size limit
          <input
            type="number"
            min="1"
            max={MAX_ASSET_BYTES}
            className={inputClass}
            disabled={disabled || busy}
            value={asset.size_limit_bytes ?? MAX_ASSET_BYTES}
            onChange={(event) =>
              update({ size_limit_bytes: Number(event.target.value) })
            }
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted xl:col-span-2">
          SHA-256
          <input
            className={inputClass}
            disabled={disabled || busy}
            value={asset.checksum}
            onChange={(event) => update({ checksum: event.target.value })}
            placeholder="64 hexadecimal characters"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Version
          <input
            className={inputClass}
            disabled={disabled || busy}
            value={asset.version || ""}
            onChange={(event) => update({ version: event.target.value })}
            placeholder="2026-09-10.1"
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Cache
          <select
            className={inputClass}
            disabled={disabled || busy}
            value={asset.cache_policy || "private"}
            onChange={(event) =>
              update({
                cache_policy: event.target
                  .value as ExperienceAsset["cache_policy"],
              })
            }
          >
            <option value="private">private</option>
            <option value="public">public</option>
            <option value="no-store">no-store</option>
          </select>
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Expires at
          <input
            type="datetime-local"
            className={inputClass}
            disabled={disabled || busy}
            value={inputDate(asset.expires_at)}
            onChange={(event) =>
              update({ expires_at: toIsoDate(event.target.value) })
            }
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Retention until
          <input
            type="datetime-local"
            className={inputClass}
            disabled={disabled || busy}
            value={inputDate(asset.retention_until)}
            onChange={(event) =>
              update({ retention_until: toIsoDate(event.target.value) })
            }
          />
        </label>
        <label className="text-xs font-bold tracking-wide text-foreground-muted">
          Low-bandwidth asset ID
          <input
            className={inputClass}
            disabled={disabled || busy}
            value={asset.fallback_asset_id || ""}
            onChange={(event) =>
              update({ fallback_asset_id: event.target.value.trim() || null })
            }
            placeholder="lighter-webp"
          />
        </label>
      </div>
      {previewUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-scrim/30 p-3">
          {asset.kind === "video" ? (
            <video
              src={previewUrl}
              controls
              className="max-h-48 w-full object-contain"
              aria-label="Local asset preflight preview"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Local asset preflight preview"
              className="max-h-48 w-full object-contain"
            />
          )}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            void validate();
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-on-primary disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <FileCheck2 size={14} aria-hidden="true" />
          )}{" "}
          Validate reference
        </button>
        <p className="text-[11px] text-foreground-muted">
          Validation stages the reference for a draft; publishing remains
          separately permissioned and versioned.
        </p>
      </div>
    </section>
  );
}
