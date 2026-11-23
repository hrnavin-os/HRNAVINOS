"""The rejoin question, asked the same way wherever a student is recorded: the
Induction Call Form, the Foundation Form, Create Lead and both boards' edits."""
from pydantic import BaseModel, Field, model_validator


class RejoinAnswer(BaseModel):
    """Whether this student was here before and, if so, in which batch.

    Two fields on the way in because that is how it is asked - a checkbox, then
    the old batch number - but only the batch is stored (`rejoin_batch`): a
    student is a rejoin exactly when they have an old batch, so the two can't
    come to disagree.
    """

    # None means the question wasn't asked, which on an update leaves whatever
    # is stored alone; False is an answer, and clears it.
    is_rejoin: bool | None = None
    # The number alone (30); shown after the name as "Rejoin-30".
    rejoin_batch: int | None = Field(default=None, ge=1, le=999999)

    @model_validator(mode="after")
    def check_rejoin_has_batch(self) -> "RejoinAnswer":
        if self.is_rejoin and self.rejoin_batch is None:
            raise ValueError("Enter the old batch number of a rejoining student.")
        return self

    @property
    def old_batch(self) -> int | None:
        """The batch to store. An unticked box discards a number left in the
        field under it."""
        return self.rejoin_batch if self.is_rejoin else None


def resolve_rejoin_update(update_data: dict) -> bool:
    """Turns the answer in an update's dumped fields into the stored one, in
    place. True if the update answers the question at all."""
    asked = update_data.pop("is_rejoin", None)
    batch = update_data.pop("rejoin_batch", None)
    if asked is None:
        return False
    update_data["rejoin_batch"] = batch if asked else None
    return True
