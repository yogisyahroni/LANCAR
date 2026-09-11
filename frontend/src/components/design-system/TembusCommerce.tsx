"use client";

import { Heart, HeartOff, Plus, Star, Store, ShoppingCart } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TembusBadge, TembusButton, TembusCard, TembusIconButton } from "@/components/design-system/TembusCore";

export type TembusHalalStatus = "certified" | "non-halal" | "unknown";

export type TembusMerchantCardData = {
  id: string;
  name: string;
  imageUrl?: string | null;
  imageAlt?: string;
  address?: string | null;
  rating?: number | null;
  ratingCount?: number;
  distanceLabel?: string | null;
  etaLabel?: string | null;
  isOpen?: boolean | null;
  halalStatus?: TembusHalalStatus;
  deliveryFeeLabel?: string | null;
  promoLabel?: string | null;
  isFavorite?: boolean;
};

type TembusMerchantCardProps = TembusMerchantCardData & {
  onSelect?: () => void;
  onFavoriteChange?: (selected: boolean) => void;
  className?: string;
};

function formatRating(value: number) {
  return value.toFixed(1);
}

function TembusCommerceImage({ src, alt, label, className }: { src?: string | null; alt: string; label: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div role="img" aria-label={label} className={cn("flex aspect-[4/3] items-center justify-center bg-surface-subtle text-foreground-muted", className)}><Store className="h-8 w-8" aria-hidden="true" /></div>;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={cn("aspect-[4/3] w-full object-cover", className)} />;
}

function TembusMerchantCardFrame({ data, sponsored, onSelect, onFavoriteChange, className }: { data: TembusMerchantCardData; sponsored: boolean } & Pick<TembusMerchantCardProps, "onSelect" | "onFavoriteChange" | "className">) {
  const [favorite, setFavorite] = useState(Boolean(data.isFavorite));
  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    onFavoriteChange?.(next);
  };
  const details = [data.distanceLabel, data.etaLabel].filter(Boolean).join(", ");

  return (
    <TembusCard className={cn("overflow-hidden p-0", className)}>
      <div className="relative">
        <TembusCommerceImage src={data.imageUrl} alt={data.imageAlt || `Foto ${data.name}`} label={`Foto ${data.name} belum tersedia`} />
        {sponsored ? <TembusSponsoredLabel className="absolute left-3 top-3" /> : null}
        <TembusIconButton label={favorite ? `Hapus ${data.name} dari favorit` : `Tambah ${data.name} ke favorit`} selected={favorite} onClick={toggleFavorite} className="absolute right-2 top-2 bg-surface/95 hover:bg-surface">
          {favorite ? <Heart className="h-5 w-5 fill-current" aria-hidden="true" /> : <HeartOff className="h-5 w-5" aria-hidden="true" />}
        </TembusIconButton>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{data.name}</h3>
          {data.halalStatus === "certified" ? <TembusBadge className="bg-success-surface text-success">Halal</TembusBadge> : null}
          {data.halalStatus === "non-halal" ? <TembusBadge>Non-Halal</TembusBadge> : null}
        </div>
        {data.address ? <p className="truncate text-sm text-foreground-muted">{data.address}</p> : null}
        {data.rating != null && data.rating > 0 ? <TembusRatingSummary rating={data.rating} ratingCount={data.ratingCount} /> : null}
        {details ? <TembusEtaDistanceRow distanceLabel={data.distanceLabel} etaLabel={data.etaLabel} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          {data.isOpen != null ? <TembusBadge className={data.isOpen ? "bg-success-surface text-success" : "bg-error-surface text-error"}>{data.isOpen ? "Buka" : "Tutup"}</TembusBadge> : null}
          {data.deliveryFeeLabel ? <TembusPriceSummary label="Ongkir" value={data.deliveryFeeLabel} /> : null}
        </div>
        {data.promoLabel ? <TembusBadge className="bg-warning-surface text-warning">{data.promoLabel}</TembusBadge> : null}
        {onSelect ? <TembusButton variant="outline" onClick={onSelect} className="w-full">Lihat merchant</TembusButton> : null}
      </div>
    </TembusCard>
  );
}

/** Organic card. Facts must be mapped from the authoritative commerce response. */
export function TembusMerchantCard(props: TembusMerchantCardProps) {
  return <TembusMerchantCardFrame data={props} sponsored={false} {...props} />;
}

/** Sponsored card shares organic anatomy; disclosure is mandatory and not configurable. */
export function TembusSponsoredMerchantCard(props: TembusMerchantCardProps) {
  return <TembusMerchantCardFrame data={props} sponsored {...props} />;
}

export function TembusSponsoredLabel({ className }: { className?: string }) {
  return <TembusBadge className={cn("bg-info-surface text-info", className)}>Sponsored</TembusBadge>;
}

export function TembusRatingSummary({ rating, ratingCount = 0, className }: { rating: number; ratingCount?: number; className?: string }) {
  const count = ratingCount > 0 ? ` (${ratingCount})` : "";
  return <div className={cn("flex items-center gap-1 text-sm", className)} aria-label={`Rating ${formatRating(rating)} dari 5${count}`}><Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" /><span className="font-semibold text-foreground">{formatRating(rating)}{count}</span></div>;
}

export function TembusEtaDistanceRow({ distanceLabel, etaLabel, className }: { distanceLabel?: string | null; etaLabel?: string | null; className?: string }) {
  const labels = [distanceLabel, etaLabel].filter((value): value is string => Boolean(value));
  if (!labels.length) return null;
  return <div className={cn("flex flex-wrap gap-2 text-sm text-foreground-muted", className)} aria-label={labels.join(", ")}>{labels.map((label, index) => <span key={label}>{index ? `• ${label}` : label}</span>)}</div>;
}

export function TembusPriceSummary({ label, value, className }: { label: string; value: string; className?: string }) {
  return <span className={cn("text-sm text-foreground-secondary", className)}><span className="text-foreground-muted">{label}: </span><strong>{value}</strong></span>;
}

export function TembusMenuItemCard({ name, priceLabel, description, imageUrl, imageAlt, available = true, onAdd, className }: { name: string; priceLabel: string; description?: string; imageUrl?: string | null; imageAlt?: string; available?: boolean; onAdd?: () => void; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <TembusCard className={cn("flex items-center gap-3", className)}>
    {imageUrl && !failed ? <img src={imageUrl} alt={imageAlt || `Foto ${name}`} onError={() => setFailed(true)} className="h-22 w-22 shrink-0 rounded-xl object-cover" /> : <div role="img" aria-label={`Foto ${name} belum tersedia`} className="flex h-22 w-22 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-foreground-muted"><Store className="h-6 w-6" aria-hidden="true" /></div>}
    <div className="min-w-0 flex-1 space-y-1"><h3 className="line-clamp-2 text-sm font-bold text-foreground">{name}</h3>{description ? <p className="line-clamp-2 text-sm text-foreground-muted">{description}</p> : null}<p className="text-sm font-bold text-primary">{priceLabel}</p></div>
    {onAdd ? <TembusIconButton label={available ? `Tambah ${name}` : `${name} tidak tersedia`} onClick={onAdd} disabled={!available}><Plus className="h-5 w-5" aria-hidden="true" /></TembusIconButton> : null}
  </TembusCard>;
}

export function TembusPromoCard({ title, message, actionLabel, onAction, className }: { title: string; message: string; actionLabel?: string; onAction?: () => void; className?: string }) {
  return <TembusCard className={cn("space-y-2", className)}><h3 className="text-base font-bold text-foreground">{title}</h3><p className="line-clamp-3 text-sm text-foreground-muted">{message}</p>{actionLabel && onAction ? <TembusButton variant="outline" onClick={onAction}>{actionLabel}</TembusButton> : null}</TembusCard>;
}

export function TembusVoucherChip({ label, onClick, className }: { label: string; onClick?: () => void; className?: string }) {
  if (!onClick) return <TembusBadge className={cn("bg-info-surface text-info", className)}>{label}</TembusBadge>;
  return <TembusButton variant="tonal" size="small" onClick={onClick} className={className}>{label}</TembusButton>;
}

export function TembusCartBar({ itemCount, totalLabel, onCheckout, className }: { itemCount: number; totalLabel: string; onCheckout: () => void; className?: string }) {
  return <aside className={cn("flex min-h-20 items-center gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg", className)} aria-label="Ringkasan keranjang"><ShoppingCart className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-xs text-foreground-muted">{itemCount} item</p><p className="truncate text-sm font-bold text-foreground">{totalLabel}</p></div><TembusButton onClick={onCheckout}>Lanjut</TembusButton></aside>;
}

export type TembusCommerceSlot = { id: string; content: ReactNode };
