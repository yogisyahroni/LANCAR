import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TembusMerchantCard, TembusSponsoredMerchantCard } from '@/components/design-system/TembusCommerce'

const merchant = {
  id: 'merchant-1',
  name: 'Warung TEMBUS',
  address: 'Jl. Merdeka',
  rating: 4.8,
  ratingCount: 120,
  distanceLabel: '1.2 km',
  etaLabel: '25 menit',
  isOpen: true,
  halalStatus: 'certified' as const,
  deliveryFeeLabel: 'Rp5.000',
  promoLabel: 'Hemat 20%',
}

describe('TEMBUS commerce component family', () => {
  it('keeps sponsored disclosure mandatory and keeps promo independent', () => {
    render(<TembusSponsoredMerchantCard {...merchant} />)

    expect(screen.getByText('Sponsored')).toBeInTheDocument()
    expect(screen.getByText('Hemat 20%')).toBeInTheDocument()
    expect(screen.getByLabelText('Rating 4.8 dari 5 (120)')).toBeInTheDocument()
    expect(screen.getByLabelText('1.2 km, 25 menit')).toBeInTheDocument()
    expect(screen.getByText(/Ongkir/)).toBeInTheDocument()
  })

  it('exposes favorite as a 48px accessible pressed control', () => {
    const onFavoriteChange = vi.fn()
    render(<TembusMerchantCard {...merchant} onFavoriteChange={onFavoriteChange} />)

    const favorite = screen.getByRole('button', { name: 'Tambah Warung TEMBUS ke favorit' })
    expect(favorite).toHaveAttribute('aria-pressed', 'false')
    expect(favorite).toHaveClass('min-h-12', 'min-w-12')
    fireEvent.click(favorite)
    expect(favorite).toHaveAttribute('aria-pressed', 'true')
    expect(onFavoriteChange).toHaveBeenCalledWith(true)
  })

  it('uses an explicit neutral fallback when merchant media is absent', () => {
    render(<TembusMerchantCard {...merchant} imageUrl={null} />)
    expect(screen.getByRole('img', { name: 'Foto Warung TEMBUS belum tersedia' })).toBeInTheDocument()
  })
})
