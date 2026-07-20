"""Tests for the Authentication module: login, refresh, logout, me."""
from app.config.settings import settings


def test_login_success(client, seeded):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": settings.FIRST_SUPERUSER_PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client, seeded):
    response = client.post(
        "/api/v1/auth/login", json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": "WrongPassword123"}
    )
    assert response.status_code == 401
    assert response.json()["error_code"] == "UNAUTHORIZED"


def test_login_unknown_email(client, seeded):
    response = client.post(
        "/api/v1/auth/login", json={"email": "nobody@hrnavinos.com", "password": "Whatever123"}
    )
    assert response.status_code == 401


def test_me_requires_authentication(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user(client, auth_headers):
    response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == settings.FIRST_SUPERUSER_EMAIL
    assert body["role"] == "Super Admin"
    assert "users.create" in body["permissions"]


def test_refresh_token_rotates(client, seeded):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": settings.FIRST_SUPERUSER_PASSWORD},
    )
    refresh_token = login.json()["refresh_token"]

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["refresh_token"] != refresh_token

    # The rotated-out token must now be rejected.
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reused.status_code == 401


def test_logout_revokes_refresh_token(client, seeded):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": settings.FIRST_SUPERUSER_PASSWORD},
    )
    refresh_token = login.json()["refresh_token"]

    logout = client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout.status_code == 200

    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reused.status_code == 401


def test_change_password_then_login_with_new_password(client, auth_headers):
    response = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={"current_password": settings.FIRST_SUPERUSER_PASSWORD, "new_password": "NewPassword123"},
    )
    assert response.status_code == 200

    login = client.post(
        "/api/v1/auth/login", json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": "NewPassword123"}
    )
    assert login.status_code == 200
