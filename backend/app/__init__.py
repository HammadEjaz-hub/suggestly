"""App package init — runs the proxy-env sanitizer before anything imports httpx.

Known issue (hit on earlier projects): the sandbox/host exports no_proxy with
bracketed IPv6 entries like ``[::1]`` and ``[fd8b:...::1]``. httpx 0.28.1
crashes while parsing those when it builds proxy mounts from the environment.
We strip every bracketed entry from no_proxy / NO_PROXY at startup so httpx
never sees them. Plain hosts and unbracketed IPv6 literals are kept.
"""
import os


def _sanitize_no_proxy() -> None:
    for var in ("no_proxy", "NO_PROXY"):
        raw = os.environ.get(var)
        if not raw:
            continue
        entries = [e.strip() for e in raw.split(",")]
        clean = [e for e in entries if e and "[" not in e and "]" not in e]
        if len(clean) != len(entries):
            os.environ[var] = ",".join(clean)


_sanitize_no_proxy()
