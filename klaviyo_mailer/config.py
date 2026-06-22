"""Configuration for the Klaviyo email builder.

Values come from environment variables (so secrets stay out of the repo) with
sensible defaults. ``ANTHROPIC_API_KEY`` and ``KLAVIYO_API_KEY`` are required at
run time; everything else can be overridden by env var or CLI flag.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


# Default brand profile for Kicksbox (kicksboxx.com). The brief is fed to the
# model so the copy stays accurate and on-brand. Override any of these via env.
DEFAULT_BRAND = "Kicksbox"
DEFAULT_PRODUCT = "clear stackable magnetic sneaker display boxes"
DEFAULT_BRAND_BRIEF = (
    "Kicksbox (kicksboxx.com) sells premium clear, stackable, magnetic "
    "drop-front acrylic display boxes for sneaker collectors. Built from 3mm "
    "reinforced acrylic with load-bearing corners and high-strength magnetic "
    "doors; UV-blocking to shield shoes from sunlight; keeps sneakers dust-free "
    "and on display; fits up to US men's size 13 (27cm tall). Sold in bundles: "
    "10-Box Starter (small collections), 20-Box Favorite (growing collections), "
    "and 50-Box Full Wall (serious collectors). Free, fast USA shipping. "
    "Audience: sneakerheads who want to protect and show off their grails. "
    "Voice: streetwear/collector culture, premium but hyped."
)
DEFAULT_CTA_URL = "https://kicksboxx.com/collections/shoebox"


@dataclass
class Config:
    klaviyo_api_key: str
    brand: str
    product: str
    brand_brief: str
    language: str
    from_email: str
    from_label: str
    list_name: str | None
    list_id: str | None
    cta_url: str | None

    @classmethod
    def from_env(cls) -> "Config":
        brand = os.environ.get("BRAND_NAME", DEFAULT_BRAND)
        return cls(
            klaviyo_api_key=os.environ.get("KLAVIYO_API_KEY", ""),
            brand=brand,
            product=os.environ.get("PRODUCT_NAME", DEFAULT_PRODUCT),
            brand_brief=os.environ.get("BRAND_BRIEF", DEFAULT_BRAND_BRIEF),
            language=os.environ.get("EMAIL_LANGUAGE", "en"),
            from_email=os.environ.get("FROM_EMAIL", ""),
            from_label=os.environ.get("FROM_LABEL", brand),
            list_name=os.environ.get("KLAVIYO_LIST_NAME") or None,
            list_id=os.environ.get("KLAVIYO_LIST_ID") or None,
            cta_url=os.environ.get("CTA_URL", DEFAULT_CTA_URL) or None,
        )
