import { isPublicUploadPath } from './uploads.controller';

describe('upload download exposure policy', () => {
  it('allows only approved public assets on the unauthenticated public namespace', () => {
    expect(isPublicUploadPath('banners/home.png')).toBe(true);
    expect(isPublicUploadPath('banners/nested/promo.webp')).toBe(true);
    expect(isPublicUploadPath('resi-templates/assets/logo.png')).toBe(true);
  });

  it('keeps private scopes and traversal attempts out of the public namespace', () => {
    expect(isPublicUploadPath('courier-documents/2026/document.pdf')).toBe(false);
    expect(isPublicUploadPath('merchant-documents/2026/document.pdf')).toBe(false);
    expect(isPublicUploadPath('resi-templates/../courier-documents/document.pdf')).toBe(false);
    expect(isPublicUploadPath('banners/../courier-documents/document.pdf')).toBe(false);
    expect(isPublicUploadPath('banners/.hidden.png')).toBe(false);
  });
});
