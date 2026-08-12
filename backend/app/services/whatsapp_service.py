"""Sending WhatsApp messages through Meta's Cloud API.

WHAT THIS CAN AND CANNOT DO
---------------------------
It can send a message to a candidate, so the HR board's Send invite button
delivers the invite by itself rather than opening WhatsApp for a coordinator to
press send in.

It cannot add anybody to a group. No WhatsApp API - Cloud API, On-Premises or
any Business Solution Provider on top of them - exposes group membership, and
none emits a join event to subscribe to. The invite link is therefore the
payload of the message, and the candidate still taps it themselves; the ERP
learns they joined only when a coordinator records it.

TEMPLATES ARE NOT OPTIONAL
--------------------------
WhatsApp only lets a business open a conversation with a template that Meta has
approved in advance. An invite is always the business speaking first, so a
free-form message would be rejected outside the 24-hour window that a
candidate's own reply would open. The template is expected to carry two
variables, in this order:

    {{1}} the candidate's name
    {{2}} the group invite link

WHEN NOT CONFIGURED
-------------------
Every method degrades to `configured = False` rather than raising, and the
caller falls back to the wa.me deep link. Half-configured credentials must not
take the HR board down with them - a coordinator who cannot send automatically
should still be able to send.
"""
import logging
import re

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

_NON_DIGITS = re.compile(r"\D")

# Meta rejects a request that hangs around, and the HR board is waiting on this
# call inside a request of its own - so it fails fast and falls back rather
# than leaving somebody looking at a spinner.
TIMEOUT_SECONDS = 10.0


class WhatsAppSendResult:
    """Outcome of one send attempt.

    `delivered` is False for both "not configured" and "the API refused",
    because the caller does the same thing either way - falls back to the
    manual link - but `error` distinguishes them for the audit trail.
    """

    def __init__(self, *, delivered: bool, error: str | None = None, message_id: str | None = None) -> None:
        self.delivered = delivered
        self.error = error
        self.message_id = message_id


def to_e164(phone: str | None) -> str | None:
    """Digits only, with a country code, which is the only form the API takes.

    A number stored as the bare ten digits gets the configured default. Numbers
    that already carry a country code are left alone - the length is what tells
    them apart, since an Indian subscriber number is always ten.
    """
    if not phone:
        return None
    digits = _NON_DIGITS.sub("", phone)
    if not digits:
        return None
    if len(digits) == 10:
        return f"{settings.WHATSAPP_DEFAULT_COUNTRY_CODE}{digits}"
    return digits


class WhatsAppService:
    @property
    def configured(self) -> bool:
        return settings.whatsapp_configured

    async def send_group_invite(self, *, phone: str, name: str, group_url: str) -> WhatsAppSendResult:
        """Sends the approved invite template to one candidate."""
        if not self.configured:
            return WhatsAppSendResult(delivered=False, error="not_configured")

        to = to_e164(phone)
        if not to:
            return WhatsAppSendResult(delivered=False, error="no_phone_number")

        url = (
            f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/"
            f"{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
        )
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": settings.WHATSAPP_TEMPLATE_NAME,
                "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": name},
                            {"type": "text", "text": group_url},
                        ],
                    }
                ],
            },
        }

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
                )
        except httpx.HTTPError as exc:
            # Logged rather than raised: a candidate whose invite didn't go out
            # must stay on the board as Not Invited, which is exactly what
            # returning a failure achieves. Raising would lose the row.
            logger.warning("WhatsApp send failed for %s: %s", to, exc)
            return WhatsAppSendResult(delivered=False, error=str(exc))

        if response.status_code >= 400:
            # Meta puts the useful part in error.message; the status alone says
            # nothing about which of template, token or number was wrong.
            detail = response.text
            try:
                detail = response.json().get("error", {}).get("message", detail)
            except ValueError:
                pass
            logger.warning("WhatsApp API rejected send for %s: %s", to, detail)
            return WhatsAppSendResult(delivered=False, error=detail)

        message_id = None
        try:
            message_id = response.json()["messages"][0]["id"]
        except (ValueError, KeyError, IndexError):
            pass
        return WhatsAppSendResult(delivered=True, message_id=message_id)
