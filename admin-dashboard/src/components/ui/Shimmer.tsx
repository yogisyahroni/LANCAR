import { useEffect } from 'react'
import { cn } from '../lib/utils'
import type { HTMLAttributes } from 'react'

const KEYFRAME_STYLE_ID = 'a11y-shimmer-keyframes'

const SHIMMER_KEYFRAMES =
  '@keyframes a11y-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}'

type ShimmerProps = HTMLAttributes<HTMLDivElement>

export function Shimmer({ className, ...props }: ShimmerProps) {
  useEffect(() => {
    if (document.getElementById(KEYFRAME_STYLE_ID)) return
    const style = document.createElement('style')
    style.id = KEYFRAME_STYLE_ID
    style.textContent = SHIMMER_KEYFRAMES
    document.head.appendChild(style)
  }, [])

  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-xl bg-white/10', className)}
      {...props}
    >
      <div
        className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
        style={{ animation: 'a11y-shimmer 1.5s ease-in-out infinite' }}
      />
    </div>
  )
}
