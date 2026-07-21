"""Sanity checks for the health-check endpoint."""


async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "HRNAVINOS ERP"
