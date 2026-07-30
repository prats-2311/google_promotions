"""Enterprise Agent Platform SDK tool: grounding check.

Callable by the Culture Intelligence Agent playbook (mode=grounding_check)
as `sdk_grounding_check`. Provides a deterministic keyword-overlap backstop
underneath the LLM's own semantic judgment, so the Talent Prep <-> Culture
Intelligence handoff is not "trust the model" alone.
"""

from __future__ import annotations

import json
import re

_STOPWORDS = {"a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "avoid", "don't", "dont"}
_OVERLAP_THRESHOLD = 0.6

# A brief's own "topics to avoid" list legitimately restates the don'ts in
# similar words — that's compliance, not a violation. Only content the talent
# is actually meant to say or lean into should be scanned for overlap.
_EXCLUDED_FIELDS = {"topics_to_avoid", "avoid", "avoid_list"}
_SCANNABLE_FIELDS = {"topics_to_lean_into", "lean_into", "pronounceable_local_lines", "fan_questions", "high_probability_fan_questions"}


def _keywords(phrase: str) -> set[str]:
    words = re.findall(r"[a-zA-Z']+", phrase.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _flatten_strings(obj) -> list[str]:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _flatten_strings(v)]
    if isinstance(obj, list):
        return [s for item in obj for s in _flatten_strings(item)]
    return []


def _scannable_text(draft_brief_text: str) -> str:
    try:
        parsed = json.loads(draft_brief_text)
    except (json.JSONDecodeError, TypeError):
        return draft_brief_text
    if not isinstance(parsed, dict):
        return draft_brief_text

    scan_keys = [k for k in parsed if k in _SCANNABLE_FIELDS]
    if not scan_keys:
        # Unfamiliar shape — fall back to everything except explicitly excluded fields.
        scan_keys = [k for k in parsed if k not in _EXCLUDED_FIELDS]
    # Scan only the actual string VALUES, never re-serialize with key names —
    # a key like "high_probability_fan_questions" would otherwise leak the
    # substring "questions" into the scan regardless of its content.
    return " ".join(_flatten_strings({k: parsed[k] for k in scan_keys}))


def check_grounding(
    draft_brief_text: str,
    donts: list[str],
    humor_boundaries: str | None = None,
) -> dict:
    draft_lower = _scannable_text(draft_brief_text).lower()
    flags = []
    for dont in donts:
        kw = _keywords(dont)
        if not kw:
            continue
        # Word-boundary match — plain substring containment would let "direct"
        # match inside "directness", a real false positive observed in testing.
        hits = {w for w in kw if re.search(rf"\b{re.escape(w)}\b", draft_lower)}
        if len(hits) / len(kw) >= _OVERLAP_THRESHOLD:
            flags.append({"rule": dont, "matched_terms": sorted(hits)})

    passed = len(flags) == 0
    notes = (
        "No keyword-level overlap with any don't found in the brief's actionable content "
        "(topics_to_avoid is intentionally excluded from this scan); treat as a supporting "
        "signal, not proof of full semantic consistency."
        if passed
        else f"Potential overlap with {len(flags)} don't rule(s) in the brief's actionable content — review before finalizing."
    )
    return {"grounding_check_passed": passed, "grounding_check_notes": notes, "flags": flags}
