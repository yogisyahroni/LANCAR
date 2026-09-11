"""Deterministic, device-independent accessibility guard for the Compose apps.

This check intentionally covers only properties that are provable from source:
semantic content descriptions, minimum interactive sizing policy, text units,
and the design-system foreground/background contrast pairs. Runtime TalkBack,
font rendering, and OEM fold posture still require instrumentation evidence.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UI_ROOTS = [
    ROOT / "android-app-customer/app/src/main/java/com/tembus/customer/ui",
    ROOT / "android-app-merchant/app/src/main/java/com/tembus/merchant/ui",
]
THEMES = [
    ROOT / "android-app-customer/app/src/main/java/com/tembus/customer/ui/theme",
    ROOT / "android-app-merchant/app/src/main/java/com/tembus/merchant/ui/theme",
    ROOT / "android-app/app/src/main/java/com/tembus/courier/ui/theme",
]


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def channel(value: int) -> float:
    value /= 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def contrast(foreground: int, background: int) -> float:
    def luminance(color: int) -> float:
        red = channel((color >> 16) & 0xFF)
        green = channel((color >> 8) & 0xFF)
        blue = channel(color & 0xFF)
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue

    light = max(luminance(foreground), luminance(background))
    dark = min(luminance(foreground), luminance(background))
    return (light + 0.05) / (dark + 0.05)


def parse_colors(path: Path) -> dict[str, int]:
    values: dict[str, int] = {}
    pattern = re.compile(r"^val\s+(\w+)\s*=\s*Color\(0x([0-9A-Fa-f]{8})\)")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line.strip())
        if match:
            values[match.group(1)] = int(match.group(2)[2:], 16)
    return values


def main() -> int:
    failures: list[str] = []

    ui_files = [path for root in UI_ROOTS for path in root.rglob("*.kt")]
    null_descriptions = [
        relative(path)
        for path in ui_files
        if re.search(r"contentDescription\s*=\s*null", path.read_text(encoding="utf-8"))
    ]
    if null_descriptions:
        failures.append("contentDescription=null remains: " + ", ".join(null_descriptions))

    low_icon_buttons: list[str] = []
    low_size_pattern = re.compile(
        r"(?:IconButton|FilledIconButton|FloatingActionButton)\((?:(?!\bIcon\().){0,500}?"
        r"modifier\s*=\s*Modifier(?:(?!\bIcon\().){0,250}?\.size\("
        r"(?:[0-9]|[1-3][0-9]|4[0-7])\.dp\)",
        re.DOTALL,
    )
    for path in ui_files:
        source = path.read_text(encoding="utf-8")
        if low_size_pattern.search(source):
            low_icon_buttons.append(relative(path))
    if low_icon_buttons:
        failures.append("interactive icon control has explicit size below 48dp: " + ", ".join(low_icon_buttons))

    for theme in THEMES:
        source = (theme / "TembusDesign.kt").read_text(encoding="utf-8")
        if "val MinTouchTarget = 48.dp" not in source:
            failures.append(f"minimum touch target policy missing in {relative(theme / 'TembusDesign.kt')}")
        for match in re.finditer(r"fontSize\s*=\s*[^,\n]+\.dp", source):
            failures.append(f"font size uses dp in {relative(theme / 'TembusDesign.kt')}: {match.group(0)}")

    for ui_file in ui_files:
        source = ui_file.read_text(encoding="utf-8")
        if re.search(r"fontSize\s*=\s*[^,\n]+\.dp", source):
            failures.append(f"font size uses dp in {relative(ui_file)}")

    for root in [ROOT / "android-app-customer/app/src/main/java/com/tembus/customer/ui/theme",
                 ROOT / "android-app-merchant/app/src/main/java/com/tembus/merchant/ui/theme"]:
        colors = parse_colors(root / "Color.kt")
        pairs = [
            ("OnSurface", "Surface", 4.5),
            ("OnSurfaceVariant", "Surface", 4.5),
            ("OnPrimary", "Primary", 4.5),
            ("DarkOnSurface", "DarkSurface", 4.5),
            ("DarkOnSurfaceVariant", "DarkSurface", 4.5),
            ("DarkOnPrimary", "DarkPrimary", 4.5),
        ]
        for foreground, background, minimum in pairs:
            if foreground not in colors or background not in colors:
                failures.append(f"contrast palette pair missing in {relative(root / 'Color.kt')}: {foreground}/{background}")
                continue
            ratio = contrast(colors[foreground], colors[background])
            if ratio < minimum:
                failures.append(f"contrast {foreground}/{background} = {ratio:.2f}:1 < {minimum:.1f}:1")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("PASS")
    print(f"- scanned {len(ui_files)} Compose UI Kotlin files")
    print("- no null content descriptions")
    print("- no explicit interactive icon size below 48dp")
    print("- all text sizes use scalable sp/default typography")
    print("- design-system contrast pairs meet WCAG AA thresholds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
