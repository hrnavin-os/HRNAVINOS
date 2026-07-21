"""Live aggregation-pipeline queries backing the Reports module.

Cross-collection joins that would be SQL `JOIN`s become MongoDB `$lookup`
aggregation stages here.
"""
from app.models.admission import Admission
from app.models.attendance import Attendance
from app.models.enums import AttendanceStatus, PaymentStatus
from app.models.lead import Lead
from app.models.payment import Payment


class ReportAggregationRepository:
    async def revenue_by_month(self, limit_months: int = 12) -> list[dict]:
        pipeline = [
            {"$match": {"is_deleted": False, "status": PaymentStatus.VERIFIED.value}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m", "date": "$payment_date"}},
                    "total_collected": {"$sum": "$amount"},
                    "payment_count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": -1}},
            {"$limit": limit_months},
            {"$project": {"month": "$_id", "total_collected": 1, "payment_count": 1, "_id": 0}},
        ]
        rows = await Payment.get_motor_collection().aggregate(pipeline).to_list(length=limit_months)
        for row in rows:
            row["total_collected"] = _to_decimal(row["total_collected"])
        return rows

    async def admissions_by_course(self) -> list[dict]:
        pipeline = [
            {"$match": {"is_deleted": False}},
            {
                "$group": {
                    "_id": "$course_id",
                    "admissions_count": {"$sum": 1},
                    "total_revenue": {"$sum": "$total_fee"},
                }
            },
            {"$lookup": {"from": "courses", "localField": "_id", "foreignField": "_id", "as": "course"}},
            {"$unwind": "$course"},
            {
                "$project": {
                    "course_name": "$course.name",
                    "admissions_count": 1,
                    "total_revenue": 1,
                    "_id": 0,
                }
            },
            {"$sort": {"admissions_count": -1}},
        ]
        rows = await Admission.get_motor_collection().aggregate(pipeline).to_list(length=None)
        for row in rows:
            row["total_revenue"] = _to_decimal(row["total_revenue"])
        return rows

    async def attendance_by_batch(self) -> list[dict]:
        pipeline = [
            {"$match": {"is_deleted": False}},
            {
                "$group": {
                    "_id": "$batch_id",
                    "total_sessions": {"$sum": 1},
                    "present_count": {
                        "$sum": {"$cond": [{"$eq": ["$status", AttendanceStatus.PRESENT.value]}, 1, 0]}
                    },
                    "absent_count": {
                        "$sum": {"$cond": [{"$eq": ["$status", AttendanceStatus.ABSENT.value]}, 1, 0]}
                    },
                }
            },
            {"$lookup": {"from": "batches", "localField": "_id", "foreignField": "_id", "as": "batch"}},
            {"$unwind": "$batch"},
            {
                "$project": {
                    "batch_name": "$batch.name",
                    "total_sessions": 1,
                    "present_count": 1,
                    "absent_count": 1,
                    "_id": 0,
                }
            },
        ]
        rows = await Attendance.get_motor_collection().aggregate(pipeline).to_list(length=None)
        for row in rows:
            total = row["total_sessions"] or 1
            row["attendance_rate"] = round((row["present_count"] or 0) / total * 100, 2)
        return rows

    async def lead_conversion(self) -> list[dict]:
        pipeline = [
            {"$match": {"is_deleted": False}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$project": {"status": "$_id", "count": 1, "_id": 0}},
        ]
        return await Lead.get_motor_collection().aggregate(pipeline).to_list(length=None)


def _to_decimal(value):
    from decimal import Decimal

    return value.to_decimal() if hasattr(value, "to_decimal") else Decimal(str(value))
