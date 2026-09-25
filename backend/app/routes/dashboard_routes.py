"""HTTP routes for the Dashboard module."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions, get_actor_scope
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.dashboard_schema import DashboardInsights, DashboardOverview
from app.services.dashboard_insights import DashboardInsightsService
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverview)
async def get_overview(user: User = Depends(RequirePermissions(Permissions.DASHBOARD_VIEW))) -> DashboardOverview:
    return await DashboardService().get_overview()


@router.get("/insights", response_model=DashboardInsights)
async def get_insights(user: User = Depends(RequirePermissions(Permissions.DASHBOARD_VIEW))) -> DashboardInsights:
    """The dashboard's funnel, money and activity. A role scoped to one section
    sees that section's numbers, the same as on the boards."""
    return await DashboardInsightsService().get(section=await get_actor_scope(user))
