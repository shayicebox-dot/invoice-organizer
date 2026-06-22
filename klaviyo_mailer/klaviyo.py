"""Minimal Klaviyo API client for creating email templates and campaigns.

Wraps the parts of the Klaviyo REST API (JSON:API style) needed to:

- look up lists/segments,
- create a reusable HTML template,
- create an email campaign and assign the template to it,
- optionally schedule or send the campaign.

Auth uses a private API key (``pk_...``) passed as ``KLAVIYO_API_KEY``.

The API is versioned by a ``revision`` date header; ``REVISION`` below is
pinned to a known-good value. If Klaviyo changes a payload shape, bump it and
adjust the affected method — every request prints the response body on error
to make that easy.
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

BASE_URL = "https://a.klaviyo.com/api"
REVISION = "2024-10-15"


class KlaviyoError(RuntimeError):
    """Raised when the Klaviyo API returns a non-2xx response."""


@dataclass
class Campaign:
    """Identifiers returned after creating a campaign."""

    campaign_id: str
    message_id: str


class KlaviyoClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Klaviyo API key is required (set KLAVIYO_API_KEY).")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Klaviyo-API-Key {api_key}",
                "revision": REVISION,
                "accept": "application/vnd.api+json",
                "content-type": "application/vnd.api+json",
            }
        )

    # -- low-level ---------------------------------------------------------

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{BASE_URL}{path}"
        resp = self.session.request(method, url, timeout=30, **kwargs)
        if not resp.ok:
            raise KlaviyoError(
                f"{method} {path} -> {resp.status_code}\n{resp.text}"
            )
        if resp.content and resp.headers.get("content-type", "").startswith(
            "application/vnd.api+json"
        ):
            return resp.json()
        return {}

    # -- lists -------------------------------------------------------------

    def get_lists(self) -> list[dict]:
        """Return all lists as ``[{"id", "name"}, ...]``."""
        data = self._request("GET", "/lists/")
        return [
            {"id": item["id"], "name": item["attributes"]["name"]}
            for item in data.get("data", [])
        ]

    def find_list_id(self, name: str) -> str | None:
        for lst in self.get_lists():
            if lst["name"].strip().lower() == name.strip().lower():
                return lst["id"]
        return None

    # -- templates ---------------------------------------------------------

    def create_template(self, name: str, html: str) -> str:
        """Create a reusable HTML template and return its id."""
        payload = {
            "data": {
                "type": "template",
                "attributes": {
                    "name": name,
                    "editor_type": "CODE",
                    "html": html,
                },
            }
        }
        data = self._request("POST", "/templates/", json=payload)
        return data["data"]["id"]

    # -- campaigns ---------------------------------------------------------

    def create_campaign(
        self,
        *,
        name: str,
        list_id: str,
        subject: str,
        preview_text: str,
        from_email: str,
        from_label: str,
        schedule_datetime: str | None = None,
        send_now: bool = False,
    ) -> Campaign:
        """Create an email campaign targeting ``list_id``.

        With neither ``schedule_datetime`` nor ``send_now`` the campaign is left
        as a draft (review and send from the Klaviyo UI). ``schedule_datetime``
        is an ISO-8601 string in the account timezone.
        """
        attributes: dict = {
            "name": name,
            "audiences": {"included": [list_id], "excluded": []},
            "campaign-messages": {
                "data": [
                    {
                        "type": "campaign-message",
                        "attributes": {
                            "definition": {
                                "channel": "email",
                                "label": name,
                                "content": {
                                    "subject": subject,
                                    "preview_text": preview_text,
                                    "from_email": from_email,
                                    "from_label": from_label,
                                },
                            }
                        },
                    }
                ]
            },
        }

        if send_now:
            attributes["send_strategy"] = {"method": "immediate"}
        elif schedule_datetime:
            attributes["send_strategy"] = {
                "method": "static",
                "datetime": schedule_datetime,
                "options": {"is_local": False, "send_past_recipients_immediately": False},
            }

        payload = {"data": {"type": "campaign", "attributes": attributes}}
        data = self._request("POST", "/campaigns/", json=payload)

        campaign_id = data["data"]["id"]
        message_id = data["data"]["relationships"]["campaign-messages"]["data"][0]["id"]
        return Campaign(campaign_id=campaign_id, message_id=message_id)

    def assign_template(self, message_id: str, template_id: str) -> None:
        """Attach a template to a campaign message."""
        payload = {
            "data": {
                "type": "campaign-message",
                "id": message_id,
                "relationships": {
                    "template": {"data": {"type": "template", "id": template_id}}
                },
            }
        }
        self._request("POST", "/campaign-message-assign-template/", json=payload)

    def create_send_job(self, campaign_id: str) -> None:
        """Trigger the send (per the campaign's send strategy)."""
        payload = {"data": {"type": "campaign-send-job", "id": campaign_id}}
        self._request("POST", "/campaign-send-jobs/", json=payload)

    # -- flows (automations) ----------------------------------------------

    def get_flows(self) -> list[dict]:
        """Return existing flows as ``[{"id", "name", "status"}, ...]``."""
        data = self._request("GET", "/flows/")
        return [
            {
                "id": item["id"],
                "name": item["attributes"].get("name", ""),
                "status": item["attributes"].get("status", ""),
            }
            for item in data.get("data", [])
        ]
