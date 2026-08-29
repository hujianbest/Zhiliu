#!/usr/bin/env python3
"""Validate the Zhiliu spec-driven planning repository.

This repository is currently greenfield: it contains a product specification and
a set of dependency-ordered implementation tickets, but no application code yet
(the desktop framework is still to be chosen in ticket 01). Until an application
exists, the runnable "development" artifact is the planning corpus itself.

This checker validates the structural invariants documented in
``docs/agents/issue-tracker.md``:

* each feature directory under ``.scratch/`` has a non-empty ``spec.md``;
* tickets live at ``issues/<NN>-<slug>.md`` and are numbered contiguously from 01;
* every ticket declares a ``Status:`` and a ``Blocked by:`` line;
* every ``Blocked by:`` reference points at an existing ticket and is not itself.

It depends only on the Python standard library so it can run in any environment
without an install step.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRATCH_DIR = REPO_ROOT / ".scratch"

TICKET_FILENAME = re.compile(r"^(\d{2,})-[a-z0-9-]+\.md$")
STATUS_LINE = re.compile(r"^\*\*Status:\*\*\s*(.+?)\s*$", re.MULTILINE)
BLOCKED_BY_LINE = re.compile(r"^\*\*Blocked by:\*\*\s*(.+?)\s*$", re.MULTILINE)


def _parse_blocked_by(raw: str) -> list[str]:
    """Return the list of ticket numbers referenced by a Blocked by value."""
    if raw.strip().lower().startswith("none"):
        return []
    return [token.strip() for token in raw.split(",") if token.strip()]


def validate_feature(feature_dir: Path, errors: list[str]) -> dict:
    """Validate one feature directory. Append problems to ``errors``.

    Returns a small summary dict used for the final report.
    """
    rel = feature_dir.relative_to(REPO_ROOT)
    summary = {"feature": str(rel), "tickets": 0}

    spec = feature_dir / "spec.md"
    if not spec.is_file():
        errors.append(f"{rel}: missing spec.md")
    elif not spec.read_text(encoding="utf-8").strip():
        errors.append(f"{rel}/spec.md: is empty")

    issues_dir = feature_dir / "issues"
    if not issues_dir.is_dir():
        errors.append(f"{rel}: missing issues/ directory")
        return summary

    numbers: dict[int, Path] = {}
    for path in sorted(issues_dir.iterdir()):
        if path.name.startswith("."):
            continue
        match = TICKET_FILENAME.match(path.name)
        if not match:
            errors.append(f"{path.relative_to(REPO_ROOT)}: filename must be NN-slug.md")
            continue

        number = int(match.group(1))
        if number in numbers:
            errors.append(
                f"{path.relative_to(REPO_ROOT)}: duplicate ticket number "
                f"{number:02d} (also {numbers[number].name})"
            )
            continue
        numbers[number] = path

    summary["tickets"] = len(numbers)

    for number in sorted(numbers):
        path = numbers[number]
        prel = path.relative_to(REPO_ROOT)
        text = path.read_text(encoding="utf-8")

        if not STATUS_LINE.search(text):
            errors.append(f"{prel}: missing '**Status:**' line")

        blocked_match = BLOCKED_BY_LINE.search(text)
        if not blocked_match:
            errors.append(f"{prel}: missing '**Blocked by:**' line")
            continue

        for ref in _parse_blocked_by(blocked_match.group(1)):
            if not ref.isdigit():
                errors.append(f"{prel}: unparseable Blocked by reference '{ref}'")
                continue
            ref_num = int(ref)
            if ref_num == number:
                errors.append(f"{prel}: ticket lists itself as a blocker")
            elif ref_num not in numbers:
                errors.append(
                    f"{prel}: Blocked by references ticket {ref_num:02d}, "
                    "which does not exist"
                )

    expected = set(range(1, len(numbers) + 1))
    actual = set(numbers)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        gaps = ", ".join(f"{n:02d}" for n in missing)
        errors.append(f"{rel}/issues: ticket numbering is not contiguous; missing {gaps}")
    if extra:
        beyond = ", ".join(f"{n:02d}" for n in extra)
        errors.append(f"{rel}/issues: ticket numbers beyond the contiguous range: {beyond}")

    return summary


def main() -> int:
    if not SCRATCH_DIR.is_dir():
        print(f"error: {SCRATCH_DIR} does not exist", file=sys.stderr)
        return 1

    feature_dirs = sorted(p for p in SCRATCH_DIR.iterdir() if (p / "spec.md").exists() or (p / "issues").is_dir())
    if not feature_dirs:
        print(f"error: no feature directories found under {SCRATCH_DIR}", file=sys.stderr)
        return 1

    errors: list[str] = []
    summaries = [validate_feature(feature_dir, errors) for feature_dir in feature_dirs]

    for summary in summaries:
        print(f"ok  {summary['feature']}: spec.md + {summary['tickets']} tickets")

    if errors:
        print()
        print(f"FAILED: {len(errors)} problem(s) found:", file=sys.stderr)
        for problem in errors:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    total = sum(s["tickets"] for s in summaries)
    print()
    print(f"PASSED: {len(summaries)} feature(s), {total} tickets, all invariants hold")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
