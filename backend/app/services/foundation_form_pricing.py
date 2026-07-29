"""Fixed pricing/copy for the public Foundation Form.

Single source of truth for both rendering the form's info boxes (via the
pricing endpoint) and validating a submission server-side, so the client
can never submit an out-of-policy price. Business-defined figures, not
derived from anything - change here if the offer changes.

Also the single source for building a lead's payment installments from a
(program, plan) pair, shared by Foundation Form submissions and manually
assigning a plan to a CRM-created lead - both go through the same pricing
so amounts always match the course the student picked.
"""
from decimal import Decimal

from app.exceptions.base import BadRequestError
from app.models.enums import PaymentPlanOption, ProgramInterest
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

INSTALLMENT_LABELS: dict[PaymentPlanOption, list[str]] = {
    PaymentPlanOption.SINGLE_SHOT: ["Payment"],
    PaymentPlanOption.TWO_SHOT: ["Payment 1", "Payment 2"],
    PaymentPlanOption.EMI_6_WEEKS: [f"Week {n}" for n in range(1, 7)],
}


def get_plan_details(program_interest: ProgramInterest, payment_plan: PaymentPlanOption) -> dict:
    category_code = CATEGORY_BY_PROGRAM[program_interest]
    plan = PRICING[category_code]["plans"].get(payment_plan)
    if plan is None:
        raise BadRequestError("Selected payment plan is not valid for the chosen program.")
    return plan


def build_installments(program_interest: ProgramInterest, payment_plan: PaymentPlanOption) -> list[PaymentInstallment]:
    plan = get_plan_details(program_interest, payment_plan)
    labels = INSTALLMENT_LABELS[payment_plan]
    return [PaymentInstallment(label=label, amount=Decimal(amount)) for label, amount in zip(labels, plan["amounts"])]


def build_payment_expected_summary(program_interest: ProgramInterest, payment_plan: PaymentPlanOption) -> str:
    plan = get_plan_details(program_interest, payment_plan)
    return f"{plan['label']} - {plan['summary']} (After Placement: {plan['after_placement']})"
