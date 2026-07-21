"""Business logic for the Company (placement partners) module."""
import uuid

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.company import Company
from app.repositories.company_repository import CompanyRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.company_schema import CompanyCreate, CompanyUpdate
from app.services.audit_service import AuditService


class CompanyService:
    def __init__(self) -> None:
        self.companies = CompanyRepository()
        self.audit = AuditService()

    async def create(self, data: CompanyCreate, *, actor_id: uuid.UUID | None) -> Company:
        if await self.companies.name_exists(data.name):
            raise AlreadyExistsError(f"A company named '{data.name}' already exists.")
        company = Company(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        await self.companies.create(company)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Company", entity_id=str(company.id))
        return company

    async def get(self, company_id: uuid.UUID) -> Company:
        company = await self.companies.get_by_id(company_id)
        if not company:
            raise NotFoundError("Company not found.")
        return company

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.companies.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "industry"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, company_id: uuid.UUID, data: CompanyUpdate, *, actor_id: uuid.UUID | None) -> Company:
        company = await self.get(company_id)
        if data.name and await self.companies.name_exists(data.name, exclude_id=company.id):
            raise AlreadyExistsError(f"A company named '{data.name}' already exists.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.companies.update(company, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Company", entity_id=str(company.id), changes=update_data
        )
        return company

    async def delete(self, company_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        company = await self.get(company_id)
        await self.companies.delete(company)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Company", entity_id=str(company.id))
