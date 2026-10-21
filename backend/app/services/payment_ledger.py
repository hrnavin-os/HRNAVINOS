"""A lead's payment collection, as the list stored in Lead.installments.

The plan (single shot, two shot, EMI) prices the fee; it no longer dictates
how the money comes in. What is collected is recorded as it arrives:

    [token?] [payment, payment, ...] [balance?]

- token   - optional, taken up front to hold the seat. At most one, first.
- payment - each amount actually received, numbered in the order recorded.
- balance - what is still owed, carrying the date the student promised it for
            and any remark about it. Last, and only there while it is owed.

Received entries have `amount == received_amount` and `paid=True`, and the
balance is `fee - received`, so the amounts always add up to the fee. That is
the invariant the readers rely on: the fee is the sum of `amount`, collected is
the sum of `collected()`, the due date is the unpaid entry's `scheduled_at`, and
fully paid is every entry paid - exactly what they read off the old plan slots,
which is why the dashboards, reminders, cashbook and batch confirmation needed
no change.

The old shape was one slot per plan installment (Week 1..6, Payment 1/2), each
priced up front. `to_ledger` converts it, and the startup backfill runs that
over every lead once.
"""
from decimal import Decimal

from app.models.enums import PaymentEntryKind
from app.models.lead import PaymentInstallment

TOKEN_LABEL = "Token Amount"
BALANCE_LABEL = "Balance Due"

RECEIVED_KINDS = (PaymentEntryKind.TOKEN, PaymentEntryKind.PAYMENT)


def is_ledger(entries: list[PaymentInstallment]) -> bool:
    """Whether these are already in the free-form shape. An empty list is -
    there is nothing to convert."""
    return all(entry.kind for entry in entries)


def fee_of(entries: list[PaymentInstallment]) -> Decimal:
    return sum((Decimal(entry.amount or 0) for entry in entries), Decimal(0))


def received_of(entries: list[PaymentInstallment]) -> Decimal:
    return sum((entry.collected() for entry in entries if entry.kind in RECEIVED_KINDS), Decimal(0))


def balance_of(entries: list[PaymentInstallment]) -> PaymentInstallment | None:
    return next((entry for entry in entries if entry.kind == PaymentEntryKind.BALANCE), None)


def rebalance(entries: list[PaymentInstallment], fee: Decimal) -> list[PaymentInstallment]:
    """Puts the entries back in order and works the balance out again against
    `fee`. The balance keeps its promised date and remark - those are about the
    money still owed, not about how much of it there is."""
    token = [entry for entry in entries if entry.kind == PaymentEntryKind.TOKEN][:1]
    payments = [entry for entry in entries if entry.kind == PaymentEntryKind.PAYMENT]
    for number, entry in enumerate(payments, start=1):
        entry.label = f"Payment {number}"
    for entry in token:
        entry.label = TOKEN_LABEL
    ledger = [*token, *payments]
    due = Decimal(fee) - received_of(ledger)
    if due > 0:
        previous = balance_of(entries)
        ledger.append(
            PaymentInstallment(
                kind=PaymentEntryKind.BALANCE,
                label=BALANCE_LABEL,
                amount=due,
                scheduled_at=previous.scheduled_at if previous else None,
                remarks=previous.remarks if previous else None,
            )
        )
    return ledger


def opening_ledger(fee: Decimal) -> list[PaymentInstallment]:
    """A plan nobody has paid anything against yet: the whole fee, due."""
    return rebalance([], fee)


def to_ledger(entries: list[PaymentInstallment]) -> list[PaymentInstallment]:
    """The free-form collection for a lead, converting old plan slots.

    Every slot with money on it becomes a payment of what was received, in plan
    order, keeping its mode, account, proofs and remark. Whatever the slots
    still had owing becomes the balance, due on the earliest date one of them
    was promised for. A slot with details typed in but no money recorded (a
    mode with no proof yet) carried nothing collected, so it is not kept - the
    startup backfill saves the original slots before converting.
    """
    if is_ledger(entries):
        return [entry.model_copy(deep=True) for entry in entries]
    fee = fee_of(entries)
    payments = []
    for entry in entries:
        got = entry.collected()
        if got <= 0:
            continue
        payments.append(
            entry.model_copy(
                deep=True,
                update={
                    "kind": PaymentEntryKind.PAYMENT,
                    "amount": got,
                    "received_amount": got,
                    "paid": True,
                    "scheduled_at": None,
                },
            )
        )
    promised = sorted(entry.scheduled_at for entry in entries if not entry.paid and entry.scheduled_at)
    seed = PaymentInstallment(
        kind=PaymentEntryKind.BALANCE,
        label=BALANCE_LABEL,
        scheduled_at=promised[0] if promised else None,
    )
    return rebalance([*payments, seed], fee)
