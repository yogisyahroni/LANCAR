import { useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  Mail,
  Menu,
  ShieldCheck,
  Store,
  Smartphone,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'

const MERCHANT_ANDROID_RELEASE_URL = 'https://github.com/yogisyahroni/LANCAR/releases/latest'
const PUBLIC_INFORMATION_URL = 'https://bawain.my.id'

const publicTrustLinks = [
  { href: `${PUBLIC_INFORMATION_URL}/bantuan/kebijakan-privasi`, label: 'Kebijakan Privasi' },
  { href: `${PUBLIC_INFORMATION_URL}/bantuan/syarat-dan-ketentuan`, label: 'Syarat dan Ketentuan' },
  { href: `${PUBLIC_INFORMATION_URL}/bantuan/pusat-bantuan`, label: 'Pusat Bantuan' },
]

// Social proof is intentionally data-driven. Nothing is rendered until a partner
// or testimonial has a verified source and approval for public publication.
const verifiedProofItems: Array<{ kind: 'partner' | 'testimonial'; label: string; value: string }> = []

const navigation = [
  { href: '#untuk-bisnis', label: 'Untuk bisnis' },
  { href: '#cara-bergabung', label: 'Cara bergabung' },
  { href: '#ruang-kerja', label: 'Ruang kerja' },
]

const faqItems = [
  {
    question: 'Siapa yang bisa mendaftar lewat web ini?',
    answer: 'Web ini ditujukan untuk PT atau badan usaha yang ingin mengelola operasional merchant secara resmi. Pendaftaran usaha perorangan akan tersedia melalui aplikasi TEMBUS Merchant.',
  },
  {
    question: 'Dokumen apa yang perlu disiapkan?',
    answer: 'Siapkan data penanggung jawab, identitas badan usaha, dokumen legal yang diminta, data outlet, rekening pencairan, dan informasi menu atau katalog.',
  },
  {
    question: 'Apakah satu akun bisa mengelola beberapa outlet?',
    answer: 'Akun bisnis dapat menggunakan ruang kerja untuk mengelola cabang dan anggota tim sesuai akses yang diberikan oleh pemilik bisnis.',
  },
  {
    question: 'Bagaimana saya tahu status pendaftaran?',
    answer: 'Status pengajuan dapat dipantau dari halaman cek status. Jika ada data yang perlu diperbaiki, alasan dan langkah berikutnya akan ditampilkan di sana.',
  },
]

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-label="TEMBUS Merchant beranda">
      <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image" />
    </Link>
  )
}

function WorkspacePreview() {
  return (
    <div className="workspace-preview" aria-label="Pratinjau ruang kerja merchant TEMBUS">
      <div className="preview-topline">
        <span className="preview-kicker"><span className="status-dot" /> Ruang kerja merchant</span>
        <span className="preview-ghost">Pratinjau produk</span>
      </div>

      <div className="preview-heading">
        <div>
          <span className="preview-eyebrow">Selamat datang kembali</span>
          <h2>Operasional toko</h2>
        </div>
        <div className="preview-avatar">S</div>
      </div>

      <div className="preview-status-card">
        <div className="preview-status-icon"><Store size={18} /></div>
        <div>
          <strong>Toko sedang menerima pesanan</strong>
          <span>Status outlet tersinkron</span>
        </div>
        <span className="preview-toggle"><span /></span>
      </div>

      <div className="preview-grid">
        <div className="preview-panel preview-panel--orders">
          <div className="panel-label"><ClipboardList size={15} /> Pesanan</div>
          <strong>Perlu ditindaklanjuti</strong>
          <div className="preview-line"><span /><span /><span /></div>
          <small>Terima dan siapkan pesanan dari satu tempat</small>
        </div>
        <div className="preview-panel preview-panel--finance">
          <div className="panel-label"><WalletCards size={15} /> Keuangan</div>
          <strong>Pencairan tertata</strong>
          <small>Ringkasan transaksi dan pencairan</small>
          <div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>
      </div>

      <div className="preview-footer">
        <span><BarChart3 size={15} /> Wawasan toko</span>
        <span><UsersRound size={15} /> Tim dan akses</span>
        <span><ArrowRight size={15} /></span>
      </div>
    </div>
  )
}

function TrustLayer() {
  return (
    <section className="trust-layer section-wrap" aria-labelledby="trust-layer-heading">
      <div className="trust-layer__intro">
        <div>
          <p className="section-overline">Kepercayaan & transparansi</p>
          <h2 id="trust-layer-heading">Kenali siapa yang mengelola ruang kerja merchant Anda.</h2>
        </div>
        <p>Informasi yang penting untuk menilai layanan tersedia sebelum Anda mengirim pengajuan bisnis.</p>
      </div>

      <div className="trust-layer__grid">
        <article className="trust-card trust-card--identity">
          <div className="trust-card__icon"><Building2 size={21} /></div>
          <div>
            <p className="trust-card__label">Badan usaha penyelenggara</p>
            <h3>PT TEMBUS LINTAS TEKNOLOGI</h3>
            <p>Nama badan usaha yang digunakan pada kebijakan layanan TEMBUS.</p>
          </div>
          <a href={`${PUBLIC_INFORMATION_URL}/bantuan/syarat-dan-ketentuan`} target="_blank" rel="noreferrer" className="trust-card__link">
            Baca ketentuan layanan <ExternalLink size={14} />
          </a>
        </article>

        <article className="trust-card">
          <div className="trust-card__icon"><Mail size={21} /></div>
          <div>
            <p className="trust-card__label">Kontak dukungan merchant</p>
            <h3>support@tembus.id</h3>
            <p>Gunakan kanal ini untuk pertanyaan pendaftaran dan bantuan penggunaan layanan.</p>
          </div>
          <a href="mailto:support@tembus.id" className="trust-card__link">
            Hubungi dukungan <ArrowRight size={14} />
          </a>
        </article>

        <article className="trust-card trust-card--wide">
          <div className="trust-card__icon"><ShieldCheck size={21} /></div>
          <div className="trust-card__wide-copy">
            <p className="trust-card__label">Cara data usaha digunakan</p>
            <h3>Data usaha diperiksa sebelum toko menerima pesanan.</h3>
            <p>Informasi yang Anda kirim digunakan untuk memeriksa pengajuan, menyiapkan profil usaha, dan menjalankan kebutuhan merchant. Kami meminta data yang relevan pada tahap pendaftaran dan menjelaskan penggunaannya di kebijakan publik.</p>
            <div className="trust-card__links" aria-label="Informasi legal dan bantuan">
              {publicTrustLinks.map((item) => (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer">
                  {item.label} <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </div>
        </article>
      </div>

      {verifiedProofItems.length > 0 && (
        <div className="verified-proof" aria-label="Mitra dan testimonial terverifikasi">
          {verifiedProofItems.map((item) => <span key={`${item.kind}-${item.label}`}>{item.label}: {item.value}</span>)}
        </div>
      )}
    </section>
  )
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="landing-page">
      <header className="site-header">
        <div className="site-header__inner">
          <BrandMark />

          <nav className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Navigasi utama">
            <div className="site-nav__links">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>
              ))}
            </div>
            <div className="site-nav__actions">
              <Link to="/status" className="nav-status" onClick={closeMenu}>Cek status</Link>
              <Link to="/masuk" className="nav-login" onClick={closeMenu}>Masuk</Link>
              <Link to="/daftar" className="button button--small button--orange" onClick={closeMenu}>Daftar bisnis</Link>
            </div>
          </nav>

          <button
            type="button"
            className="menu-button"
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section" id="untuk-bisnis">
          <div className="hero-section__inner">
            <div className="hero-copy">
              <div className="eyebrow eyebrow--light"><span className="eyebrow-mark" /> Untuk bisnis dan badan usaha</div>
              <h1>Bisnis yang tertata membuat pelanggan lebih mudah datang kembali.</h1>
              <p className="hero-lead">Kelola pesanan food, menu, tim, outlet, dan pencairan dari ruang kerja merchant TEMBUS yang dibuat untuk operasional harian.</p>
              <div className="hero-actions">
                <Link to="/daftar" className="button button--orange button--large">Daftar sebagai perusahaan <ArrowRight size={18} /></Link>
                <a
                  href={MERCHANT_ANDROID_RELEASE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="button button--ghost-light button--large"
                >
                  Daftar perorangan lewat aplikasi <ExternalLink size={16} />
                </a>
              </div>
              <div className="hero-route-note" aria-label="Pilihan jalur pendaftaran">
                <span className="hero-route-note__item">
                  <Building2 size={16} />
                  <span><strong>PT atau badan usaha</strong><small>Isi pengajuan di web ini</small></span>
                </span>
                <span className="hero-route-note__item">
                  <Smartphone size={16} />
                  <span><strong>Usaha perorangan</strong><small>Gunakan aplikasi Merchant Android</small></span>
                </span>
              </div>
              <a href="#cara-bergabung" className="hero-how-link">Lihat cara bergabung <ArrowRight size={15} /></a>
              <div className="hero-quick-links" aria-label="Akses akun dan status pendaftaran">
                <Link to="/masuk">Sudah punya akun? Masuk</Link>
                <Link to="/status">Cek status pendaftaran</Link>
              </div>
              <div className="hero-note"><ShieldCheck size={16} /> Data usaha diperiksa melalui proses verifikasi sebelum toko menerima pesanan.</div>
            </div>

            <div className="hero-visual">
              <div className="visual-label">SATU RUANG KERJA, OPERASIONAL LEBIH JELAS</div>
              <WorkspacePreview />
              <div className="visual-rail visual-rail--top"><FileCheck2 size={16} /><span>Data bisnis<br /><strong>tersimpan rapi</strong></span></div>
              <div className="visual-rail visual-rail--bottom"><span className="rail-pulse" /><span>Outlet aktif<br /><strong>siap dikelola</strong></span></div>
            </div>
          </div>
          <div className="hero-baseline" aria-hidden="true"><span /> Dibangun untuk langkah bisnis yang nyata <span /></div>
        </section>

        <section className="trust-section" aria-label="Fokus TEMBUS untuk merchant">
          <div className="section-wrap trust-section__inner">
            <p className="section-overline">Dari pendaftaran sampai operasional</p>
            <p className="trust-statement">TEMBUS membantu tim merchant memahami apa yang perlu dilakukan, siapa yang mengerjakan, dan apa yang terjadi berikutnya.</p>
          </div>
        </section>

        <TrustLayer />

        <section className="capability-section section-wrap" id="ruang-kerja">
          <div className="section-intro">
            <div>
              <p className="section-overline">Ruang kerja merchant</p>
              <h2>Lebih dari sekadar menerima order.</h2>
            </div>
            <p>Setiap bagian penting dari toko punya tempat yang jelas. Tim dapat bekerja dengan konteks yang sama tanpa berpindah-pindah alat.</p>
          </div>

          <div className="capability-layout">
            <div className="capability-feature">
              <div className="feature-index">01</div>
              <div className="feature-icon"><ClipboardList size={22} /></div>
              <h3>Pesanan yang mudah ditindaklanjuti</h3>
              <p>Order baru, pesanan yang sedang disiapkan, dan pesanan selesai dibedakan dengan status yang mudah dipahami.</p>
              <Link to="/masuk" className="inline-link">Masuk ke ruang kerja <ArrowRight size={16} /></Link>
            </div>

            <div className="capability-list">
              <article className="capability-row">
                <div className="capability-row__number">02</div>
                <div className="capability-row__icon"><Store size={20} /></div>
                <div><h3>Menu dan ketersediaan</h3><p>Perbarui katalog, harga, kategori, foto, dan status tersedia sesuai kondisi toko.</p></div>
              </article>
              <article className="capability-row">
                <div className="capability-row__number">03</div>
                <div className="capability-row__icon"><UsersRound size={20} /></div>
                <div><h3>Tim dan peran kerja</h3><p>Bisnis dengan tim dapat mengatur akses berdasarkan pekerjaan dan outlet yang ditangani.</p></div>
              </article>
              <article className="capability-row">
                <div className="capability-row__number">04</div>
                <div className="capability-row__icon"><WalletCards size={20} /></div>
                <div><h3>Keuangan yang dapat ditelusuri</h3><p>Lihat transaksi, biaya, penyesuaian, dan status pencairan dengan istilah yang jelas.</p></div>
              </article>
            </div>
          </div>
        </section>

        <section className="business-section">
          <div className="section-wrap business-section__inner">
            <div className="business-copy">
              <p className="section-overline">Dibuat untuk bertumbuh dengan tertib</p>
              <h2>Bisnis kecil tetap terlihat serius. Bisnis besar tetap terasa terkendali.</h2>
              <p>Mulai dari satu outlet, lalu kembangkan cara kerja saat bisnis bertambah. Struktur akun, outlet, staf, dan pencairan mengikuti kebutuhan bisnis yang sebenarnya.</p>
              <div className="check-list">
                <span><Check size={16} /> Satu pemilik dengan kontrol yang jelas</span>
                <span><Check size={16} /> Tim bekerja sesuai peran</span>
                <span><Check size={16} /> Data outlet dan transaksi tetap terhubung</span>
              </div>
            </div>
            <div className="business-diagram" aria-label="Hubungan pemilik, tim, outlet, dan pelanggan">
              <div className="diagram-orbit diagram-orbit--outer" />
              <div className="diagram-orbit diagram-orbit--inner" />
              <div className="diagram-node diagram-node--owner"><span>P</span><strong>Pemilik</strong></div>
              <div className="diagram-node diagram-node--team"><UsersRound size={18} /><strong>Tim</strong></div>
              <div className="diagram-node diagram-node--outlet"><Store size={18} /><strong>Outlet</strong></div>
              <div className="diagram-node diagram-node--customer"><ClipboardList size={18} /><strong>Pesanan</strong></div>
              <div className="diagram-caption">Akses yang tepat<br /><strong>di setiap langkah</strong></div>
            </div>
          </div>
        </section>

        <section className="process-section section-wrap" id="cara-bergabung">
          <div className="section-intro section-intro--process">
            <div><p className="section-overline">Cara bergabung</p><h2>Jelas dari awal, tidak ada langkah yang disembunyikan.</h2></div>
            <p>Siapkan data bisnis, kirim pengajuan, lalu pantau prosesnya. Jika ada yang perlu diperbaiki, Anda akan melihat alasannya.</p>
          </div>
          <div className="process-track">
            <article className="process-step process-step--active"><span className="process-step__number">01</span><FileCheck2 size={22} /><h3>Isi data bisnis</h3><p>Informasi badan usaha, penanggung jawab, dan outlet.</p></article>
            <article className="process-step"><span className="process-step__number">02</span><ClipboardList size={22} /><h3>Lengkapi dokumen</h3><p>Dokumen legal dan informasi pencairan yang diminta.</p></article>
            <article className="process-step"><span className="process-step__number">03</span><ShieldCheck size={22} /><h3>Proses verifikasi</h3><p>Pengajuan diperiksa dan statusnya bisa dipantau.</p></article>
            <article className="process-step"><span className="process-step__number">04</span><Store size={22} /><h3>Siapkan toko</h3><p>Lengkapi profil, jam operasional, dan menu sebelum menerima order.</p></article>
          </div>
          <div className="process-cta"><Link to="/daftar" className="button button--green button--large">Mulai pendaftaran bisnis <ArrowRight size={18} /></Link></div>
        </section>

        <section className="requirements-section">
          <div className="section-wrap requirements-section__inner">
            <div className="requirements-card">
              <p className="section-overline">Sebelum mulai</p>
              <h2>Siapkan informasi yang membuat verifikasi berjalan lancar.</h2>
              <p>Dokumen dan informasi yang diminta dapat berbeda sesuai jenis usaha dan kebijakan wilayah. Kami akan menunjukkan daftar yang relevan di dalam proses pendaftaran.</p>
              <Link to="/daftar" className="inline-link inline-link--dark">Lihat kebutuhan pendaftaran <ArrowRight size={16} /></Link>
            </div>
            <div className="requirements-list">
              <div><span className="requirement-icon"><FileCheck2 size={18} /></span><span><strong>Identitas bisnis</strong><small>Nama legal, jenis usaha, dan dokumen pendukung</small></span></div>
              <div><span className="requirement-icon"><Store size={18} /></span><span><strong>Informasi outlet</strong><small>Alamat, lokasi, kontak, dan jam operasional</small></span></div>
              <div><span className="requirement-icon"><WalletCards size={18} /></span><span><strong>Rekening pencairan</strong><small>Data rekening atas nama yang sesuai</small></span></div>
              <div><span className="requirement-icon"><ClipboardList size={18} /></span><span><strong>Profil menu</strong><small>Produk, harga, kategori, dan ketersediaan</small></span></div>
            </div>
          </div>
        </section>

        <section className="faq-section section-wrap" id="bantuan">
          <div className="faq-heading"><p className="section-overline">Pertanyaan yang sering muncul</p><h2>Mulai dengan informasi yang Anda perlukan.</h2><CircleHelp size={30} /></div>
          <div className="faq-list">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index
              return (
                <div key={item.question} className={`faq-item${isOpen ? ' faq-item--open' : ''}`}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : index)}>
                    <span>{item.question}</span><ChevronDown size={20} />
                  </button>
                  {isOpen && <p>{item.answer}</p>}
                </div>
              )
            })}
          </div>
        </section>

        <section className="closing-section section-wrap">
          <div className="closing-section__inner">
            <div><p className="section-overline section-overline--light">Mulai dari langkah yang paling penting</p><h2>Bangun cara kerja merchant yang siap dipakai setiap hari.</h2></div>
            <div className="closing-actions"><Link to="/daftar" className="button button--orange button--large">Daftar bisnis TEMBUS <ArrowRight size={18} /></Link><Link to="/status" className="button button--ghost-light button--large">Cek status pendaftaran</Link></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div><BrandMark compact /><p>Ruang kerja untuk merchant food dan bisnis yang ingin beroperasi lebih tertata.</p></div>
          <div className="footer-links"><span className="footer-heading">Merchant</span><Link to="/daftar">Daftar bisnis</Link><Link to="/masuk">Masuk</Link><Link to="/status">Cek status</Link></div>
          <div className="footer-links"><span className="footer-heading">Informasi</span><a href="#untuk-bisnis">Untuk bisnis</a><a href="#cara-bergabung">Cara bergabung</a><a href="#bantuan">Bantuan</a><a href={publicTrustLinks[0].href} target="_blank" rel="noreferrer">Kebijakan Privasi</a></div>
        </div>
        <div className="site-footer__bottom"><span>© {new Date().getFullYear()} TEMBUS</span><span>Lebih Dekat, Lebih Cepat</span></div>
      </footer>
    </div>
  )
}
