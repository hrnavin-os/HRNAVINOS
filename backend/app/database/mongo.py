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
    await init_beanie(database=database, document_models=ALL_DOCUMENTS)
    logger.info("mongo_connected", extra={"db": settings.MONGODB_DB_NAME})


async def close_mongo_connection() -> None:
    global client
    if client is not None:
        client.close()
        client = None
        logger.info("mongo_disconnected")
