"""HTTP routes for the Dashboard module."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.dashboard_schema import DashboardOverview
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverview)
async def get_overview(user: User = Depends(RequirePermissions(Permissions.DASHBOARD_VIEW))) -> DashboardOverview:
    return await DashboardService().get_overview()
