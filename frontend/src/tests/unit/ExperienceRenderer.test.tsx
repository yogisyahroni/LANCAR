import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExperienceRenderer from '@/components/experience/ExperienceRenderer';
import { fetchCustomerExperience } from '@/lib/experience/experienceClient';

vi.mock('@/lib/experience/experienceClient', () => ({
  fetchCustomerExperience: vi.fn(),
}));

describe('ExperienceRenderer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the resolved campaign identity shared with customer Android', async () => {
    vi.mocked(fetchCustomerExperience).mockResolvedValue({
      manifest_id: 'manifest-customer-1',
      revision: 7,
      market_code: 'id-jk',
      locale: 'id-ID',
      surface: 'customer_web',
      checksum: 'a'.repeat(64),
      sections: [{
        id: 'campaign',
        component: 'campaign_intro',
        properties: { campaign_id: 'ramadan-2026', title: 'Promo Ramadan', body: 'Kirim lebih mudah.' },
      }],
    });

    render(<ExperienceRenderer />);

    await waitFor(() => expect(screen.getByText('Promo Ramadan')).toBeInTheDocument());
    const campaign = screen.getByText('Promo Ramadan').closest('[data-campaign-id]');
    expect(campaign).toHaveAttribute('data-campaign-id', 'ramadan-2026');
    expect(campaign).toHaveAttribute('data-experience-manifest', 'manifest-customer-1');
    expect(campaign).toHaveAttribute('data-experience-revision', '7');
  });
});
