"""Aggregates every module router under the versioned API prefix."""
from fastapi import APIRouter

from app.routes import (
    admission_routes,
    attendance_routes,
    audit_log_routes,
    auth_routes,
    batch_routes,
    course_routes,
    dashboard_routes,
    invoice_routes,
    lead_routes,
    notification_routes,
    payment_routes,
    permission_routes,
    placement_routes,
    report_routes,
    role_routes,
    student_routes,
    ticket_routes,
    tutor_routes,
    user_routes,
)

api_router = APIRouter()

api_router.include_router(auth_routes.router)
api_router.include_router(user_routes.router)
api_router.include_router(role_routes.router)
api_router.include_router(permission_routes.router)
api_router.include_router(audit_log_routes.router)
api_router.include_router(dashboard_routes.router)
api_router.include_router(lead_routes.router)
api_router.include_router(admission_routes.router)
api_router.include_router(student_routes.router)
api_router.include_router(course_routes.router)
api_router.include_router(batch_routes.router)
api_router.include_router(tutor_routes.router)
api_router.include_router(attendance_routes.router)
api_router.include_router(payment_routes.router)
api_router.include_router(invoice_routes.router)
api_router.include_router(placement_routes.router)
api_router.include_router(notification_routes.router)
api_router.include_router(ticket_routes.router)
api_router.include_router(report_routes.router)
