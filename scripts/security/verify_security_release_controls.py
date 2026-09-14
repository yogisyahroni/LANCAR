#!/usr/bin/env python3
"""Fail-closed repository checks for the PART AD security release gate.

This is deliberately a repository gate, not a replacement for provider,
managed-KMS, penetration-test, or incident-drill evidence. It proves that the
local source tree does not ship known fallback credentials and that the CI
security workflow has the required control wiring.
"""

from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]

REQUIRED_FILES = (
    ".gitleaks.toml",
    ".github/workflows/security-scan.yml",
    "docs/security/public-api-inventory.md",
    "docs/security/secret-management.md",
    "docs/security/vulnerability-management.md",
    "docs/security/release-gates.md",
    "docs/security/incident-response.md",
    "docs/security/data-governance.md",
    "docs/runbooks/security-incident.md",
    "docs/release/artifact-provenance.md",
)

THREAT_MODELS = (
    "docs/security/threat-model-order.md",
    "docs/security/threat-model-payment.md",
    "docs/security/threat-model-auth.md",
    "docs/security/threat-model-admin.md",
    "docs/security/threat-model-provider-webhooks.md",
)

SOURCE_ROOTS = (
    ROOT / "backend",
    ROOT / "admin-dashboard",
    ROOT / "frontend",
    ROOT / "android-app",
    ROOT / "android-app-customer",
    ROOT / "android-app-merchant",
)

FORBIDDEN_FALLBACKS = (
    "dev-internal-key-super-secret",
    "tembus_internal_key_secure",
)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def source_files() -> list[Path]:
    files: list[Path] = []
    for source_root in SOURCE_ROOTS:
        if source_root.is_dir():
            files.extend(
                path
                for path in source_root.rglob("*")
                if path.is_file()
                and "node_modules" not in path.parts
                and "build" not in path.parts
                and ".gradle" not in path.parts
                and ".git" not in path.parts
                and path.suffix.lower() in {".go", ".ts", ".tsx", ".kt", ".kts", ".java"}
            )
    return files


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            errors.append(f"missing required security artifact: {relative}")

    for path in source_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for marker in FORBIDDEN_FALLBACKS:
            if marker in text:
                errors.append(f"hardcoded internal credential fallback in {path.relative_to(ROOT)}")

    compose = read("docker-compose.yml")
    if not re.search(r"INTERNAL_API_KEY:\s*\$\{INTERNAL_API_KEY:\?", compose):
        errors.append("docker-compose must require INTERNAL_API_KEY from the deployment environment")
    if "INTERNAL_API_KEY:-tembus_internal_key_secure" in compose:
        errors.append("docker-compose contains the retired internal-key fallback")
    for line in compose.splitlines():
        if "image:" in line and ":latest" in line and "rediscommander" not in line:
            errors.append(f"mutable critical image tag in docker-compose: {line.strip()}")

    production_compose = read("docker-compose.prod.yml")
    for line in production_compose.splitlines():
        if "image:" in line and ":latest" in line:
            errors.append(f"mutable critical image tag in docker-compose.prod.yml: {line.strip()}")

    workflow = read(".github/workflows/security-scan.yml")
    for marker in (
        "gitleaks/gitleaks-action",
        "npm ci --prefix",
        "npm audit --prefix",
        "anchore/sbom-action",
        "aquasecurity/trivy-action",
        "python scripts/security/verify_platform_controls.py",
    ):
        if marker not in workflow:
            errors.append(f"security workflow missing control: {marker}")

    production_workflow = read(".github/workflows/production.yml")
    if re.search(r"ghcr\.io/[^\s]+:latest", production_workflow):
        errors.append("production workflow publishes a mutable latest image tag")
    for marker in (
        'export AUTH_SERVICE_IMAGE="ghcr.io/${REPO_LOWER_LC}/auth-service:${SHA}"',
        'export PAYMENT_SERVICE_IMAGE="ghcr.io/${REPO_LOWER_LC}/payment-service:${SHA}"',
        'export API_GATEWAY_IMAGE="ghcr.io/${REPO_LOWER_LC}/api-gateway:${SHA}"',
        'export ADMIN_DASHBOARD_IMAGE="ghcr.io/${REPO_LOWER_LC}/admin-dashboard:${SHA}"',
    ):
        if marker not in production_workflow:
            errors.append(f"production workflow missing immutable image mapping: {marker}")

    inventory = read("docs/security/public-api-inventory.md")
    for host in (
        "https://api.bawain.my.id",
        "https://app.bawain.my.id",
        "https://admin.bawain.my.id",
        "https://bawain.my.id/",
    ):
        if host not in inventory:
            errors.append(f"public API inventory missing canonical staging host: {host}")

    for relative in THREAT_MODELS:
        threat_model = read(relative)
        normalized = threat_model.casefold()
        for marker in ("risk", "control", "owner", "review record:", "high-risk remediation", "verified"):
            if marker.casefold() not in normalized:
                errors.append(f"{relative} missing threat-model evidence marker: {marker}")

    if errors:
        print("SECURITY RELEASE CONTROL GATE FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print("SECURITY RELEASE CONTROL GATE PASS: secret, CI, image and host-boundary controls verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
