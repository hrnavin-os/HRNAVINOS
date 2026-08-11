"""Mobile-number normalization.

The mobile number is the identity that links an Induction Call Form entry to
the Foundation Form submission the same person makes later. The two are typed
by different people at different times - one by staff from a WhatsApp message,
one by the student themselves - so the same number routinely arrives in
different shapes:

    9876543210
    +91 9876543210
    +919876543210
    98765 43210
    098765 43210

A raw string comparison treats those as five different people. Everything that
matches on a number goes through `normalize_phone` first, and the normalized
form is what gets stored and indexed.
"""
import re

_NON_DIGITS = re.compile(r"\D")

# Indian subscriber numbers are 10 digits. Anything longer is carrying a
# country code (+91 / 91) or a trunk prefix (0), both of which are positional
# prefixes - so the subscriber number is always the last 10.
SUBSCRIBER_DIGITS = 10


def normalize_phone(raw: str | None) -> str | None:
    """The comparable form of a mobile number, or None if there isn't one.

    Strips every non-digit (spaces, +, -, brackets) and then drops any leading
    country code or trunk prefix by keeping the last 10 digits.

    Returns None rather than "" for input with no digits at all, so a missing
    number is falsy and never matches another missing number - two leads with
    no phone are not the same person.

    Numbers shorter than 10 digits are kept whole rather than padded or
    rejected: they're almost certainly a typo, and truncating them further
    would make unrelated typos collide.
    """
    if not raw:
        return None
    digits = _NON_DIGITS.sub("", raw)
    if not digits:
        return None
    if len(digits) > SUBSCRIBER_DIGITS:
        digits = digits[-SUBSCRIBER_DIGITS:]
    return digits
