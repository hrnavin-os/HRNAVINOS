"""HTTP routes for viewing the Audit Log module (read-only)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.audit_log_schema import AuditLogResponse
from app.schemas.common import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.AUDIT_LOGS_VIEW)),
) -> PaginatedResponse[AuditLogResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    items, total = AuditLogRepository(db).list(
        page=params.page,
        page_size=params.page_size,
        search=params.search,
        search_fields=["action", "entity_type"],
        sort_by=params.sort_by,
        sort_order=params.sort_order,
        include_deleted=True,
        filters={"entity_type": entity_type} if entity_type else None,
    )
    return PaginatedResponse[AuditLogResponse].build(
        [AuditLogResponse.model_validate(a) for a in items], total, params.page, params.page_size
    )
