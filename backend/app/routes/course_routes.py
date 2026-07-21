"""HTTP routes for the Course Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.course_schema import CourseCreate, CourseResponse, CourseUpdate
from app.services.course_service import CourseService

router = APIRouter(prefix="/courses", tags=["Course Management"])


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    actor: User = Depends(RequirePermissions(Permissions.COURSES_CREATE)),
) -> CourseResponse:
    return CourseResponse.model_validate(await CourseService().create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[CourseResponse])
async def list_courses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.COURSES_VIEW)),
) -> PaginatedResponse[CourseResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await CourseService().list(params)
    return PaginatedResponse[CourseResponse].build(
        [CourseResponse.model_validate(c) for c in result.items], result.total, result.page, result.page_size
    )


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.COURSES_VIEW)),
) -> CourseResponse:
    return CourseResponse.model_validate(await CourseService().get(course_id))


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdate,
    actor: User = Depends(RequirePermissions(Permissions.COURSES_UPDATE)),
) -> CourseResponse:
    return CourseResponse.model_validate(await CourseService().update(course_id, payload, actor_id=actor.id))


@router.delete("/{course_id}", response_model=MessageResponse)
async def delete_course(
    course_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.COURSES_DELETE)),
) -> MessageResponse:
    await CourseService().delete(course_id, actor_id=actor.id)
    return MessageResponse(message="Course deleted successfully.")
