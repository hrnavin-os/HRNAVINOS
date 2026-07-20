"""Base application exception hierarchy.

All domain/service-layer errors should raise one of these instead of
FastAPI's HTTPException, so routes stay free of HTTP-status decisions
(that mapping happens once, in the global exception handlers).
"""
from typing import Any


class AppException(Exception):
    """Base class for all application-raised exceptions."""

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred."

    def __init__(self, message: str | None = None, *, details: Any = None) -> None:
        self.message = message or self.message
        self.details = details
        super().__init__(self.message)


class NotFoundError(AppException):
    status_code = 404
    error_code = "NOT_FOUND"
    message = "Resource not found."


class AlreadyExistsError(AppException):
    status_code = 409
    error_code = "ALREADY_EXISTS"
    message = "Resource already exists."


class ValidationAppError(AppException):
    status_code = 422
    error_code = "VALIDATION_ERROR"
    message = "Validation failed."


class UnauthorizedError(AppException):
    status_code = 401
    error_code = "UNAUTHORIZED"
    message = "Authentication is required or credentials are invalid."


class ForbiddenError(AppException):
    status_code = 403
    error_code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class ConflictError(AppException):
    status_code = 409
    error_code = "CONFLICT"
    message = "The request could not be completed due to a conflict."


class BadRequestError(AppException):
    status_code = 400
    error_code = "BAD_REQUEST"
    message = "The request could not be processed."


class RateLimitExceededError(AppException):
    status_code = 429
    error_code = "RATE_LIMIT_EXCEEDED"
    message = "Too many requests. Please try again later."
