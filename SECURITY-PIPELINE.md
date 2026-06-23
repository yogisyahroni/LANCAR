# 🛡️ Production-Grade Security Pipeline — CI/CD GitHub Actions

> **Dokumen lengkap untuk mendeteksi library kerentanan (SCA), secret leakage, SAST, container vulnerability, dan IaC misconfiguration dalam satu pipeline GitHub Actions.**

---

## 📋 Daftar Isi

1. [Prerequisites](#1-prerequisites)
2. [Dependabot Configuration](#2-dependabot-configuration)
3. [Security CI/CD Workflow](#3-security-cicd-workflow)
4. [Pre-Commit Hooks](#4-pre-commit-hooks)
5. [Security Policy](#5-security-policy)
6. [Dokumentasi & Troubleshooting](#6-dokumentasi--troubleshooting)
7. [Referensi & Compliance Mapping](#7-referensi--compliance-mapping)

---

## 1. Prerequisites

### 1.1 Secrets yang Harus Ditambahkan (GitHub → Settings → Secrets and variables → Actions)

| Secret Name | Value | Kegunaan |
|-------------|-------|----------|
| `SNYK_TOKEN` | Token dari [snyk.io](https://snyk.io) | SCA scanning via Snyk |
| `GITHUB_TOKEN` | Auto-generated oleh GitHub | Upload SARIF ke Security tab |
| `SLACK_WEBHOOK_URL` | (Opsional) Webhook Slack | Notifikasi alert critical |

### 1.2 Permissions yang Harus Diaktifkan (Repository Settings)

- **Settings → Security → Dependabot alerts** → ✅ Enable
- **Settings → Security → Dependabot security updates** → ✅ Enable
- **Settings → Security → Grouped security updates** → ✅ Enable
- **Settings → Actions → General → Workflow permissions** → `Read and write permissions`
- **Settings → Code security → Code scanning** → ✅ Enable (untuk SARIF upload)

### 1.3 Tools yang Digunakan

| Kategori | Tool | Tipe | Harga |
|----------|------|------|-------|
| SCA (Dependency) | Trivy | Open Source | Gratis |
| SCA (Validation) | Snyk | Freemium | 200 test/bulan gratis |
| SCA (Native) | npm audit / pip-audit | Built-in | Gratis |
| Secret Detection | GitLeaks | Open Source | Gratis |
| SAST | Semgrep | Open Source | Gratis (ruleset bawaan) |
| SAST (Opsional) | CodeQL | GitHub Native | Gratis (public repo) |
| Container Scan | Trivy Image | Open Source | Gratis |
| IaC Scan | Checkov | Open Source | Gratis |
| SBOM | Syft | Open Source | Gratis |

---

## 2. Dependabot Configuration

> **File:** `.github/dependabot.yml`
> 
> **Fungsi:** Memindai dependency secara otomatis dan membuat Pull Request untuk update security maupun version.

```yaml
# ============================================================
# DEPENDABOT CONFIGURATION
# ============================================================
# Dependabot memindai manifest file (package.json, requirements.txt, dll)
# dan memberi alert jika ada CVE. Jika security updates diaktifkan,
# Dependabot akan otomatis membuat PR dengan patch yang tersedia.
# ============================================================

version: 2

# -----------------------------------------------------------
# Update Registries (untuk private registry, uncomment jika perlu)
# -----------------------------------------------------------
# registries:
#   npm-github:
#     type: npm-registry
#     url: https://npm.pkg.github.com
#     token: ${{ secrets.GITHUB_TOKEN }}
#   maven-private:
#     type: maven-repository
#     url: https://maven.mycompany.com
#     username: ${{ secrets.MAVEN_USERNAME }}
#     password: ${{ secrets.MAVEN_PASSWORD }}

updates:
  # ==========================================================
  # NPM / Node.js
  # ==========================================================
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"          # Scan setiap hari untuk CVE
      time: "06:00"
      timezone: "Asia/Jakarta"

    # Grouping: satukan semua patch update ke 1 PR
    groups:
      security-updates:
        applies-to: "security-updates"
        patterns:
          - "*"
        update-types:
          - "patch"
          - "minor"

      version-updates:
        applies-to: "version-updates"
        patterns:
          - "*"
        update-types:
          - "patch"

    # Batasi jumlah PR terbuka
    open-pull-requests-limit: 10

    # Auto-assign reviewer dari CODEOWNERS
    reviewers:
      - "@your-team/security"

    # Label otomatis
    labels:
      - "security"
      - "dependencies"
      - "automated"

    # Prefix commit message
    commit-message:
      prefix: "deps"
      prefix-development: "deps(dev)"
      include: "scope"

    # Ignore package tertentu (contoh: jika breaking change diketahui)
    # ignore:
    #   - dependency-name: "express"
    #     versions: ["5.x"]

    # Target branch untuk PR
    target-branch: "main"

    # Vendor untuk Go modules (jika ada)
    # vendor: true

  # ==========================================================
  # Python / pip
  # ==========================================================
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "daily"
      time: "06:30"
      timezone: "Asia/Jakarta"
    groups:
      security-updates:
        applies-to: "security-updates"
        patterns:
          - "*"
    open-pull-requests-limit: 10
    reviewers:
      - "@your-team/security"
    labels:
      - "security"
      - "dependencies"
    commit-message:
      prefix: "deps"
      include: "scope"

  # ==========================================================
  # Java / Maven
  # ==========================================================
  - package-ecosystem: "maven"
    directory: "/"
    schedule:
      interval: "daily"
      time: "07:00"
      timezone: "Asia/Jakarta"
    groups:
      security-updates:
        applies-to: "security-updates"
        patterns:
          - "*"
    open-pull-requests-limit: 10
    reviewers:
      - "@your-team/security"
    labels:
      - "security"
      - "dependencies"
    commit-message:
      prefix: "deps"
      include: "scope"

  # ==========================================================
  # Go Modules
  # ==========================================================
  - package-ecosystem: "gomod"
    directory: "/"
    schedule:
      interval: "daily"
      time: "07:30"
      timezone: "Asia/Jakarta"
    groups:
      security-updates:
        applies-to: "security-updates"
        patterns:
          - "*"
    open-pull-requests-limit: 10
    reviewers:
      - "@your-team/security"
    labels:
      - "security"
      - "dependencies"
    commit-message:
      prefix: "deps"
      include: "scope"
    vendor: true

  # ==========================================================
  # Docker
  # ==========================================================
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "08:00"
      timezone: "Asia/Jakarta"
    open-pull-requests-limit: 5
    labels:
      - "docker"
      - "dependencies"
    commit-message:
      prefix: "deps(docker)"

  # ==========================================================
  # GitHub Actions
  # ==========================================================
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "08:30"
      timezone: "Asia/Jakarta"
    open-pull-requests-limit: 5
    labels:
      - "github-actions"
      - "dependencies"
    commit-message:
      prefix: "deps(ci)"
```

---

## 3. Security CI/CD Workflow

> **File:** `.github/workflows/security-scan.yml`
> 
> **Fungsi:** Pipeline lengkap yang berjalan di setiap push, PR, dan schedule mingguan untuk mendeteksi kerentanan di berbagai layer.

```yaml
# ============================================================
# SECURITY SCAN PIPELINE
# ============================================================
# Pipeline ini mendeteksi:
# 1. Dependency vulnerabilities (SCA) - Trivy, Snyk, npm audit
# 2. Secret leakage - GitLeaks
# 3. Insecure code patterns (SAST) - Semgrep, CodeQL
# 4. Container vulnerabilities - Trivy Image Scan
# 5. IaC misconfigurations - Checkov
# 6. SBOM generation - Syft
# ============================================================

name: 🔒 Security Scan Pipeline

# -----------------------------------------------------------
# TRIGGERS
# -----------------------------------------------------------
on:
  # Trigger setiap push ke branch utama
  push:
    branches:
      - main
      - develop
      - release/*
    paths-ignore:
      - "**.md"
      - "docs/**"

  # Trigger setiap Pull Request
  pull_request:
    branches:
      - main
      - develop
    paths-ignore:
      - "**.md"
      - "docs/**"

  # Schedule: scan mingguan (Senin 06:00 UTC)
  schedule:
    - cron: "0 6 * * 1"

  # Manual trigger
  workflow_dispatch:
    inputs:
      scan_type:
        description: "Tipe scan yang dijalankan"
        required: true
        default: "full"
        type: choice
        options:
          - full
          - sca-only
          - sast-only
          - secret-only

# -----------------------------------------------------------
# PERMISSIONS (Principle of Least Privilege)
# -----------------------------------------------------------
permissions:
  contents: read
  security-events: write    # Untuk upload SARIF
  actions: read
  checks: write
  pull-requests: write      # Untuk PR comment

# -----------------------------------------------------------
# ENVIRONMENT VARIABLES
# -----------------------------------------------------------
env:
  NODE_VERSION: "20"
  PYTHON_VERSION: "3.11"
  JAVA_VERSION: "21"
  TRIVY_SEVERITY: "HIGH,CRITICAL"
  SNYK_SEVERITY: "high"
  FAIL_ON_CRITICAL: "true"

# ============================================================
# JOBS
# ============================================================
jobs:

  # ==========================================================
  # JOB 1: DETECT CHANGES (Optimasi - hanya scan yang relevan)
  # ==========================================================
  detect-changes:
    name: 📁 Detect Changed Files
    runs-on: ubuntu-latest
    outputs:
      code: ${{ steps.changes.outputs.code }}
      deps: ${{ steps.changes.outputs.deps }}
      docker: ${{ steps.changes.outputs.docker }}
      iac: ${{ steps.changes.outputs.iac }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history untuk GitLeaks

      - name: Detect file changes
        id: changes
        uses: dorny/paths-filter@v3
        with:
          filters: |
            code:
              - 'src/**'
              - 'app/**'
              - 'lib/**'
              - '**.js'
              - '**.ts'
              - '**.py'
              - '**.java'
              - '**.go'
            deps:
              - 'package.json'
              - 'package-lock.json'
              - 'yarn.lock'
              - 'requirements.txt'
              - 'Pipfile.lock'
              - 'pom.xml'
              - 'build.gradle'
              - 'go.mod'
              - 'go.sum'
            docker:
              - 'Dockerfile'
              - 'docker-compose.yml'
              - '.dockerignore'
            iac:
              - '**.tf'
              - '**.tfvars'
              - 'cloudformation/**'
              - 'k8s/**'
              - 'helm/**'

  # ==========================================================
  # JOB 2: SCA - DEPENDENCY VULNERABILITY SCAN
  # ==========================================================
  sca-scan:
    name: 🔍 SCA Scan (Dependency Vulnerabilities)
    runs-on: ubuntu-latest
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.deps == 'true' || github.event_name == 'schedule' || github.event.inputs.scan_type == 'full' || github.event.inputs.scan_type == 'sca-only' }}

    steps:
      # -------------------------------------------------------
      # Setup
      # -------------------------------------------------------
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        if: ${{ hashFiles('package.json') != '' }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Setup Python
        if: ${{ hashFiles('requirements.txt') != '' || hashFiles('Pipfile') != '' }}
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Setup Java
        if: ${{ hashFiles('pom.xml') != '' || hashFiles('build.gradle') != '' }}
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: 'temurin'

      - name: Setup Go
        if: ${{ hashFiles('go.mod') != '' }}
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      # -------------------------------------------------------
      # Install dependencies
      # -------------------------------------------------------
      - name: Install npm dependencies
        if: ${{ hashFiles('package.json') != '' }}
        run: npm ci

      - name: Install Python dependencies
        if: ${{ hashFiles('requirements.txt') != '' }}
        run: pip install -r requirements.txt

      # -------------------------------------------------------
      # SCA Tool 1: Trivy Filesystem Scan
      # -------------------------------------------------------
      # Trivy memindai lockfiles dan manifest files untuk
      # mendeteksi CVE di dependency. Database di-cache untuk
      # mempercepat scan berikutnya.
      # -------------------------------------------------------
      - name: Cache Trivy DB
        uses: actions/cache@v4
        with:
          path: ~/.cache/trivy
          key: trivy-db-${{ runner.os }}-${{ github.run_id }}
          restore-keys: |
            trivy-db-${{ runner.os }}-

      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-fs-results.sarif'
          severity: ${{ env.TRIVY_SEVERITY }}
          exit-code: '0'  # Jangan fail dulu, kita evaluasi di summary
          ignore-unfixed: false

      - name: Run Trivy filesystem scan (JSON for detailed report)
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'json'
          output: 'trivy-fs-report.json'
          severity: ${{ env.TRIVY_SEVERITY }}
          exit-code: '0'

      # -------------------------------------------------------
      # SCA Tool 2: Snyk (Validasi tambahan)
      # -------------------------------------------------------
      # Snyk memberikan insight tambahan dan rekomendasi
      # remediation yang lebih detail dibanding Trivy.
      # -------------------------------------------------------
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: >
            --severity-threshold=${{ env.SNYK_SEVERITY }}
            --json-file-output=snyk-report.json
            --all-projects

      # -------------------------------------------------------
      # SCA Tool 3: Native Package Manager Audit (Baseline)
      # -------------------------------------------------------
      # Native audit sebagai baseline yang selalu tersedia
      # meski tools lain gagal.
      # -------------------------------------------------------
      - name: Run npm audit
        if: ${{ hashFiles('package.json') != '' }}
        run: |
          npm audit --audit-level=high --json > npm-audit-report.json || true
        continue-on-error: true

      - name: Run pip-audit
        if: ${{ hashFiles('requirements.txt') != '' }}
        run: |
          pip install pip-audit
          pip-audit --format=json --output=pip-audit-report.json || true
        continue-on-error: true

      # -------------------------------------------------------
      # Upload Reports
      # -------------------------------------------------------
      - name: Upload Trivy SARIF to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-fs-results.sarif'
          category: 'trivy-sca'

      - name: Upload Snyk report as artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: snyk-report
          path: snyk-report.json

      - name: Upload Trivy JSON report as artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: trivy-fs-report
          path: trivy-fs-report.json

      # -------------------------------------------------------
      # Evaluate & Fail on Critical
      # -------------------------------------------------------
      - name: Check for CRITICAL vulnerabilities
        run: |
          echo "=== EVALUASI HASIL SCAN ==="

          # Parse Trivy JSON untuk CRITICAL count
          CRITICAL_COUNT=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' trivy-fs-report.json 2>/dev/null || echo "0")
          HIGH_COUNT=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' trivy-fs-report.json 2>/dev/null || echo "0")

          echo "CRITICAL vulnerabilities: $CRITICAL_COUNT"
          echo "HIGH vulnerabilities: $HIGH_COUNT"

          # Set output untuk PR comment
          echo "CRITICAL_COUNT=$CRITICAL_COUNT" >> $GITHUB_ENV
          echo "HIGH_COUNT=$HIGH_COUNT" >> $GITHUB_ENV

          # Fail jika CRITICAL ditemukan dan FAIL_ON_CRITICAL=true
          if [ "$FAIL_ON_CRITICAL" = "true" ] && [ "$CRITICAL_COUNT" -gt 0 ]; then
            echo "❌ CRITICAL vulnerabilities detected. Blocking merge."
            exit 1
          fi

          echo "✅ SCA scan completed."

  # ==========================================================
  # JOB 3: SECRET DETECTION
  # ==========================================================
  secret-scan:
    name: 🔐 Secret Detection (GitLeaks)
    runs-on: ubuntu-latest
    needs: detect-changes
    if: ${{ github.event_name != 'pull_request' || needs.detect-changes.outputs.code == 'true' || github.event.inputs.scan_type == 'full' || github.event.inputs.scan_type == 'secret-only' }}

    steps:
      - name: Checkout repository (full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Diperlukan untuk scan seluruh git history

      # -------------------------------------------------------
      # GitLeaks: Scan seluruh history untuk secret
      # -------------------------------------------------------
      # GitLeaks mendeteksi: API keys, tokens, passwords,
      # private keys, AWS credentials, database URLs, dll.
      # -------------------------------------------------------
      - name: Run GitLeaks secret detection
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # Free for public repos
        with:
          config-path: .gitleaks.toml  # Custom config (opsional)

      # -------------------------------------------------------
      # Fallback: TruffleHog (jika GitLeaks tidak tersedia)
      # -------------------------------------------------------
      - name: Run TruffleHog (fallback)
        if: failure()
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --debug --only-verified

  # ==========================================================
  # JOB 4: SAST - STATIC ANALYSIS
  # ==========================================================
  sast-scan:
    name: 📝 SAST Scan (Static Analysis)
    runs-on: ubuntu-latest
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.code == 'true' || github.event_name == 'schedule' || github.event.inputs.scan_type == 'full' || github.event.inputs.scan_type == 'sast-only' }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # -------------------------------------------------------
      # SAST Tool 1: Semgrep (Open Source)
      # -------------------------------------------------------
      # Semgrep menggunakan ruleset OWASP, CWE, dan security audit.
      # Hasil dalam format SARIF untuk integrasi GitHub Security.
      # -------------------------------------------------------
      - name: Run Semgrep SAST
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten
            p/cwe-top-25
            p/security-audit
            p/correctness
          generateSarif: "1"
          sarifOutput: semgrep-results.sarif
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}  # Opsional untuk dashboard

      # -------------------------------------------------------
      # SAST Tool 2: CodeQL (GitHub Native)
      # -------------------------------------------------------
      # CodeQL mendukung: C/C++, C#, Go, Java, JavaScript/TypeScript,
      # Python, Ruby, Swift. Auto-detect bahasa dari repo.
      # -------------------------------------------------------
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript,python,java,go
          queries: security-extended,security-and-quality

      - name: Autobuild CodeQL
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:codeql"

      # -------------------------------------------------------
      # Upload Semgrep SARIF
      # -------------------------------------------------------
      - name: Upload Semgrep SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: semgrep-results.sarif
          category: 'semgrep-sast'

  # ==========================================================
  # JOB 5: CONTAINER SCAN
  # ==========================================================
  container-scan:
    name: 🐳 Container Image Scan
    runs-on: ubuntu-latest
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.docker == 'true' || github.event_name == 'schedule' || github.event.inputs.scan_type == 'full' }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # -------------------------------------------------------
      # Build image (tanpa push) untuk di-scan
      # -------------------------------------------------------
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image
        run: |
          docker build -t app-scan:${{ github.sha }} .

      # -------------------------------------------------------
      # Trivy Image Scan
      # -------------------------------------------------------
      # Scan image yang baru di-build untuk CVE di OS packages
      # dan application dependencies.
      # -------------------------------------------------------
      - name: Run Trivy image scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'app-scan:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-image-results.sarif'
          severity: ${{ env.TRIVY_SEVERITY }}
          exit-code: '0'

      - name: Run Trivy image scan (table format)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'app-scan:${{ github.sha }}'
          format: 'table'
          output: 'trivy-image-report.txt'
          severity: ${{ env.TRIVY_SEVERITY }}
          exit-code: '0'

      # -------------------------------------------------------
      # Container Best Practices Check
      # -------------------------------------------------------
      - name: Check container best practices
        run: |
          echo "=== Container Security Checks ==="

          # Check: tidak menggunakan USER root
          USER_CHECK=$(docker inspect app-scan:${{ github.sha }} --format='{{.Config.User}}')
          if [ -z "$USER_CHECK" ] || [ "$USER_CHECK" = "root" ] || [ "$USER_CHECK" = "0" ]; then
            echo "⚠️ WARNING: Container runs as root. Consider adding 'USER' directive."
          else
            echo "✅ Container runs as non-root user: $USER_CHECK"
          fi

          # Check: tidak menggunakan latest tag
          echo "Note: Image tag is ${{ github.sha }} (immutable) ✅"

      # -------------------------------------------------------
      # Upload Reports
      # -------------------------------------------------------
      - name: Upload Trivy image SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-image-results.sarif'
          category: 'trivy-image'

      - name: Upload image report as artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: trivy-image-report
          path: trivy-image-report.txt

  # ==========================================================
  # JOB 6: IaC MISCONFIGURATION SCAN
  # ==========================================================
  iac-scan:
    name: 🏗️ IaC Misconfiguration Scan
    runs-on: ubuntu-latest
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.iac == 'true' || github.event_name == 'schedule' || github.event.inputs.scan_type == 'full' }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # -------------------------------------------------------
      # Checkov: Scan Terraform, CloudFormation, K8s, Helm, ARM
      # -------------------------------------------------------
      # Checkov mendeteksi misconfigurasi berdasarkan:
      # - CIS Benchmarks
      # - NIST 800-53
      # - PCI-DSS
      # - SOC 2
      # - AWS/GCP/Azure best practices
      # -------------------------------------------------------
      - name: Run Checkov scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: .
          framework: terraform,cloudformation,kubernetes,helm,dockerfile
          output_format: sarif
          output_file_path: checkov-results.sarif
          soft_fail: true  # Jangan fail dulu, evaluasi di summary
          download_external_modules: true

      # -------------------------------------------------------
      # Trivy Config Scan (fallback/complement)
      # -------------------------------------------------------
      - name: Run Trivy config scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-config-results.sarif'
          severity: ${{ env.TRIVY_SEVERITY }}
          exit-code: '0'

      # -------------------------------------------------------
      # Upload Reports
      # -------------------------------------------------------
      - name: Upload Checkov SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: checkov-results.sarif
          category: 'checkov-iac'

      - name: Upload Trivy config SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-config-results.sarif'
          category: 'trivy-config'

  # ==========================================================
  # JOB 7: SBOM GENERATION
  # ==========================================================
  sbom-generate:
    name: 📦 SBOM Generation
    runs-on: ubuntu-latest
    needs: [sca-scan, container-scan]
    if: ${{ always() && (needs.sca-scan.result == 'success' || needs.container-scan.result == 'success') }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # -------------------------------------------------------
      # Syft: Generate SBOM dalam format CycloneDX dan SPDX
      # -------------------------------------------------------
      # SBOM (Software Bill of Materials) diperlukan untuk:
      # - Supply chain transparency
      # - Compliance (EO 14028, SLSA)
      # - Incident response (tau persis apa yang terdeploy)
      # -------------------------------------------------------
      - name: Generate SBOM with Syft
        uses: anchore/sbom-action@v0
        with:
          path: .
          format: cyclonedx-json
          output-file: sbom.cyclonedx.json

      - name: Generate SBOM SPDX
        uses: anchore/sbom-action@v0
        with:
          path: .
          format: spdx-json
          output-file: sbom.spdx.json

      # -------------------------------------------------------
      # Upload SBOM sebagai artifact dan release asset
      # -------------------------------------------------------
      - name: Upload SBOM artifacts
        uses: actions/upload-artifact@v4
        with:
          name: sbom-reports
          path: |
            sbom.cyclonedx.json
            sbom.spdx.json

      - name: Attach SBOM to release (if release event)
        if: github.event_name == 'release'
        uses: softprops/action-gh-release@v2
        with:
          files: |
            sbom.cyclonedx.json
            sbom.spdx.json

  # ==========================================================
  # JOB 8: SUMMARY & PR COMMENT
  # ==========================================================
  security-summary:
    name: 📊 Security Summary
    runs-on: ubuntu-latest
    needs: [sca-scan, secret-scan, sast-scan, container-scan, iac-scan]
    if: always()

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      # -------------------------------------------------------
      # Generate Summary Report
      # -------------------------------------------------------
      - name: Generate security summary
        run: |
          echo "# 🔒 Security Scan Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Job | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-----|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| SCA Scan | ${{ needs.sca-scan.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Secret Scan | ${{ needs.secret-scan.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| SAST Scan | ${{ needs.sast-scan.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Container Scan | ${{ needs.container-scan.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| IaC Scan | ${{ needs.iac-scan.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "## 📁 Artifacts" >> $GITHUB_STEP_SUMMARY
          echo "- Trivy FS Report: \"trivy-fs-report\"" >> $GITHUB_STEP_SUMMARY
          echo "- Snyk Report: \"snyk-report\"" >> $GITHUB_STEP_SUMMARY
          echo "- Trivy Image Report: \"trivy-image-report\"" >> $GITHUB_STEP_SUMMARY
          echo "- SBOM Reports: \"sbom-reports\"" >> $GITHUB_STEP_SUMMARY

      # -------------------------------------------------------
      # PR Comment (jika pull request)
      # -------------------------------------------------------
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const summary = `## 🔒 Security Scan Results

            | Check | Status |
            |-------|--------|
            | SCA (Dependency) | ${{ needs.sca-scan.result }} |
            | Secret Detection | ${{ needs.secret-scan.result }} |
            | SAST | ${{ needs.sast-scan.result }} |
            | Container | ${{ needs.container-scan.result }} |
            | IaC | ${{ needs.iac-scan.result }} |

            > 📎 Lihat detail di **GitHub Security tab** → **Code scanning**
            > 
            > 📦 SBOM tersedia di artifacts.
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: summary
            });

      # -------------------------------------------------------
      # Notifikasi Slack (Opsional - jika ada secret)
      # -------------------------------------------------------
      - name: Notify Slack on failure
        if: ${{ failure() && secrets.SLACK_WEBHOOK_URL != '' }}
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚨 Security scan FAILED on ${{ github.repository }}
Branch: ${{ github.ref }}
Commit: ${{ github.sha }}
Lihat: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ==========================================================
  # JOB 9: FINAL GATE (Block Merge if Critical)
  # ==========================================================
  security-gate:
    name: 🚦 Security Gate
    runs-on: ubuntu-latest
    needs: [sca-scan, secret-scan, sast-scan, container-scan]
    if: always()

    steps:
      - name: Evaluate security gate
        run: |
          echo "=== SECURITY GATE EVALUATION ==="

          SCA="${{ needs.sca-scan.result }}"
          SECRET="${{ needs.secret-scan.result }}"
          SAST="${{ needs.sast-scan.result }}"
          CONTAINER="${{ needs.container-scan.result }}"

          # Secret scan HARUS success (tidak boleh ada leak)
          if [ "$SECRET" != "success" ]; then
            echo "❌ FAIL: Secret scan detected leaked credentials."
            echo "   Perbaiki sebelum merge."
            exit 1
          fi

          # SCA scan HARUS success (tidak boleh ada CRITICAL)
          if [ "$SCA" != "success" ]; then
            echo "❌ FAIL: SCA scan detected CRITICAL vulnerabilities."
            echo "   Perbarui dependency atau apply patch."
            exit 1
          fi

          # SAST scan boleh warning tapi tidak error
          if [ "$SAST" = "failure" ]; then
            echo "⚠️ WARNING: SAST scan found issues. Review required."
            # Bisa diubah ke exit 1 jika ingin strict
          fi

          echo "✅ SECURITY GATE PASSED"
          echo "   - No leaked secrets"
          echo "   - No CRITICAL vulnerabilities"
          echo "   - Ready to merge"
```

---

## 4. Pre-Commit Hooks

> **File:** `.pre-commit-config.yaml`
> 
> **Fungsi:** Menangkap masalah security **sebelum** commit ke repository (fail-fast).

```yaml
# ============================================================
# PRE-COMMIT HOOKS
# ============================================================
# Pre-commit hooks berjalan di local machine developer
# sebelum code masuk ke repository. Ini adalah lapisan
# pertahanan pertama (shift-left security).
# ============================================================

# Install: pip install pre-commit
# Setup: pre-commit install
# Run manual: pre-commit run --all-files

repos:
  # ---------------------------------------------------------
  # General Hooks (GitHub official)
  # ---------------------------------------------------------
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ["--maxkb=1000"]
      - id: detect-private-key
      - id: check-merge-conflict

  # ---------------------------------------------------------
  # Secret Detection: GitLeaks
  # ---------------------------------------------------------
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.1
    hooks:
      - id: gitleaks
        args: ["--verbose", "--redact"]

  # ---------------------------------------------------------
  # Secret Detection: detect-secrets (Alternatif)
  # ---------------------------------------------------------
  # - repo: https://github.com/Yelp/detect-secrets
  #   rev: v1.4.0
  #   hooks:
  #     - id: detect-secrets
  #       args: ["--baseline", ".secrets.baseline"]

  # ---------------------------------------------------------
  # SAST: Semgrep (Local Scan)
  # ---------------------------------------------------------
  - repo: https://github.com/returntocorp/semgrep
    rev: v1.55.0
    hooks:
      - id: semgrep
        args: ["--config=auto", "--error", "--skip-unknown-extensions"]

  # ---------------------------------------------------------
  # Dependency Audit (Node.js)
  # ---------------------------------------------------------
  - repo: local
    hooks:
      - id: npm-audit
        name: npm audit
        entry: npm audit --audit-level=high
        language: system
        pass_filenames: false
        files: package\.json$

  # ---------------------------------------------------------
  # Dependency Audit (Python)
  # ---------------------------------------------------------
  # - repo: local
  #   hooks:
  #     - id: pip-audit
  #       name: pip-audit
  #       entry: pip-audit --desc
  #       language: system
  #       pass_filenames: false
  #       files: requirements.*\.txt$

  # ---------------------------------------------------------
  # Linting dengan Security Rules
  # ---------------------------------------------------------
  # Node.js: ESLint dengan plugin security
  # - repo: https://github.com/pre-commit/mirrors-eslint
  #   rev: v9.0.0
  #   hooks:
  #     - id: eslint
  #       additional_dependencies:
  #         - eslint-plugin-security

  # Python: Bandit (security linter)
  # - repo: https://github.com/PyCQA/bandit
  #   rev: 1.7.6
  #   hooks:
  #     - id: bandit
  #       args: ["-c", "pyproject.toml"]
  #       additional_dependencies: ["bandit[toml]"]

  # ---------------------------------------------------------
  # Commit Message Validation
  # ---------------------------------------------------------
  - repo: https://github.com/commitizen-tools/commitizen
    rev: v3.13.0
    hooks:
      - id: commitizen
        stages: [commit-msg]
```

### Alternatif: Husky (Node.js Projects)

> **File:** `.husky/pre-commit`

```bash
#!/bin/sh
# ============================================================
# HUSKY PRE-COMMIT HOOK
# Untuk project Node.js yang menggunakan Husky
# ============================================================

. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit security checks..."

# 1. Secret detection dengan GitLeaks
echo "  → Checking for secrets..."
npx gitleaks detect --source . --verbose --redact || {
  echo "❌ Secret detected! Remove before committing."
  exit 1
}

# 2. npm audit (fail on high)
echo "  → Running npm audit..."
npm audit --audit-level=high || {
  echo "❌ High severity vulnerabilities found."
  exit 1
}

# 3. ESLint dengan security plugin
echo "  → Running ESLint..."
npx eslint . --ext .js,.ts || {
  echo "❌ Linting errors found."
  exit 1
}

# 4. Run tests (opsional, untuk fail-fast)
# echo "  → Running tests..."
# npm test || exit 1

echo "✅ Pre-commit checks passed!"
```

---

## 5. Security Policy

> **File:** `SECURITY.md`

```markdown
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
```

---

## 6. Dokumentasi & Troubleshooting

### 6.1 Cara Menambahkan Secrets

```bash
# Via GitHub CLI
gh secret set SNYK_TOKEN --body "your-snyk-token"
gh secret set SLACK_WEBHOOK_URL --body "your-webhook-url"

# Via GitHub Web UI
# Settings → Secrets and variables → Actions → New repository secret
```

### 6.2 Cara Menjalankan Scan Secara Lokal

```bash
# --- Trivy (SCA + Container) ---
# Install: https://trivy.dev/latest/getting-started/installation/
trivy fs . --severity HIGH,CRITICAL
trivy image your-image:tag --severity HIGH,CRITICAL
trivy config . --severity HIGH,CRITICAL

# --- Snyk (SCA) ---
# Install: npm install -g snyk
snyk auth          # Login
snyk test          # Scan dependencies
snyk monitor       # Continuous monitoring

# --- GitLeaks (Secret Detection) ---
# Install: https://github.com/gitleaks/gitleaks
gitleaks detect --source . --verbose

# --- Semgrep (SAST) ---
# Install: pip install semgrep
semgrep --config=auto --error .

# --- Checkov (IaC) ---
# Install: pip install checkov
checkov -d . --framework terraform,cloudformation,kubernetes

# --- Syft (SBOM) ---
# Install: https://github.com/anchore/syft
syft . -o cyclonedx-json > sbom.json
```

### 6.3 Troubleshooting

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `Trivy DB download failed` | Rate limit / network | Tambahkan cache step atau gunakan mirror |
| `Snyk: auth failed` | Token invalid / expired | Regenerate token di snyk.io |
| `Semgrep: no rules` | Config salah | Gunakan `--config=auto` atau pilih ruleset |
| `GitLeaks: license required` | Private repo tanpa license | Daftar free tier di gitleaks.io atau gunakan TruffleHog |
| `SARIF upload failed` | Permission kurang | Aktifkan `security-events: write` |
| `npm audit: ENOENT` | `node_modules` tidak ada | Jalankan `npm ci` sebelum audit |
| `Pipeline terlalu lambat` | Scan berulang | Gunakan `detect-changes` job untuk skip scan yang tidak relevan |

### 6.4 Cara Menekan False Positive

```yaml
# Trivy: .trivyignore
# CVE-2023-XXXX # False positive: karena [alasan]
# CVE-2023-YYYY # Accepted risk: internal-only service

# Semgrep: .semgrepignore atau inline comment
# nosemgrep: rule-id # [justifikasi]

# Checkov: skip check via comment
# checkov:skip=CKV_AWS_20: [justifikasi]

# Snyk: .snyk policy file
# version: v1.25.0
# ignore:
#   SNYK-JS-XXXX-YYYY:
#     - '*':
#         reason: 'False positive - [penjelasan]'
#         expires: '2024-12-31T00:00:00.000Z'
```

---

## 7. Referensi & Compliance Mapping

### 7.1 OWASP Mapping

| OWASP Category | Tool / Control |
|----------------|----------------|
| A01: Broken Access Control | Semgrep (ruleset), CodeQL |
| A02: Cryptographic Failures | GitLeaks (key detection), Semgrep |
| A03: Injection | Semgrep, CodeQL |
| A05: Security Misconfiguration | Checkov, Trivy config |
| A06: Vulnerable Components | Trivy, Snyk, Dependabot |
| A07: Auth Failures | Semgrep, CodeQL |
| A09: Logging Failures | Semgrep |
| A10: SSRF | Semgrep, CodeQL |

### 7.2 NIST CSF Mapping

| Function | Implementasi |
|----------|-------------|
| Identify | SBOM generation, asset inventory |
| Protect | Pre-commit hooks, secret scanning |
| Detect | Trivy, Snyk, Semgrep, GitLeaks |
| Respond | Automated PR patching (Dependabot) |
| Recover | Rollback via tagged releases |

### 7.3 SLSA Compliance Level

| Level | Requirement | Status |
|-------|-------------|--------|
| L1 | SBOM + scripted build | ✅ |
| L2 | Signed build + version control | ⚠️ (Tambahkan Sigstore/cosign) |
| L3 | Hardened build + reproducible | ⚠️ (Tambahkan hermetic build) |

### 7.4 Referensi

- [OWASP CI/CD Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [SLSA Specification](https://slsa.dev/spec/v1.0/)
- [NIST SSDF 1.1](https://csrc.nist.gov/projects/ssdf)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

---

> **Catatan:** Dokumen ini dirancang untuk **shift-left security** — mendeteksi masalah sejak dini (pre-commit) hingga pre-deployment (CI/CD gate). Sesuaikan severity threshold dan fail conditions dengan risk appetite tim Anda.
