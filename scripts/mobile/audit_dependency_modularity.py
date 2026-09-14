#!/usr/bin/env python3
"""Audit direct Android dependency hygiene and optional-feature delivery decisions.

This is a source-level release check. It catches duplicate literal coordinates,
known unused direct image/serialization dependencies, verifies bundle splits,
and makes the optional SDK decision explicit. Gradle's resolved dependency
graph remains the authoritative check for transitive version convergence.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]
MODULES = {
    "customer": "android-app-customer",
    "courier": "android-app",
    "merchant": "android-app-merchant",
}
DEPENDENCY_RE = re.compile(
    r"^\s*(?:implementation|api|compileOnly|runtimeOnly|debugImplementation|"
    r"releaseImplementation|testImplementation|androidTestImplementation|ksp)"
    r"\(\s*(?:platform\()?\"([^\"]+)\""
)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def direct_dependencies(source: str) -> list[str]:
    return [match.group(1) for line in source.splitlines() if (match := DEPENDENCY_RE.match(line))]


def main() -> int:
    errors: list[str] = []
    rows: list[tuple[str, int, str]] = []

    for app, module in MODULES.items():
        gradle_path = f"{module}/app/build.gradle.kts"
        source_path = f"{module}/app/src/main"
        try:
            gradle = read(gradle_path)
        except OSError as error:
            errors.append(f"{gradle_path}: {error}")
            continue

        dependencies = direct_dependencies(gradle)
        duplicates = sorted(coordinate for coordinate, count in Counter(dependencies).items() if count > 1)
        if duplicates:
            errors.append(f"{app}: duplicate direct coordinates: {', '.join(duplicates)}")

        for marker in ("bundle {", "language { enableSplit = true }", "density { enableSplit = true }", "abi { enableSplit = true }"):
            if marker not in gradle:
                errors.append(f"{app}: missing bundle split marker {marker!r}")

        if app == "customer":
            if "com.squareup.retrofit2:converter-gson:" in gradle:
                errors.append("customer: converter-gson remains although Retrofit uses kotlinx serialization")
            if "io.coil-kt:coil-gif:" in gradle:
                errors.append("customer: coil-gif remains without a GIF decoder/asset use")

        source_files = list((ROOT / source_path).rglob("*.kt"))
        source_text = "\n".join(path.read_text(encoding="utf-8") for path in source_files)
        sdk_checks = {
            "customer": (
                ("TomTom map", "com.tomtom.sdk.maps:map-display:", "TomTomSdkMapRenderer"),
                ("WebRTC", "io.getstream:stream-webrtc-android:", "RtcAudioClient"),
            ),
            "courier": (
                ("TomTom map", "com.tomtom.sdk.maps:map-display:", "TomTomSdkMapRenderer"),
                ("WebRTC", "io.getstream:stream-webrtc-android:", "RtcAudioClient"),
                ("CameraX", "androidx.camera:camera-core:", "ImageCapture"),
                ("ML Kit", "com.google.mlkit:face-detection:", "FaceAnalyzer"),
            ),
            "merchant": (("OSMDroid", "org.osmdroid:osmdroid-android:", "MapView"),),
        }
        for feature, dependency, source_marker in sdk_checks[app]:
            if dependency not in gradle:
                errors.append(f"{app}: optional SDK dependency missing for evaluated feature {feature}")
            if source_marker not in source_text:
                errors.append(f"{app}: optional SDK source marker missing for evaluated feature {feature}")

        rows.append((app, len(dependencies), ", ".join(feature for feature, *_ in sdk_checks[app])))

    if errors:
        print("MOBILE DEPENDENCY/MODULARITY AUDIT FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print("MOBILE DEPENDENCY/MODULARITY AUDIT PASS")
    print("- duplicate literal direct coordinates: none")
    print("- customer unused direct converter/GIF dependencies: removed")
    print("- bundle language/density/ABI splits: enabled for customer/courier/merchant")
    for app, count, features in rows:
        print(f"- {app}: {count} direct declarations; evaluated SDKs: {features}")
    print(
        "- delivery decision: keep evaluated SDKs in the base modules for now; "
        "they are coupled to booking, active-order, POD, map or communication "
        "flows, while bundle splits reduce independent language/density/ABI payload."
    )
    print(
        "LIMITATION: this check does not replace Gradle resolved-graph convergence, "
        "CI release artifact trend, or store dynamic-feature validation."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
