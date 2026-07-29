"""Fixed pricing/copy for the public Foundation Form.

Single source of truth for both rendering the form's info boxes (via the
pricing endpoint) and validating a submission server-side, so the client
can never submit an out-of-policy price. Business-defined figures, not
derived from anything - change here if the offer changes.
"""
from app.models.enums import PaymentPlanOption, ProgramInterest

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
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹10,000 (₹5,000 Per Month)",
                "after_placement": "₹8,500",
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹1,500 Per week & 4th Week Alone ₹2,000",
                "after_placement": "₹10,000",
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
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹15,000 (₹7,500 Per Month)",
                "after_placement": "₹3,500",
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹2,500 Per Week",
                "after_placement": "₹5,000",
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
            },
            PaymentPlanOption.TWO_SHOT: {
                "label": "Two shot payment",
                "summary": "₹18,500 (₹9,250 Per Month)",
                "after_placement": "NIL",
            },
            PaymentPlanOption.EMI_6_WEEKS: {
                "label": "EMI - 6 Weeks",
                "summary": "₹3,300 Per Week & 6th week ₹3,000",
                "after_placement": "NIL",
            },
        },
    },
}
