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

# Video upload was removed when induction call recordings became Drive links -
# the recordings live in Drive now, and an endpoint accepting 200MB uploads
# that nothing calls is only a way to fill the disk. Files saved by the old
# flow are untouched and still served from /uploads.


class StorageService:
    def __init__(self) -> None:
        self.upload_dir = Path(settings.UPLOAD_DIR)

    async def save_image(self, file: UploadFile, *, subdir: str) -> str:
        return await self._save(
            file,
            subdir=subdir,
            allowed_types=ALLOWED_IMAGE_TYPES,
            max_mb=settings.MAX_UPLOAD_SIZE_MB,
            default_extension=".jpg",
            label="Image",
            allowed_label="JPEG, PNG, WEBP, or GIF images",
        )

    async def _save(
        self,
        file: UploadFile,
        *,
        subdir: str,
        allowed_types: set[str],
        max_mb: int,
        default_extension: str,
        label: str,
        allowed_label: str,
    ) -> str:
        if file.content_type not in allowed_types:
            raise BadRequestError(f"Only {allowed_label} are allowed.")

        contents = await file.read()
        if len(contents) > max_mb * 1024 * 1024:
            raise BadRequestError(f"{label} exceeds the {max_mb}MB upload limit.")

        extension = Path(file.filename or "").suffix or default_extension
        filename = f"{uuid.uuid4()}{extension}"
        target_dir = self.upload_dir / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / filename).write_bytes(contents)

        return f"/uploads/{subdir}/{filename}"
