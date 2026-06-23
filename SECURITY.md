# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | ✅ Fully supported |
| 1.x     | ⚠️ Security fixes only |
| < 1.0   | ❌ No longer supported |

## Reporting a Vulnerability

### 🚨 Critical / High Severity

Jika Anda menemukan kerentanan **CRITICAL** atau **HIGH**:

1. **JANGAN** buka public issue
2. Kirim email ke: **security@yourcompany.com**
3. Enkripsi dengan PGP key (di bawah)
4. Sertakan:
   - Deskripsi kerentanan
   - Langkah reproduksi
   - Impact assessment
   - Saran fix (jika ada)

### 📝 Low / Medium Severity

Untuk severity **LOW** atau **MEDIUM**, buka issue dengan label `security`.

### Response SLA

| Severity | Acknowledgment | Fix Target |
|----------|---------------|------------|
| CRITICAL | 24 jam | 72 jam |
| HIGH | 48 jam | 7 hari |
| MEDIUM | 72 jam | 30 hari |
| LOW | 1 minggu | Next release |

## Security Measures

- Semua dependency dipindai otomatis via Dependabot + Trivy + Snyk
- Secret detection berjalan di setiap commit
- SAST scan (Semgrep + CodeQL) di setiap PR
- Container image di-scan sebelum deploy
- SBOM di-generate untuk setiap release

## PGP Key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[Your PGP public key here]
-----END PGP PUBLIC KEY BLOCK-----
```

## Bug Bounty

[Informasi bug bounty program jika ada]

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [SLSA Framework](https://slsa.dev/)
- [NIST SSDF 1.1](https://csrc.nist.gov/projects/ssdf)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
