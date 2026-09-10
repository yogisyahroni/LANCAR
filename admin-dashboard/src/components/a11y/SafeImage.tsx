import { useState } from 'react'
import { cn } from '../../lib/utils'
import type { ImgHTMLAttributes, ReactEventHandler } from 'react'

interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  alt: string
  onError?: ReactEventHandler<HTMLImageElement>
}

export function SafeImage({ alt, loading = 'lazy', className, onError, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        data-safe-image-placeholder=""
        className={cn(
          'flex items-center justify-center overflow-hidden bg-surface-subtle text-foreground-muted',
          className
        )}
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-surface-subtle" />
      </div>
    )
  }

  return (
    <img
      alt={alt}
      loading={loading}
      className={className}
      onError={(event) => {
        setFailed(true)
        onError?.(event)
      }}
      {...props}
    />
  )
}
