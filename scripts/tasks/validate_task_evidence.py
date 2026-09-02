#!/usr/bin/env python3
"""
Validate LANCAR master-task evidence.

Rules:
1. Any TASK-ID section with at least one checked box must have
   docs/task-evidence/<TASK-ID>.md.
2. PARTIAL evidence must explicitly retain locally actionable work; it is
   never a valid stopping state.
3. BLOCKED evidence must have no locally actionable work plus an exact blocker
   and unblock condition.
4. A fully checked task must have COMPLETE evidence and pass
   REALITY-2026-003 + REALITY-2026-011.
5. COMPLETE evidence cannot contain unproven requirements/blockers and
   every applicability field must be PASS or justified N/A.

This intentionally validates evidence integrity, not business correctness.
Actual test results must still be reviewed by humans/agents.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

DEFAULT_MASTER = "task-food-marketplace-parity-2026.md"
DEFAULT_EVIDENCE_DIR = "docs/task-evidence"

TASK_HEADING_RE = re.compile(r"^##\s+([A-Z][A-Z0-9]*-\d{4}-\d{3})\b")
CHECKBOX_RE = re.compile(r"^\s*-\s+\[([ xX])\]\s+")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

ALLOWED_STATUS = {"PARTIAL", "BLOCKED", "COMPLETE"}
ALLOWED_GATE = {"PASS", "PARTIAL", "FAIL", "NOT_RUN", "N/A"}
APPLICABILITY_FIELDS = (
    "tests",
    "e2e",
    "migration",
    "observability",
    "security_privacy",
    "rollback_recovery",
)
REQUIRED_FRONTMATTER = (
    "task_id",
    "status",
    "reality_2026_003",
    "reality_2026_011",
    "implementation_ref",
    *APPLICABILITY_FIELDS,
    "unproven_requirements",
    "known_blockers",
    "locally_actionable_remaining",
    "unblock_condition",
    "dependency_chain_blocked",
    "next_eligible_task",
    "updated_at",
)
REQUIRED_BODY_HEADINGS = (
    "## Scope Implemented",
    "## Files Changed",
    "## Commands / Checks Run",
    "## Reality Gate Evaluation",
    "## Unproven / Remaining",
)

EMPTY_SENTINELS = {"", "NONE", "N/A", "NOT_RUN", "TODO", "TBD", "-"}


@dataclass
class TaskProgress:
    task_id: str
    total_boxes: int = 0
    checked_boxes: int = 0

    @property
    def touched(self) -> bool:
        return self.checked_boxes > 0

    @property
    def complete_in_master(self) -> bool:
        return self.total_boxes > 0 and self.checked_boxes == self.total_boxes


def parse_master(path: Path) -> Dict[str, TaskProgress]:
    tasks: Dict[str, TaskProgress] = {}
    current: TaskProgress | None = None

    for line in path.read_text(encoding="utf-8").splitlines():
        heading = TASK_HEADING_RE.match(line)
        if heading:
            task_id = heading.group(1)
            if task_id in tasks:
                raise ValueError(f"Duplicate task heading detected: {task_id}")
            current = TaskProgress(task_id=task_id)
            tasks[task_id] = current
            continue

        # A new Part/section at H1/H2 scope ends the previous TASK-ID section.
        # H3+ headings remain part of the current task.
        if line.startswith("# ") or line.startswith("## "):
            current = None
            continue

        if current is None:
            continue

        box = CHECKBOX_RE.match(line)
        if box:
            current.total_boxes += 1
            if box.group(1).lower() == "x":
                current.checked_boxes += 1

    return tasks


def strip_optional_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1].strip()
    return value


def parse_frontmatter(path: Path) -> Tuple[Dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    if not lines or lines[0].strip() != "---":
        raise ValueError("Evidence file must begin with YAML-like frontmatter delimiter '---'.")

    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        raise ValueError("Evidence frontmatter is missing its closing '---' delimiter.")

    data: Dict[str, str] = {}
    for line in lines[1:end]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"Invalid frontmatter line: {line!r}")
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = strip_optional_quotes(value)
        if not key:
            raise ValueError(f"Invalid empty frontmatter key in line: {line!r}")
        data[key] = value

    body = "\n".join(lines[end + 1 :])
    return data, body


def normalized(value: str) -> str:
    return value.strip().upper()


def has_meaningful_value(value: str) -> bool:
    return normalized(value) not in EMPTY_SENTINELS


def validate_evidence(
    task: TaskProgress, evidence_path: Path, errors: List[str], warnings: List[str]
) -> None:
    try:
        meta, body = parse_frontmatter(evidence_path)
    except Exception as exc:
        errors.append(f"{task.task_id}: cannot parse {evidence_path}: {exc}")
        return

    missing = [key for key in REQUIRED_FRONTMATTER if key not in meta]
    if missing:
        errors.append(
            f"{task.task_id}: evidence missing frontmatter field(s): {', '.join(missing)}"
        )
        return

    if meta["task_id"].strip() != task.task_id:
        errors.append(
            f"{task.task_id}: evidence task_id is {meta['task_id']!r}, expected {task.task_id!r}"
        )

    status = normalized(meta["status"])
    if status not in ALLOWED_STATUS:
        errors.append(
            f"{task.task_id}: invalid status {meta['status']!r}; "
            f"expected one of {sorted(ALLOWED_STATUS)}"
        )

    for field in ("reality_2026_003", "reality_2026_011", *APPLICABILITY_FIELDS):
        value = normalized(meta[field])
        if value not in ALLOWED_GATE:
            errors.append(
                f"{task.task_id}: invalid {field}={meta[field]!r}; "
                f"expected one of {sorted(ALLOWED_GATE)}"
            )

    if not DATE_RE.match(meta["updated_at"].strip()):
        errors.append(
            f"{task.task_id}: updated_at must be YYYY-MM-DD, got {meta['updated_at']!r}"
        )

    dependency_chain_blocked = normalized(meta["dependency_chain_blocked"])
    if dependency_chain_blocked not in {"TRUE", "FALSE"}:
        errors.append(
            f"{task.task_id}: dependency_chain_blocked must be true or false, "
            f"got {meta['dependency_chain_blocked']!r}"
        )

    for heading in REQUIRED_BODY_HEADINGS:
        if heading not in body:
            errors.append(f"{task.task_id}: evidence body missing heading {heading!r}")

    if status == "COMPLETE" and not task.complete_in_master:
        errors.append(
            f"{task.task_id}: evidence says COMPLETE but master task still has "
            f"{task.checked_boxes}/{task.total_boxes} checkbox(es) checked"
        )

    if task.complete_in_master and status != "COMPLETE":
        errors.append(
            f"{task.task_id}: master task is fully checked but evidence status is {status!r}, "
            "expected COMPLETE"
        )

    local_remaining = meta["locally_actionable_remaining"].strip()
    unblock_condition = meta["unblock_condition"].strip()
    known_blockers = meta["known_blockers"].strip()
    unproven = meta["unproven_requirements"].strip()

    if status == "PARTIAL":
        if not has_meaningful_value(local_remaining):
            errors.append(
                f"{task.task_id}: PARTIAL requires locally_actionable_remaining "
                "to describe remaining local work; use BLOCKED only when it is NONE"
            )
        if not has_meaningful_value(unblock_condition):
            errors.append(
                f"{task.task_id}: PARTIAL requires an explicit unblock_condition "
                "(use a truthful local completion condition when no external blocker exists)"
            )
        if normalized(meta["next_eligible_task"]) not in {"NONE", "N/A"}:
            warnings.append(
                f"{task.task_id}: next_eligible_task is advisory while status is PARTIAL"
            )

    if status == "BLOCKED":
        if normalized(local_remaining) != "NONE":
            errors.append(
                f"{task.task_id}: BLOCKED requires locally_actionable_remaining: NONE"
            )
        if not has_meaningful_value(known_blockers):
            errors.append(
                f"{task.task_id}: BLOCKED requires an exact known_blockers value"
            )
        if not has_meaningful_value(unblock_condition):
            errors.append(
                f"{task.task_id}: BLOCKED requires an exact unblock_condition"
            )
        if not has_meaningful_value(unproven):
            errors.append(
                f"{task.task_id}: BLOCKED requires unproven_requirements to name remaining proof"
            )

    if status != "COMPLETE":
        return

    if normalized(meta["reality_2026_003"]) != "PASS":
        errors.append(
            f"{task.task_id}: COMPLETE requires reality_2026_003: PASS"
        )
    if normalized(meta["reality_2026_011"]) != "PASS":
        errors.append(
            f"{task.task_id}: COMPLETE requires reality_2026_011: PASS"
        )
    if not has_meaningful_value(meta["implementation_ref"]):
        errors.append(
            f"{task.task_id}: COMPLETE requires a real implementation_ref "
            "(commit/PR/change reference), not blank/NONE/N/A/TODO"
        )

    for field in APPLICABILITY_FIELDS:
        value = normalized(meta[field])
        if value not in {"PASS", "N/A"}:
            errors.append(
                f"{task.task_id}: COMPLETE requires {field}: PASS or justified N/A, got {value!r}"
            )
        if value == "N/A":
            reason_key = f"{field}_na_reason"
            reason = meta.get(reason_key, "")
            if not has_meaningful_value(reason):
                errors.append(
                    f"{task.task_id}: {field}: N/A requires non-empty {reason_key}"
                )

    if normalized(meta["unproven_requirements"]) != "NONE":
        errors.append(
            f"{task.task_id}: COMPLETE requires unproven_requirements: NONE"
        )
    if normalized(meta["known_blockers"]) != "NONE":
        errors.append(
            f"{task.task_id}: COMPLETE requires known_blockers: NONE"
        )
    if normalized(local_remaining) != "NONE":
        errors.append(
            f"{task.task_id}: COMPLETE requires locally_actionable_remaining: NONE"
        )
    if normalized(unblock_condition) != "NONE":
        errors.append(
            f"{task.task_id}: COMPLETE requires unblock_condition: NONE"
        )
    if dependency_chain_blocked != "FALSE":
        errors.append(
            f"{task.task_id}: COMPLETE requires dependency_chain_blocked: false"
        )
    if normalized(meta["next_eligible_task"]) in {"", "NONE", "N/A"}:
        warnings.append(
            f"{task.task_id}: COMPLETE should identify next_eligible_task or explicitly state none"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate LANCAR task evidence.")
    parser.add_argument("--master", default=DEFAULT_MASTER)
    parser.add_argument("--evidence-dir", default=DEFAULT_EVIDENCE_DIR)
    args = parser.parse_args()

    master_path = Path(args.master)
    evidence_dir = Path(args.evidence_dir)

    if not master_path.is_file():
        print(f"ERROR: master task file not found: {master_path}", file=sys.stderr)
        return 2
    if not evidence_dir.is_dir():
        print(f"ERROR: evidence directory not found: {evidence_dir}", file=sys.stderr)
        return 2

    try:
        tasks = parse_master(master_path)
    except Exception as exc:
        print(f"ERROR: unable to parse master task: {exc}", file=sys.stderr)
        return 2

    errors: List[str] = []
    warnings: List[str] = []
    touched = [task for task in tasks.values() if task.touched]

    for task in touched:
        evidence_path = evidence_dir / f"{task.task_id}.md"
        if not evidence_path.is_file():
            errors.append(
                f"{task.task_id}: {task.checked_boxes}/{task.total_boxes} checkbox(es) are checked "
                f"but evidence file is missing: {evidence_path}"
            )
            continue
        validate_evidence(task, evidence_path, errors, warnings)

    # Evidence files for unknown IDs are suspicious, but templates/README are allowed.
    for path in evidence_dir.glob("*.md"):
        if path.name in {"README.md", "TEMPLATE.md"}:
            continue
        task_id = path.stem
        if task_id not in tasks:
            warnings.append(
                f"{path}: evidence file does not match a TASK-ID heading in the master task"
            )

    print(
        f"Task evidence scan: {len(tasks)} task sections, "
        f"{len(touched)} with checked boxes."
    )
    for warning in warnings:
        print(f"WARNING: {warning}")

    if errors:
        print("\nTASK EVIDENCE GATE FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("TASK EVIDENCE GATE PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
