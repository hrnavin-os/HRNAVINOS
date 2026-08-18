"""Counts bcrypt work during a pytest run, so the cost is measured rather than assumed."""
import time

_stats = {"hash": [0, 0.0], "verify": [0, 0.0]}


def pytest_configure(config):
    from app.core import security

    for name in ("hash_password", "verify_password"):
        original = getattr(security, name)
        key = "hash" if name == "hash_password" else "verify"

        def wrapper(*a, _o=original, _k=key, **kw):
            t = time.perf_counter()
            try:
                return _o(*a, **kw)
            finally:
                _stats[_k][0] += 1
                _stats[_k][1] += time.perf_counter() - t

        setattr(security, name, wrapper)
    # seed_db imported hash_password by value before we patched, so rebind it too.
    import importlib
    try:
        seed = importlib.import_module("seed_db")
        seed.hash_password = security.hash_password
    except Exception:
        pass


def pytest_terminal_summary(terminalreporter, *a, **kw):
    total = sum(v[1] for v in _stats.values())
    terminalreporter.write_line("")
    for k, (n, secs) in _stats.items():
        terminalreporter.write_line(f"BCRYPT {k:7} calls={n:4d}  total={secs:6.2f}s")
    terminalreporter.write_line(f"BCRYPT total spent in bcrypt: {total:.2f}s")
