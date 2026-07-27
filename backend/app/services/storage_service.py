"""Local-disk file storage for user uploads (e.g. payment proof images).

Only the "local" STORAGE_BACKEND is implemented — S3 settings exist in
config but wiring that up is out of scope until it's actually needed.
"""
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config.settings import settings
from app.exceptions.base import BadRequestError

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class StorageService:
    def __init__(self) -> None:
        self.upload_dir = Path(settings.UPLOAD_DIR)

    async def save_image(self, file: UploadFile, *, subdir: str) -> str:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise BadRequestError("Only JPEG, PNG, WEBP, or GIF images are allowed.")

        contents = await file.read()
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(contents) > max_bytes:
            raise BadRequestError(f"Image exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB upload limit.")

        extension = Path(file.filename or "").suffix or ".jpg"
        filename = f"{uuid.uuid4()}{extension}"
        target_dir = self.upload_dir / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / filename).write_bytes(contents)

        return f"/uploads/{subdir}/{filename}"
