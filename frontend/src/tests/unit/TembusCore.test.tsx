import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TembusButton, TembusIconButton, TembusModal, TembusTextField } from '@/components/design-system/TembusCore'

describe('TEMBUS core component contract', () => {
  it('exposes semantic button states and prevents activation while loading', () => {
    const onClick = vi.fn()
    render(<TembusButton state="loading" onClick={onClick}>Simpan</TembusButton>)

    const button = screen.getByRole('button', { name: 'Simpan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('data-state', 'loading')
    expect(button).toHaveClass('min-h-12')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps field label, invalid state, and error message programmatically associated', () => {
    render(<TembusTextField label="Alamat tujuan" value="" onChange={() => undefined} errorText="Alamat wajib diisi" state="error" />)

    const input = screen.getByRole('textbox', { name: 'Alamat tujuan' })
    const error = screen.getByRole('alert')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
    expect(error).toHaveTextContent('Alamat wajib diisi')
  })

  it('requires an accessible name for icon-only actions and names modal content', () => {
    const onClose = vi.fn()
    render(<><TembusIconButton label="Buka filter"><span aria-hidden="true">+</span></TembusIconButton><TembusModal open title="Filter layanan" onClose={onClose}><p>Konten filter</p></TembusModal></>)

    expect(screen.getByRole('button', { name: 'Buka filter' })).toHaveAttribute('aria-label', 'Buka filter')
    expect(screen.getByRole('dialog', { name: 'Filter layanan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
