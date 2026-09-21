"""Which foundation class group somebody is in.

Recorded, not derived. This used to be a function of the date - the 1st-15th
was Group 1 and the 16th onward Group 2 - on the reasoning that which sitting
somebody came through is a fact about when, not a decision anybody makes. That
turned out to be wrong twice over: there are three groups, not two halves of a
month, and students are moved between them. A rule that reads a date can be
told about neither.

So the group is asked for on the Induction Call Form, stored on the entry,
carried onto the Foundation lead when the two are linked, and editable on the
boards that show it. Every move is kept beside it (FoundationGroupMove in
app/models/foundation_group.py), because "moved to Group 2 from Group 1" is the
part people actually need to read.

What is left here is the small vocabulary the rest of the app shares: the
default set of groups, how a group is written down, and how the label a form
sends is read back into the number that is stored.
"""
from app.exceptions.base import BadRequestError

# The groups the Induction Call Form offers out of the box. Only a default:
# the real list is the `group` field's options in the form config, which an
# admin edits, so nothing here refuses a fourth group the day one is added.
# This is what the boards' filter dropdowns fall back to.
FOUNDATION_GROUPS = (1, 2, 3)

# An upper bound on what can be stored, not on how many groups there can be.
# It exists so a date or a phone number typed into the box is refused as the
# mistake it is rather than filed as group 2026.
MAX_FOUNDATION_GROUP = 99


def foundation_group_label(group: int | None) -> str:
    """"Group 2", or "" for a row that has no group yet."""
    return f"Group {group}" if group else ""


def parse_foundation_group(value: str | int | None) -> int | None:
    """The number behind whatever the form sent.

    Takes "Group 2", "group2", "2" and 2 alike, because the form sends the
    label an admin typed into the options box and there is no reason to make
    the two agree on punctuation. Blank means "not said", which is a legitimate
    answer while the field is optional.

    Anything else raises rather than being dropped: a group that silently
    failed to save would put the student in no class at all, and the person who
    picked one would have no way of knowing.
    """
    if value is None:
        return None
    if isinstance(value, bool):  # bool is an int; "group True" is not a group.
        raise BadRequestError("Pick a group, for example Group 1.")
    if isinstance(value, int):
        number = value
    else:
        digits = "".join(character for character in str(value) if character.isdigit())
        if not str(value).strip():
            return None
        if not digits:
            raise BadRequestError(f'"{value}" doesn\'t name a group. Use Group 1, Group 2 or Group 3.')
        # The whole run of digits, not a prefix of it: "2026" has to fail
        # the bound below as the year it is, rather than pass as group 20.
        number = int(digits) if len(digits) <= 4 else MAX_FOUNDATION_GROUP + 1
    if not 1 <= number <= MAX_FOUNDATION_GROUP:
        raise BadRequestError(f"Group {number} isn't a group. Use Group 1, Group 2 or Group 3.")
    return number
