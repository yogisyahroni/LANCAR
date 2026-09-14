#!/usr/bin/env python3
"""Fail closed when COMPLETE task evidence points at stub code.

This is a narrow no-fake-completeness gate. It rejects explicit implementation
placeholders in code files named by COMPLETE evidence without classifying every
valid early return or provider fallback as a stub.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


CODE_SUFFIXES = {".go", ".java", ".js", ".jsx", ".kt", ".py", ".ts", ".tsx"}
# Static release gates intentionally contain the strings they detect. They
# remain covered by their own executable tests and are not product stubs.
SCANNER_FILES = {"scripts/security/verify_platform_controls.py"}
PLACEHOLDER_PATTERNS = (
    (re.compile(r"TODO\s*:\s*implement", re.IGNORECASE), "explicit TODO implementation placeholder"),
    (re.compile(r"\bnot[_ -]implemented\b", re.IGNORECASE), "explicit not-implemented marker"),
    (re.compile(r"\breturn\s+fake\b", re.IGNORECASE), "fake return marker"),
    (re.compile(r"\bfake provider success\b", re.IGNORECASE), "fake provider-success marker"),
    (re.compile(r"panic\(\s*[\"']not implemented", re.IGNORECASE), "not-implemented panic"),
)


def frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return {}
    values: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        values[key.strip().lower()] = value.strip().strip("\"'")
    return values


def changed_paths(text: str) -> list[str]:
    section = text.split("## Files Changed", 1)
    if len(section) != 2:
        return []
    section = section[1].split("## ", 1)[0]
    paths: list[str] = []
    for line in section.splitlines():
        if not line.lstrip().startswith(("-", "*")):
            continue
        matches = re.findall(r"`([^`]+)`", line)
        if matches:
            paths.append(matches[0].strip())
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Check COMPLETE evidence implementation references.")
    parser.add_argument("--master", default="task-food-marketplace-parity-2026.md")
    parser.add_argument("--evidence-dir", default="docs/task-evidence")
    args = parser.parse_args()

    if not Path(args.master).is_file() or not Path(args.evidence_dir).is_dir():
        print("ERROR: master task file or evidence directory is missing", file=sys.stderr)
        return 2

    findings: list[str] = []
    checked_files = 0
    for evidence in sorted(Path(args.evidence_dir).glob("*.md")):
        if evidence.name in {"README.md", "TEMPLATE.md"}:
            continue
        text = evidence.read_text(encoding="utf-8")
        if frontmatter(text).get("status", "").upper() != "COMPLETE":
            continue
        for raw_path in changed_paths(text):
            if any(char in raw_path for char in "*[]{}"):
                continue
            path = Path(raw_path)
            if not path.is_file() or path.suffix.lower() not in CODE_SUFFIXES:
                continue
            if path.as_posix() in SCANNER_FILES:
                continue
            checked_files += 1
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except UnicodeDecodeError:
                continue
            for number, line in enumerate(lines, 1):
                for pattern, reason in PLACEHOLDER_PATTERNS:
                    if pattern.search(line):
                        findings.append(f"{evidence}:{raw_path}:{number} {reason}")

    if findings:
        print("No-fake completeness gate failed:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        return 1

    print(f"No-fake completeness gate passed ({checked_files} COMPLETE implementation files checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
