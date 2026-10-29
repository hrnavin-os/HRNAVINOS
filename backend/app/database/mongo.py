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
    await _drop_plain_email_indexes(database)
    await init_beanie(database=database, document_models=ALL_DOCUMENTS)
    logger.info("mongo_connected", extra={"db": settings.MONGODB_DB_NAME})


async def _drop_plain_email_indexes(database) -> None:
    """Makes way for the partial unique email indexes on `users` and `students`.

    Each used to be plainly unique, which counts a missing email as a value
    and so refuses a second member of staff recorded without a login, or a
    second student enrolled from a lead that gave no email. Beanie will not
    rebuild an index whose options changed - it fails the boot instead - so
    the old one is dropped here and init_beanie builds the new one in its
    place. Every boot after the first finds the partial index and does
    nothing.
    """
    from app.models.student import EMAIL_INDEX_NAME as STUDENT_EMAIL_INDEX
    from app.models.user import EMAIL_INDEX_NAME as USER_EMAIL_INDEX

    for collection, index_name in (("users", USER_EMAIL_INDEX), ("students", STUDENT_EMAIL_INDEX)):
        existing = (await database[collection].index_information()).get(index_name)
        if existing and "partialFilterExpression" not in existing:
            await database[collection].drop_index(index_name)
            logger.info("dropped_plain_email_index", extra={"collection": collection})


async def close_mongo_connection() -> None:
    global client
    if client is not None:
        client.close()
        client = None
        logger.info("mongo_disconnected")
