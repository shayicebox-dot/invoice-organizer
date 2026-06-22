"""Configuration for the Klaviyo email builder.

Values come from environment variables (so secrets stay out of the repo) with
sensible defaults. ``ANTHROPIC_API_KEY`` and ``KLAVIYO_API_KEY`` are required at
run time; everything else can be overridden by env var or CLI flag.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Config:
    klaviyo_api_key: str
    brand: str
    product: str
    language: str
    from_email: str
    from_label: str
    list_name: str | None
    list_id: str | None
    cta_url: str | None

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            klaviyo_api_key=os.environ.get("KLAVIYO_API_KEY", ""),
            brand=os.environ.get("BRAND_NAME", "kickbox"),
            product=os.environ.get("PRODUCT_NAME", "kickbox"),
            language=os.environ.get("EMAIL_LANGUAGE", "he"),
            from_email=os.environ.get("FROM_EMAIL", ""),
            from_label=os.environ.get("FROM_LABEL", os.environ.get("BRAND_NAME", "kickbox")),
            list_name=os.environ.get("KLAVIYO_LIST_NAME") or None,
            list_id=os.environ.get("KLAVIYO_LIST_ID") or None,
            cta_url=os.environ.get("CTA_URL") or None,
        )
