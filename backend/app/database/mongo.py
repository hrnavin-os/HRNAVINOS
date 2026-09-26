"""MongoDB connection lifecycle: Motor client + Beanie ODM initialization."""
import logging

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config.settings import settings

logger = logging.getLogger("app.database")

client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> None:
    """Opens the Motor client and registers every Beanie document model."""
    global client

    from app.models import ALL_DOCUMENTS

    # tz_aware=True: PyMongo otherwise decodes BSON dates as naive UTC
    # datetimes, which then blow up comparing against timezone-aware
    # `datetime.now(timezone.utc)` values everywhere else in the app.
    client = AsyncIOMotorClient(settings.MONGODB_URI, uuidRepresentation="standard", tz_aware=True)
    database = client[settings.MONGODB_DB_NAME]
    await _drop_plain_user_email_index(database)
    await init_beanie(database=database, document_models=ALL_DOCUMENTS)
    logger.info("mongo_connected", extra={"db": settings.MONGODB_DB_NAME})


async def _drop_plain_user_email_index(database) -> None:
    """Makes way for the partial unique email index on `users`.

    The index used to be plainly unique, which counts a missing email as a
    value and so refuses a second member of staff recorded without a login.
    Beanie will not rebuild an index whose options changed - it fails the boot
    instead - so the old one is dropped here and init_beanie builds the new one
    in its place. Every boot after the first finds the partial index and does
    nothing.
    """
    from app.models.user import EMAIL_INDEX_NAME

    indexes = await database["users"].index_information()
    existing = indexes.get(EMAIL_INDEX_NAME)
    if existing and "partialFilterExpression" not in existing:
        await database["users"].drop_index(EMAIL_INDEX_NAME)
        logger.info("dropped_plain_user_email_index")


async def close_mongo_connection() -> None:
    global client
    if client is not None:
        client.close()
        client = None
        logger.info("mongo_disconnected")
