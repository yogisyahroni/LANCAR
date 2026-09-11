import { X } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type TembusButtonVariant = 'primary' | 'secondary' | 'outline' | 'tonal' | 'destructive' | 'text'
export type TembusControlState = 'default' | 'loading' | 'success' | 'warning' | 'error' | 'disabled'
export type TembusControlSize = 'small' | 'medium' | 'large'

const buttonVariantClasses: Record<TembusButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-dark',
  secondary: 'bg-secondary-container text-on-secondary-container hover:bg-primary-soft',
  outline: 'border border-border-strong bg-transparent text-primary hover:bg-primary-soft',
  tonal: 'bg-primary-soft text-primary-dark hover:bg-primary-pale',
  destructive: 'bg-error text-on-error hover:bg-error/90',
  text: 'bg-transparent text-primary underline-offset-4 hover:underline',
}

const buttonSizeClasses: Record<TembusControlSize, string> = { small: 'min-h-12 px-3', medium: 'min-h-12 px-4', large: 'min-h-14 px-5' }

type TembusButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: TembusButtonVariant; state?: TembusControlState; size?: TembusControlSize; leadingIcon?: ReactNode; trailingIcon?: ReactNode }

export function TembusButton({ className, variant = 'primary', state = 'default', size = 'medium', leadingIcon, trailingIcon, children, disabled, ...props }: TembusButtonProps) {
  const isDisabled = disabled || state === 'disabled' || state === 'loading'
  return <button type="button" {...props} disabled={isDisabled} data-state={state} className={cn('inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60', buttonVariantClasses[variant], buttonSizeClasses[size], className)}>{state === 'loading' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : leadingIcon}<span>{children}</span>{state !== 'loading' ? trailingIcon : null}</button>
}

type TembusIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; selected?: boolean; children: ReactNode }

export function TembusIconButton({ label, selected = false, className, children, ...props }: TembusIconButtonProps) {
  return <button type="button" {...props} aria-label={label} aria-pressed={selected} className={cn('inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60', className)}>{children}</button>
}

type TembusTextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { label: string; supportingText?: string; errorText?: string; state?: TembusControlState; leadingIcon?: ReactNode; trailingIcon?: ReactNode }

export function TembusTextField({ label, supportingText, errorText, state = 'default', leadingIcon, trailingIcon, id, className, disabled, ...props }: TembusTextFieldProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const message = errorText || supportingText
  const messageId = `${inputId}-message`
  const invalid = state === 'error' || Boolean(errorText)
  return <div className="space-y-1.5"><label htmlFor={inputId} className="block text-sm font-semibold text-foreground">{label}</label><div className={cn('flex min-h-12 items-center gap-2 rounded-xl border bg-input-background px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-focus-ring', invalid ? 'border-error' : 'border-input', className)}>{leadingIcon ? <span className="shrink-0 text-foreground-muted" aria-hidden="true">{leadingIcon}</span> : null}<input {...props} id={inputId} disabled={disabled || state === 'disabled'} aria-invalid={invalid || undefined} aria-describedby={message ? messageId : undefined} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted" />{trailingIcon ? <span className="shrink-0 text-foreground-muted">{trailingIcon}</span> : null}</div>{message ? <p id={messageId} className={cn('text-xs', invalid ? 'text-error' : 'text-foreground-muted')} role={invalid ? 'alert' : undefined}>{message}</p> : null}</div>
}

export function TembusSearchField(props: Omit<TembusTextFieldProps, 'label'> & { label?: string }) {
  return <TembusTextField type="search" label={props.label || 'Cari'} placeholder="Cari layanan atau pesanan" {...props} />
}

type TembusChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }

export function TembusChip({ selected = false, className, children, ...props }: TembusChipProps) {
  return <button type="button" {...props} aria-pressed={selected} className={cn('inline-flex min-h-12 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', selected ? 'border-primary bg-primary-soft text-primary-dark' : 'border-border bg-surface text-foreground-secondary hover:bg-surface-subtle', className)}>{children}</button>
}

export function TembusCard({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={cn('rounded-2xl border border-border bg-surface p-4 text-foreground', className)}>{children}</article>
}

export function TembusBadge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn('inline-flex min-h-7 items-center rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-foreground-secondary', className)}>{children}</span>
}

export function TembusAppBar({ title, navigation, actions, className }: { title: string; navigation?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={cn('flex min-h-14 items-center gap-3 border-b border-border bg-surface px-4 py-2', className)}><div className="shrink-0">{navigation}</div><h1 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{title}</h1><div className="flex shrink-0 items-center gap-1">{actions}</div></header>
}

export function TembusBottomNavigation({ items, className }: { items: Array<{ label: string; icon: ReactNode; selected?: boolean; onClick: () => void; disabled?: boolean }>; className?: string }) {
  return <nav aria-label="Navigasi utama" className={cn('grid min-h-16 grid-flow-col auto-cols-fr border-t border-border bg-surface', className)}>{items.map((item) => <button key={item.label} type="button" onClick={item.onClick} disabled={item.disabled} aria-current={item.selected ? 'page' : undefined} className="inline-flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-semibold text-foreground-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 data-[selected=true]:text-primary" data-selected={item.selected ? 'true' : 'false'}>{item.icon}<span>{item.label}</span></button>)}</nav>
}

export function TembusModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  const titleId = 'tembus-modal-title'
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/70 p-4 sm:items-center" role="presentation" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 text-foreground shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3"><h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold">{title}</h2><TembusIconButton label="Tutup" onClick={onClose}><X className="h-5 w-5" aria-hidden="true" /></TembusIconButton></div><div className="mt-4">{children}</div></section></div>
}

export function TembusToast({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return <div role="status" aria-live="polite" className="flex min-h-12 items-center gap-3 rounded-xl bg-scrim px-4 py-3 text-sm text-on-primary shadow-xl"><span className="min-w-0 flex-1">{message}</span>{actionLabel && onAction ? <button type="button" onClick={onAction} className="min-h-11 rounded-lg px-3 font-semibold text-primary-light underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{actionLabel}</button> : null}</div>
}

export function TembusSkeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cn('animate-pulse rounded-xl bg-surface-subtle', className)} />
}

export function TembusEmptyState({ title, message, actionLabel, onAction, icon, className }: { title: string; message: string; actionLabel?: string; onAction?: () => void; icon?: ReactNode; className?: string }) {
  return <section className={cn('flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-8 text-center', className)}><div className="text-foreground-muted" aria-hidden="true">{icon}</div><h2 className="text-base font-bold text-foreground">{title}</h2><p className="max-w-md text-sm text-foreground-secondary">{message}</p>{actionLabel && onAction ? <TembusButton variant="outline" onClick={onAction}>{actionLabel}</TembusButton> : null}</section>
}
