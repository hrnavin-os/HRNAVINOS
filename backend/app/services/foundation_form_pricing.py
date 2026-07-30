"""Fixed pricing/copy for the public Foundation Form.

PROGRAM_LABELS / CATEGORY_BY_PROGRAM / PRICING below are the one-time seed
values for the FoundationFormConfig singleton (app/models/foundation_form_config.py,
app/repositories/foundation_form_config_repository.py) - the live source of
truth is that document, editable by admins at runtime, not these module
constants. They're kept here only so the seed data has one clear home.

get_plan_details() / build_installments() / build_payment_expected_summary()
take the current config as a parameter (instead of closing over these dicts)
so they always reflect whatever an admin has configured - shared by
Foundation Form submissions and manually assigning a plan to a CRM-created
lead, so amounts always match the course the student picked either way.
"""
from app.exceptions.base import BadRequestError
from app.models.enums import PaymentPlanOption, ProgramInterest
from app.models.foundation_form_config import FoundationFormCategory, FoundationFormConfig, FoundationFormPlan
from app.models.lead import PaymentInstallment

PROGRAM_LABELS: dict[ProgramInterest, str] = {
    ProgramInterest.ONLY_RECRUITMENT: "Only Recruitment",
    ProgramInterest.RECRUITMENT_INTERNSHIP: "Recruitment + Internship",
    ProgramInterest.RECRUITMENT_GENERALIST: "Recruitment + Generalist",
    ProgramInterest.RECRUITMENT_GENERALIST_INTERNSHIP: "Recruitment + Generalist + Internship",
}

# Page 2 groups programs into 3 pricing categories; the internship and
# generalist-only programs share one category.
CATEGORY_BY_PROGRAM: dict[ProgramInterest, str] = {
    ProgramInterest.ONLY_RECRUITMENT: "only_recruitment",
    ProgramInterest.RECRUITMENT_INTERNSHIP: "internship_or_generalist",
    ProgramInterest.RECRUITMENT_GENERALIST: "internship_or_generalist",
    ProgramInterest.RECRUITMENT_GENERALIST_INTERNSHIP: "generalist_internship",
}

PRICING: dict[str, dict] = {
    "only_recruitment": {
        "label": "Only Recruitment",
        "training_fee": "₹10,000",
        "after_placement_fee": "₹10,000",
        "plans": {
            PaymentPlanOption.SINGLE_SHOT: {
                "label": "Single shot",
                "summary": "₹10,000",
                "after_placement": "₹7,500",
                "amounts": [10000],
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹10,000 (₹5,000 Per Month)",
                "after_placement": "₹8,500",
                "amounts": [5000, 5000],
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹1,500 Per week & 4th Week Alone ₹2,000",
                "after_placement": "₹10,000",
                "amounts": [1500, 1500, 1500, 2000, 1500, 1500],
            },
        },
    },
    "internship_or_generalist": {
        "label": "HR Recruitment + Internship (OR) HR Recruitment + HR Generalist",
        "training_fee": "₹15,000",
        "after_placement_fee": "₹5,000",
        "plans": {
            PaymentPlanOption.SINGLE_SHOT: {
                "label": "Single shot",
                "summary": "₹15,000",
                "after_placement": "₹2,500",
                "amounts": [15000],
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹15,000 (₹7,500 Per Month)",
                "after_placement": "₹3,500",
                "amounts": [7500, 7500],
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹2,500 Per Week",
                "after_placement": "₹5,000",
                "amounts": [2500, 2500, 2500, 2500, 2500, 2500],
            },
        },
    },
    "generalist_internship": {
        "label": "HR Recruitment + HR Generalist + Internship Program",
        "training_fee": "₹20,000",
        "after_placement_fee": "NIL",
        "plans": {
            PaymentPlanOption.SINGLE_SHOT: {
                "label": "Single shot",
                "summary": "₹17,500",
                "after_placement": "NIL",
                "amounts": [17500],
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹18,500 (₹9,250 Per Month)",
                "after_placement": "NIL",
                "amounts": [9250, 9250],
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹3,300 Per Week & 6th week ₹3,000",
                "after_placement": "NIL",
                "amounts": [3300, 3300, 3300, 3300, 3300, 3000],
            },
        },
    },
}

# Not admin-editable: installment labels are structural, tied to plan type
# (how many installments it has), not content an admin would customize.
INSTALLMENT_LABELS: dict[PaymentPlanOption, list[str]] = {
    PaymentPlanOption.SINGLE_SHOT: ["Payment"],
    PaymentPlanOption.TWO_SHOT: ["Payment 1", "Payment 2"],
    PaymentPlanOption.EMI_6_WEEKS: [f"Week {n}" for n in range(1, 7)],
}


def get_category_for_program(config: FoundationFormConfig, program_interest: str) -> FoundationFormCategory:
    program_cfg = next((p for p in config.programs if p.value == program_interest), None)
    if program_cfg is None:
        raise BadRequestError("Selected program is not valid.")
    category = next((c for c in config.categories if c.code == program_cfg.category), None)
    if category is None:
        raise BadRequestError("Selected program's pricing category is not configured.")
    return category


def get_plan_details(config: FoundationFormConfig, program_interest: str, payment_plan: str) -> FoundationFormPlan:
    category = get_category_for_program(config, program_interest)
    plan = next((p for p in category.plans if p.value == payment_plan), None)
    if plan is None:
        raise BadRequestError("Selected payment plan is not valid for the chosen program.")
    return plan


def build_installments(
    config: FoundationFormConfig, program_interest: str, payment_plan: PaymentPlanOption
) -> list[PaymentInstallment]:
    plan = get_plan_details(config, program_interest, payment_plan)
    labels = INSTALLMENT_LABELS[payment_plan]
    return [PaymentInstallment(label=label, amount=amount) for label, amount in zip(labels, plan.amounts)]


def build_payment_expected_summary(config: FoundationFormConfig, program_interest: str, payment_plan: str) -> str:
    plan = get_plan_details(config, program_interest, payment_plan)
    return f"{plan.label} - {plan.summary} (After Placement: {plan.after_placement})"
