import type { Metadata } from 'next';
import LandingPageContent from './LandingPageContent';

export const metadata: Metadata = {
  title: 'TEMBUS — On-demand logistics',
  description: 'Parcels, food, roadside assistance, and towing in one TEMBUS application.',
};

export default function LandingPage() {
  return <LandingPageContent />;
}
