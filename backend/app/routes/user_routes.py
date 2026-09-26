"""HTTP routes for the User Management module."""
import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from app.core.dependencies import RequireAnyPermission, RequirePermissions, get_role_permission_codes, get_user_role
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.user_schema import (
    StaffDocumentUploadResponse,
    UserCreate,
    UserDelete,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from app.services.storage_service import StorageService
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    actor: User = Depends(RequirePermissions(Permissions.USERS_CREATE)),
) -> UserResponse:
    service = UserService()
    user = await service.create(payload, actor_id=actor.id)
    return await service.to_response(user)


@router.get("", response_model=PaginatedResponse[UserListResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    role_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    # The Deleted tab. Deleted users are soft-deleted, so they are still here
    # to be listed - and the reason they were removed is on the row.
    deleted: bool = False,
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> PaginatedResponse[UserListResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    service = UserService()
    result = await service.list(params, role_id=role_id, department_id=department_id, deleted=deleted)
    items = [await service.to_list_response(u) for u in result.items]
    return PaginatedResponse[UserListResponse].build(items, result.total, result.page, result.page_size)


@router.post("/documents", response_model=StaffDocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_staff_document(
    file: UploadFile = File(...),
    actor: User = Depends(RequireAnyPermission(Permissions.USERS_CREATE, Permissions.USERS_UPDATE)),
) -> StaffDocumentUploadResponse:
    """Stores one ID copy or certificate for the Users form's ID & Docs
    section, and returns where it now lives.

    Uploaded on its own, ahead of the save, so the form can show the file as
    attached while the rest of it is still being filled in. The URL is then
    saved on the user with everything else. Declared before /{user_id} so the
    dynamic segment doesn't swallow it.
    """
    url = await StorageService().save_document(file, subdir="staff")
    return StaffDocumentUploadResponse(url=url, file_name=file.filename)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> UserResponse:
    service = UserService()
    response = await service.to_response(await service.get(user_id))
    if not await _can_read_staff_profile(actor):
        response = service.without_sensitive_details(response)
    return response


async def _can_read_staff_profile(actor: User) -> bool:
    """Whether this actor may read a user's ID and bank details.

    users.view on its own is the login list - who has an account and what role
    it carries - and roles such as Sales Head hold it for that. The ID numbers,
    documents and bank account a member of staff hands over are for whoever
    keeps the staff records: the Staffs directory, and whoever adds or edits
    users (they typed those details in, and the edit form has to show them).
    """
    role = await get_user_role(actor)
    if role and role.name == "Super Admin":
        return True
    granted = await get_role_permission_codes(role)
    return bool(granted & {Permissions.STAFFS_VIEW, Permissions.USERS_CREATE, Permissions.USERS_UPDATE})


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    service = UserService()
    user = await service.update(user_id, payload, actor_id=actor.id)
    return await service.to_response(user)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    service = UserService()
    user = await service.deactivate(user_id, actor_id=actor.id)
    return await service.to_response(user)


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: uuid.UUID,
    # A body on DELETE rather than a query string: the reason is free text
    # somebody types, and typed prose does not belong in a URL that ends up in
    # access logs and browser history.
    payload: UserDelete,
    actor: User = Depends(RequirePermissions(Permissions.USERS_DELETE)),
) -> MessageResponse:
    await UserService().delete(user_id, reason=payload.reason, actor_id=actor.id)
    return MessageResponse(message="User deleted successfully.")
