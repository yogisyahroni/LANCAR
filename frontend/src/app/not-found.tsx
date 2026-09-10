import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center text-foreground">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground-muted">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-3 max-w-md text-sm text-foreground-muted">
        Tautan yang Anda buka tidak tersedia atau sudah tidak aktif.
      </p>
      <Link href="/" className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        Kembali ke beranda
      </Link>
    </main>
  );
}
