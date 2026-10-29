"""Enrolment for the Student Portal: every lead at Batch Confirmation is a
student there, in the batch the leads boards show it in, and stays in step
with its lead as the portal is opened."""
from datetime import date, datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.config.settings import settings
from app.database.mongo import close_mongo_connection, connect_to_mongo
from app.models.batch import Batch
from app.models.enums import LeadStatus, StudentStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.student import EMAIL_INDEX_NAME, Student

PORTAL = "/api/v1/student-portal"


async def make_lead(name, phone, *, status=LeadStatus.BATCH_CONFIRMATION, **fields) -> Lead:
    lead = Lead(name=name, phone=phone, status=status, **fields)
    await lead.insert()
    return lead


async def portal(client, headers) -> list[dict]:
    response = await client.get(f"{PORTAL}/batches", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def student_of(lead) -> Student | None:
    return await Student.find_one({"lead_id": lead.id})


async def batch_name(student) -> str:
    return (await Batch.get(student.batch_id)).name


async def test_every_lead_at_batch_confirmation_is_a_student_in_its_leads_batch(client, auth_headers):
    entry = InductionEntry(name="Arun", phone="9000000001", registration_date=date(2026, 8, 4), batch_number=20)
    await entry.insert()
    # The induction batch wins over one typed on the lead, as on the leads page.
    arun = await make_lead(
        "Arun Kumar",
        "9000000001",
        email="Arun@Mail.com",
        induction_entry_id=entry.id,
        batch_number="19",
        finance_approved_at=datetime(2026, 10, 1, 6, 0, tzinfo=timezone.utc),
    )
    bala = await make_lead("Bala", "9000000002", email="bala@mail.com", batch_number="20")
    # Neither gave an email, and the two of them must not collide over that.
    chitra = await make_lead("Chitra", "9000000003", batch_number="21")
    devi = await make_lead("Devi", "9000000004")
    # Not at the stage, not reviewed yet, or deleted: none of them enrolled.
    await make_lead("Ezhil", "9000000005", status=LeadStatus.FINANCIAL_APPROVAL, batch_number="20")
    await make_lead("Farah", "9000000006", reviewed=False, batch_number="20")
    await make_lead("Gopi", "9000000007", is_deleted=True, batch_number="20")

    listed = await portal(client, auth_headers)

    assert [(batch["name"], batch["student_count"]) for batch in listed] == [
        ("Batch-21", 1),
        ("Batch-20", 2),
        ("No batch yet", 1),
    ]
    student = await student_of(arun)
    assert (student.first_name, student.last_name, student.email) == ("Arun", "Kumar", "arun@mail.com")
    assert student.status == StudentStatus.ACTIVE
    assert student.admission_date == date(2026, 10, 1)
    assert await batch_name(student) == "Batch-20"
    assert await batch_name(await student_of(bala)) == "Batch-20"
    assert (await student_of(chitra)).email is None
    assert await batch_name(await student_of(devi)) == "No batch yet"
    assert await Student.find_all().count() == 4

    # Opening it again adds nothing.
    assert await portal(client, auth_headers) == listed
    assert await Student.find_all().count() == 4
    assert await Batch.find_all().count() == 3

    # The Students and Batches pages still list what was made.
    students = await client.get("/api/v1/students", headers=auth_headers)
    assert students.status_code == 200, students.text
    batches = await client.get("/api/v1/batches", headers=auth_headers)
    assert batches.status_code == 200, batches.text
    assert {batch["course_id"] for batch in batches.json()["items"]} == {None}


async def test_changing_a_leads_batch_moves_its_student(client, auth_headers):
    lead = await make_lead("Arun", "9000000001", email="arun@mail.com", batch_number="20")
    await portal(client, auth_headers)
    assert await batch_name(await student_of(lead)) == "Batch-20"

    lead.batch_number = "21"
    await lead.save()
    listed = await portal(client, auth_headers)

    assert await batch_name(await student_of(lead)) == "Batch-21"
    # Batch-20 has nobody left and no classes, so it has nothing to manage.
    assert [batch["name"] for batch in listed] == ["Batch-21"]


async def test_a_lead_that_leaves_the_stage_is_dropped_and_comes_back_active(client, auth_headers):
    lead = await make_lead("Arun", "9000000001", email="arun@mail.com", batch_number="20")
    await portal(client, auth_headers)

    lead.status = LeadStatus.LOST
    await lead.save()
    await portal(client, auth_headers)
    student = await student_of(lead)
    assert student.status == StudentStatus.DROPPED
    assert student.lead_left_at is not None

    lead.status = LeadStatus.BATCH_CONFIRMATION
    await lead.save()
    await portal(client, auth_headers)
    student = await student_of(lead)
    assert student.status == StudentStatus.ACTIVE
    assert student.lead_left_at is None


async def test_what_staff_do_by_hand_is_kept(client, auth_headers):
    dropped = await make_lead("Arun", "9000000001", email="arun@mail.com", batch_number="20")
    deleted = await make_lead("Bala", "9000000002", email="bala@mail.com", batch_number="20")
    await portal(client, auth_headers)

    arun, bala = await student_of(dropped), await student_of(deleted)
    response = await client.put(f"/api/v1/students/{arun.id}", headers=auth_headers, json={"status": "dropped"})
    assert response.status_code == 200, response.text
    assert (await client.delete(f"/api/v1/students/{bala.id}", headers=auth_headers)).status_code == 200
    await portal(client, auth_headers)

    assert (await student_of(dropped)).status == StudentStatus.DROPPED
    assert (await student_of(deleted)).is_deleted
    assert await Student.find({"lead_id": deleted.id}).count() == 1


async def test_a_student_already_on_record_is_taken_up_by_email(client, auth_headers):
    existing = Student(first_name="Arun", last_name="S", email="arun@mail.com", admission_date=date(2026, 1, 5))
    await existing.insert()
    lead = await make_lead("Arun", "9000000001", email="ARUN@mail.com", batch_number="20")
    # The same person on a second lead: still one student.
    await make_lead("Arun K", "9000000009", email="arun@mail.com", batch_number="20")

    await portal(client, auth_headers)

    assert await Student.find_all().count() == 1
    student = await Student.get(existing.id)
    assert student.lead_id == lead.id
    assert await batch_name(student) == "Batch-20"


async def test_a_plain_unique_email_index_on_students_is_replaced(client):
    await close_mongo_connection()
    raw = AsyncIOMotorClient(settings.MONGODB_URI, uuidRepresentation="standard")
    students = raw[settings.MONGODB_DB_NAME]["students"]
    await students.drop_index(EMAIL_INDEX_NAME)
    await students.create_index([("email", 1)], name=EMAIL_INDEX_NAME, unique=True)

    await connect_to_mongo()

    index = (await students.index_information())[EMAIL_INDEX_NAME]
    raw.close()
    assert index["unique"]
    assert index["partialFilterExpression"] == {"email": {"$type": "string"}}
