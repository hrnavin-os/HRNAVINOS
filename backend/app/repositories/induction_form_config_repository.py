"""Data access for the singleton InductionFormConfig document.

Seeds itself on first read with exactly the form that was previously hardcoded
in the frontend, so turning the form into config changes nothing visible until
somebody actually edits it.
"""
from app.models.induction_form_config import InductionFormConfig, InductionFormField

# Keys must match InductionEntryCreate's field names - they're what the submit
# endpoint parses. Order here is the order the form renders in.
_SEED_FIELDS = [
    {"key": "name", "label": "Name", "required": True, "options": []},
    {"key": "email", "label": "Email", "required": False, "options": []},
    {"key": "phone", "label": "Phone Number", "required": True, "options": []},
    {"key": "registration_date", "label": "Registration Date", "required": True, "options": []},
    {"key": "paid_date", "label": "Paid Date", "required": False, "options": []},
    {
        "key": "sales_person",
        "label": "Sales Person",
        "required": False,
        "options": [
            "Sudha", "Vikasini", "Kadharali", "Pavithra", "Shabna shireen",
            "Suguna", "Ezhilarasan", "Merlin Mary", "Kokila",
        ],
    },
    {
        "key": "lead_source",
        "label": "Lead Source",
        "required": False,
        "options": [
            "Meta-1", "Meta-2", "Meta-3", "Meta-4", "Meta-5", "Meta-6",
            "Meta-8", "Meta-9", "Meta-10", "Retargeting",
            "Hrhh Website 2", "Hrhh Website 3", "HRLH Insta Page",
            "Navin - YouTube", "Whatsapp Marketing", "HR Navin Page - Bio Link",
            "HR Navin DM & HR Navin Insta Story",
        ],
    },
    {
        "key": "payment_mode",
        "label": "Payment Mode",
        "required": False,
        "options": ["HRLH Razorpay Link", "HRLH Razorpay QR Code", "HRLH Old QR code"],
    },
    {
        "key": "category",
        "label": "Category",
        "required": False,
        "options": [
            "Fresher", "Career Gap", "Job Switch", "Pursuing Student",
            "Currently Working in HR",
            "Currently Working in other field (Job Switch)",
            "Recently relieved from HR Job",
            "Recently relieved from other Job",
            "Not Worked", "Experienced i HR + Career Gap",
        ],
    },
]


def _seed_config() -> InductionFormConfig:
    return InductionFormConfig(
        fields=[
            InductionFormField(
                key=item["key"],
                label=item["label"],
                required=item["required"],
                order=index,
                options=item["options"],
            )
            for index, item in enumerate(_SEED_FIELDS)
        ]
    )


class InductionFormConfigRepository:
    async def get_or_create(self) -> InductionFormConfig:
        config = await InductionFormConfig.find_one({})
        if config is None:
            config = _seed_config()
            await config.insert()
        return config

    async def save(self, config: InductionFormConfig) -> InductionFormConfig:
        config.touch()
        # Targeted $set rather than a full-document replace, matching
        # FoundationFormConfigRepository: during a rolling deploy a worker on
        # the previous release would otherwise drop any field it doesn't know.
        await config.set(
            {
                InductionFormConfig.fields: config.fields,
                InductionFormConfig.updated_at: config.updated_at,
                InductionFormConfig.updated_by: config.updated_by,
            }
        )
        return config
