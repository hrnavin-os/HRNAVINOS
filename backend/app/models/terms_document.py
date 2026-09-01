"""TermsDocument — the singleton Terms & Conditions text students sign.

One document, fetched with find_one({}) and created on first read, exactly as
the two form configs are. It is a singleton because there is one set of terms
in force at a time: giving it an id and a list would invite two of them, and
then "who has signed" would have no answer.

Kept in the ERP rather than as a file passed around on WhatsApp so the person
chasing signatures can see the wording they are chasing agreement to, and so
changing it is an edit somebody makes here rather than a new attachment nobody
knows superseded the last one.
"""
from pydantic import Field

from app.database.base import BaseDocument


class TermsDocument(BaseDocument):
    title: str = Field(default="Terms & Conditions", max_length=200)
    # Plain text, not HTML: it is read back into a <pre>-like block, and
    # accepting markup here would mean sanitising it everywhere it is shown.
    body: str = Field(default="", max_length=20000)

    class Settings:
        name = "terms_document"

    def __repr__(self) -> str:
        return f"<TermsDocument {self.title!r} {len(self.body)} chars>"
