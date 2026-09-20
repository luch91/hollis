import sys

import pytest


def pytest_collection_modifyitems(items):
    if sys.platform != "win32":
        return
    upstream_windows_limitation = pytest.mark.skip(
        reason="genlayer-test direct VM cannot release its stdin tempfile on Windows"
    )
    for item in items:
        if "direct_deploy" in item.fixturenames or "direct_vm" in item.fixturenames:
            item.add_marker(upstream_windows_limitation)
