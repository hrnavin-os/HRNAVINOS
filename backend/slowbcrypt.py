"""Restores production bcrypt cost, so the same subset can be timed both ways."""
def pytest_configure(config):
    from passlib.context import CryptContext
    from app.core import security
    security.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
