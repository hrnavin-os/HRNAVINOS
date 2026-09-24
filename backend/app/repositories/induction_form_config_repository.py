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
    # The batch number only ("20"); every board shows it as "Batch-20". No
    # options, so it renders as a plain number input on the first page.
    {"key": "batch", "label": "Batch Number", "required": True, "options": []},
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
    # Routes the entry: whichever section is picked is the section it is filed
    # under and whose admins it is assigned to. Resolved against the Form
    # Collection sections by InductionEntryService, so a listed option that
    # names no section is refused on submit rather than filed nowhere.
    {
        "key": "section",
        "label": "Section",
        "required": True,
        "options": ["A Section", "B Section", "C Section"],
    },
    # Which foundation class group the student sits in. Unlike every other
    # dropdown here the answer is read as a number rather than kept as text
    # (see parse_foundation_group), so the boards can filter and sort on it -
    # which means an option has to name a group: "Group 4" is fine, "Morning"
    # is not.
    #
    # Optional, unlike section. The group is often decided after the student is
    # keyed in, and a required field would force whoever is typing from
    # WhatsApp to guess one; it is set on the board in that case. Tick Required
    # in the editor if your intake always knows it up front.
    {
        "key": "group",
        "label": "Group",
        "required": False,
        "options": ["Group 1", "Group 2", "Group 3"],
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
        # A config saved before a field existed doesn't carry it - append the
        # missing seed fields at the end, once, so the form starts asking and
        # the editor's all-fields-present check keeps passing.
        present = {field.key for field in config.fields}
        missing = [item for item in _SEED_FIELDS if item["key"] not in present]
        if missing:
            start = max((field.order for field in config.fields), default=-1) + 1
            config.fields.extend(
                InductionFormField(
                    key=item["key"],
                    label=item["label"],
                    required=item["required"],
                    order=start + offset,
                    options=item["options"],
                )
                for offset, item in enumerate(missing)
            )
            await self.save(config)
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
