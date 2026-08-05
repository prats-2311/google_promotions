"""Guards against the known /sdk vs cloud_run/tour_data_api/sdk_logic drift.

Cloud Run source deploys only build the given directory, so sdk_logic/ is a
manually-synced copy of /sdk rather than an import across the deploy boundary
(see cloud_run/CLAUDE.md). This has already caused one real bug — a
grounding_check.py fix was applied to /sdk but the deployed sdk_logic copy
went stale until it was manually re-synced. This test fails loudly the
moment the two copies diverge again.
"""

import os

_SDK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REPO_ROOT = os.path.dirname(_SDK_DIR)
_SDK_LOGIC_DIR = os.path.join(_REPO_ROOT, "cloud_run", "tour_data_api", "sdk_logic")
_SYNCED_MODULES = ["city_ranking.py", "enthusiasm_scoring.py", "grounding_check.py"]


def test_sdk_logic_copy_matches_canonical_sdk_source():
    mismatches = []
    for module in _SYNCED_MODULES:
        canonical_path = os.path.join(_SDK_DIR, module)
        copy_path = os.path.join(_SDK_LOGIC_DIR, module)
        with open(canonical_path) as f:
            canonical = f.read()
        with open(copy_path) as f:
            copy = f.read()
        if canonical != copy:
            mismatches.append(module)
    assert not mismatches, (
        f"sdk_logic/ is out of sync with /sdk for: {mismatches} — copy the fix from "
        f"/sdk into cloud_run/tour_data_api/sdk_logic/ and redeploy tour_data_api"
    )
