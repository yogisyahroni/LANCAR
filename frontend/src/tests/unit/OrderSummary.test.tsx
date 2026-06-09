import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderSummary } from '@/components/orders/OrderSummary';
import React from 'react';

describe('OrderSummary Component', () => {
  const samplePricing = {
    distance_km: 12.5,
    base_price_idr: 25000,
    volumetric_surcharge_idr: 5000,
    insurance_premium_idr: 1000,
    total_price_idr: 31000,
  };

  const baseProps = {
    promoCode: '',
    promoQuote: null,
    onPromoCodeChange: vi.fn(),
    onValidatePromo: vi.fn(),
  };

  it('renders loading placeholder initially', () => {
    render(<OrderSummary {...baseProps} isLoading={true} pricing={null} isValid={false} />);
    expect(screen.getByText('Menghitung...')).toBeInTheDocument();
  });

  it('renders correctly with given pricing data', () => {
    render(<OrderSummary {...baseProps} isLoading={false} pricing={samplePricing} isValid={true} />);
    
    // Check total and items
    expect(screen.getByText('Rp 25.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 5.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 1.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 31.000')).toBeInTheDocument();
    
    // Check submit button text
    expect(screen.getByText('Bayar Sekarang')).toBeInTheDocument();
  });

  it('disables the payment button when isValid is false', () => {
    render(<OrderSummary {...baseProps} isLoading={false} pricing={samplePricing} isValid={false} />);
    const button = screen.getByRole('button', { name: /Bayar Sekarang/i });
    expect(button).toBeDisabled();
  });
});
