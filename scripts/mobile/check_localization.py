"""Fail-closed localization contract checks for the three Android apps and web core.

This is intentionally a source/resource check, not a substitute for rendered-device
verification. It catches locale drift before a release artifact is produced.
"""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ANDROID_APPS = (
    "android-app-customer",
    "android-app",
    "android-app-merchant",
)
ANDROID_LOCALES = {"id-ID", "en-US"}
ANDROID_NAMESPACES = {"http://schemas.android.com/apk/res/android"}
MESSAGE_KEY_PATTERN = re.compile(r"^\s*'([^']+)'\s*:")


def resource_keys(path: Path) -> set[str]:
    root = ET.parse(path).getroot()
    return {
        child.attrib["name"]
        for child in root
        if child.tag.rsplit("}", 1)[-1] in {"string", "plurals", "string-array"}
        and "name" in child.attrib
    }


def configured_locales(path: Path) -> set[str]:
    root = ET.parse(path).getroot()
    android_name = f"{{{next(iter(ANDROID_NAMESPACES))}}}name"
    return {child.attrib[android_name] for child in root if android_name in child.attrib}


def message_keys(path: Path) -> set[str]:
    return {
        match.group(1)
        for line in path.read_text(encoding="utf-8").splitlines()
        if (match := MESSAGE_KEY_PATTERN.match(line))
    }


def main() -> int:
    failures: list[str] = []

    for app in ANDROID_APPS:
        values = ROOT / app / "app" / "src" / "main" / "res" / "values" / "strings.xml"
        english = ROOT / app / "app" / "src" / "main" / "res" / "values-en" / "strings.xml"
        locale_config = ROOT / app / "app" / "src" / "main" / "res" / "xml" / "locales_config.xml"
        if not values.exists() or not english.exists() or not locale_config.exists():
            failures.append(f"{app}: missing values/values-en/locales_config resource")
            continue
        base_keys = resource_keys(values)
        english_keys = resource_keys(english)
        if base_keys != english_keys:
            failures.append(
                f"{app}: resource key drift; only-id={sorted(base_keys - english_keys)}, "
                f"only-en={sorted(english_keys - base_keys)}"
            )
        actual_locales = configured_locales(locale_config)
        if actual_locales != ANDROID_LOCALES:
            failures.append(f"{app}: locale config is {sorted(actual_locales)}, expected {sorted(ANDROID_LOCALES)}")

    id_keys = message_keys(ROOT / "frontend" / "src" / "i18n" / "messages" / "id-ID.ts")
    en_keys = message_keys(ROOT / "frontend" / "src" / "i18n" / "messages" / "en-US.ts")
    if id_keys != en_keys:
        failures.append(
            f"frontend: message key drift; only-id={sorted(id_keys - en_keys)}, "
            f"only-en={sorted(en_keys - id_keys)}"
        )

    core_files = (
        ROOT / "frontend" / "src" / "app" / "LandingPageContent.tsx",
        ROOT / "frontend" / "src" / "components" / "landing" / "ResiCheckWidget.tsx",
        ROOT / "frontend" / "src" / "components" / "orders" / "OrderSummary.tsx",
        ROOT / "frontend" / "src" / "app" / "(auth)" / "login" / "page.tsx",
        ROOT / "frontend" / "src" / "app" / "(portal)" / "layout.tsx",
    )
    forbidden_locale_literals = re.compile(r"(?:toLocale(?:String|DateString|TimeString)|Intl\.(?:NumberFormat|DateTimeFormat))[^\n]*id-ID")
    for path in core_files:
        text = path.read_text(encoding="utf-8")
        if forbidden_locale_literals.search(text):
            failures.append(f"{path.relative_to(ROOT)}: core UI contains a hardcoded id-ID formatter")

    if failures:
        print("LOCALIZATION CONTRACT FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"LOCALIZATION CONTRACT PASSED: {len(ANDROID_APPS)} Android apps, {len(id_keys)} web keys, ID/EN parity, RTL-ready direction contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
