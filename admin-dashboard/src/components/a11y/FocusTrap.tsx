import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface FocusTrapProps {
  active?: boolean
  className?: string
  children: ReactNode
}

export function FocusTrap({ active = true, className, children }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const getFocusableElements = useCallback((): HTMLElement[] => {
    const container = containerRef.current
    if (!container) return []
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.getClientRects().length > 0
    )
  }, [])

  useEffect(() => {
    if (!active) return undefined

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const container = containerRef.current
    if (!container) return undefined

    const focusables = getFocusableElements()
    ;(focusables[0] ?? container).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = getFocusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      const current = document.activeElement
      const inside = current instanceof HTMLElement && container.contains(current)
      if (event.shiftKey) {
        if (current === first || !inside) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (current === last || !inside) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown, true)

    return () => {
      container.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocusedRef.current?.focus()
    }
  }, [active, getFocusableElements])

  return (
    <div ref={containerRef} tabIndex={-1} className={className}>
      {children}
    </div>
  )
}
