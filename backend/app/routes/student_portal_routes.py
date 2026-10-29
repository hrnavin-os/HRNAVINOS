"""HTTP routes for the Student Portal - the staff's board for enrolled batches.

Students never call these. Their side is the private link, served by
student_link_routes.py.
"""
import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import Response

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse
from app.schemas.student_portal_schema import (
    AttendanceChecks,
    AttendanceOverride,
    AttendanceRegisterResponse,
    BatchRosterResponse,
    CallRemarkCreate,
    ClassSessionCreate,
    ClassSessionResponse,
    ClassSessionUpdate,
    PortalBatchResponse,
    PortalLinkResponse,
    PortalStudentDetail,
    SessionRosterResponse,
)
from app.services.student_portal_service import StudentPortalService, portal_path

router = APIRouter(prefix="/student-portal", tags=["Student Portal"])

VIEW = RequirePermissions(Permissions.STUDENT_PORTAL_VIEW)
MARK = RequirePermissions(Permissions.STUDENT_PORTAL_MARK)
MANAGE = RequirePermissions(Permissions.STUDENT_PORTAL_MANAGE)


async def _session_response(session_id: uuid.UUID) -> ClassSessionResponse:
    return (await StudentPortalService().session_roster(session_id)).session


# ---------- Batches ----------


@router.get("/batches", response_model=list[PortalBatchResponse])
async def list_portal_batches(actor: User = Depends(VIEW)) -> list[PortalBatchResponse]:
    return await StudentPortalService().batches()


@router.get("/batches/{batch_id}", response_model=BatchRosterResponse)
async def get_batch_roster(batch_id: uuid.UUID, actor: User = Depends(VIEW)) -> BatchRosterResponse:
    return await StudentPortalService().roster(batch_id)


@router.get("/batches/{batch_id}/register", response_model=AttendanceRegisterResponse)
async def get_attendance_register(batch_id: uuid.UUID, actor: User = Depends(VIEW)) -> AttendanceRegisterResponse:
    return await StudentPortalService().register(batch_id)


@router.get("/batches/{batch_id}/attendance.pdf", response_class=Response)
async def download_attendance_report(batch_id: uuid.UUID, actor: User = Depends(VIEW)) -> Response:
    filename, content = await StudentPortalService().attendance_pdf(batch_id)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Classes ----------


@router.post("/batches/{batch_id}/sessions", response_model=ClassSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_class_session(
    batch_id: uuid.UUID, payload: ClassSessionCreate, actor: User = Depends(MANAGE)
) -> ClassSessionResponse:
    session = await StudentPortalService().create_session(batch_id, payload, actor_id=actor.id)
    return await _session_response(session.id)


@router.get("/sessions/{session_id}", response_model=SessionRosterResponse)
async def get_class_roster(session_id: uuid.UUID, actor: User = Depends(VIEW)) -> SessionRosterResponse:
    return await StudentPortalService().session_roster(session_id)


@router.put("/sessions/{session_id}", response_model=ClassSessionResponse)
async def update_class_session(
    session_id: uuid.UUID, payload: ClassSessionUpdate, actor: User = Depends(MANAGE)
) -> ClassSessionResponse:
    await StudentPortalService().update_session(session_id, payload, actor_id=actor.id)
    return await _session_response(session_id)


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def delete_class_session(session_id: uuid.UUID, actor: User = Depends(MANAGE)) -> MessageResponse:
    await StudentPortalService().delete_session(session_id, actor_id=actor.id)
    return MessageResponse(message="Class removed, with the attendance recorded against it.")


@router.post("/sessions/{session_id}/sync", response_model=ClassSessionResponse)
async def sync_class_session(session_id: uuid.UUID, actor: User = Depends(MARK)) -> ClassSessionResponse:
    await StudentPortalService().sync_session(session_id)
    return await _session_response(session_id)


# ---------- Attendance ----------


@router.put("/sessions/{session_id}/students/{student_id}/attendance", response_model=MessageResponse)
async def set_class_attendance(
    session_id: uuid.UUID, student_id: uuid.UUID, payload: AttendanceOverride, actor: User = Depends(MARK)
) -> MessageResponse:
    await StudentPortalService().set_override(
        session_id, student_id, payload.attended, actor_id=actor.id, actor_name=actor.full_name
    )
    return MessageResponse(message="Attendance updated.")


@router.put("/sessions/{session_id}/students/{student_id}/checks", response_model=MessageResponse)
async def set_register_checks(
    session_id: uuid.UUID, student_id: uuid.UUID, payload: AttendanceChecks, actor: User = Depends(MARK)
) -> MessageResponse:
    await StudentPortalService().set_checks(
        session_id, student_id, payload, actor_id=actor.id, actor_name=actor.full_name
    )
    return MessageResponse(message="Register updated.")


@router.post(
    "/sessions/{session_id}/students/{student_id}/remarks",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_absentee_call_remark(
    session_id: uuid.UUID, student_id: uuid.UUID, payload: CallRemarkCreate, actor: User = Depends(MARK)
) -> MessageResponse:
    await StudentPortalService().add_call_remark(
        session_id, student_id, payload.remark, actor_id=actor.id, actor_name=actor.full_name
    )
    return MessageResponse(message="Remark added.")


# ---------- Students ----------


@router.get("/students/{student_id}", response_model=PortalStudentDetail)
async def get_portal_student(student_id: uuid.UUID, actor: User = Depends(VIEW)) -> PortalStudentDetail:
    return await StudentPortalService().student_detail(student_id)


@router.post("/students/{student_id}/link", response_model=PortalLinkResponse)
async def issue_portal_link(
    student_id: uuid.UUID,
    regenerate: bool = Query(default=False),
    actor: User = Depends(MANAGE),
) -> PortalLinkResponse:
    student = await StudentPortalService().issue_link(student_id, regenerate=regenerate, actor_id=actor.id)
    return PortalLinkResponse(portal_path=portal_path(student))


@router.post("/students/{student_id}/terms", response_model=PortalStudentDetail)
async def record_terms_signature(
    student_id: uuid.UUID,
    signed_name: str = Form(min_length=1, max_length=150),
    file: UploadFile | None = File(default=None),
    actor: User = Depends(MANAGE),
) -> PortalStudentDetail:
    service = StudentPortalService()
    await service.record_terms(
        student_id, signed_name=signed_name, file=file, actor_id=actor.id, actor_name=actor.full_name
    )
    return await service.student_detail(student_id)


@router.delete("/students/{student_id}/terms", response_model=PortalStudentDetail)
async def clear_terms_signature(student_id: uuid.UUID, actor: User = Depends(MANAGE)) -> PortalStudentDetail:
    service = StudentPortalService()
    await service.clear_terms(student_id, actor_id=actor.id)
    return await service.student_detail(student_id)
