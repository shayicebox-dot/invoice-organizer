"""AI email content generation via the Claude API.

Given a short brief (topic) for a product/brand, asks Claude to write the
marketing email copy — subject line, preview text, headline, body blocks and a
call-to-action — and returns it as a structured ``EmailContent`` object.

The model only writes the *content*; the HTML is rendered from a fixed,
email-client-safe template (``render_html``) so the markup is always valid.

Requires ``ANTHROPIC_API_KEY`` in the environment (read automatically by the
Anthropic SDK).
"""

from __future__ import annotations

import html
import json
from dataclasses import dataclass

import anthropic

# Opus 4.8 — strongest model for marketing copy. Override per call if needed.
MODEL = "claude-opus-4-8"

# JSON schema the model must fill. Structured outputs guarantee valid JSON back.
EMAIL_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "preview_text": {"type": "string"},
        "headline": {"type": "string"},
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["heading", "paragraph"]},
                    "text": {"type": "string"},
                },
                "required": ["type", "text"],
                "additionalProperties": False,
            },
        },
        "cta_text": {"type": "string"},
    },
    "required": ["subject", "preview_text", "headline", "blocks", "cta_text"],
    "additionalProperties": False,
}

SYSTEM = (
    "You are a senior email marketing copywriter for an e-commerce brand. "
    "You write concise, high-converting marketing emails with a clear single "
    "call-to-action. You avoid spammy language and ALL-CAPS, keep subject lines "
    "under ~50 characters, write a short preview text that complements (not "
    "repeats) the subject, and keep the body skimmable: a strong headline, a "
    "few short paragraphs, and one clear CTA. When asked to write in Hebrew, "
    "write natural native Hebrew (not translated-sounding)."
)


@dataclass
class EmailContent:
    """Structured marketing-email copy produced by the model."""

    subject: str
    preview_text: str
    headline: str
    blocks: list[dict]
    cta_text: str
    cta_url: str | None = None


def generate_email(
    topic: str,
    *,
    brand: str,
    product: str,
    language: str = "he",
    tone: str = "warm, energetic, trustworthy",
    audience: str = "existing and prospective customers",
    email_type: str = "newsletter",
    cta_url: str | None = None,
    model: str = MODEL,
) -> EmailContent:
    """Generate marketing-email copy for ``topic``.

    ``email_type`` is a free-text hint (e.g. ``"newsletter"``, ``"promotion"``,
    ``"abandoned cart"``) that steers the copy.
    """
    client = anthropic.Anthropic()

    lang_name = {"he": "Hebrew", "en": "English"}.get(language, language)
    user_prompt = (
        f"Write a {email_type} marketing email in {lang_name}.\n"
        f"Brand: {brand}\n"
        f"Product / category: {product}\n"
        f"Topic / brief: {topic}\n"
        f"Audience: {audience}\n"
        f"Tone: {tone}\n"
        "Produce: a subject line, preview text, a headline, 2-4 short body "
        "blocks (heading/paragraph), and a short call-to-action label. "
        "Center everything on the product/category above."
    )

    resp = client.messages.create(
        model=model,
        max_tokens=4000,
        system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": EMAIL_SCHEMA}},
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(text)
    return EmailContent(
        subject=data["subject"],
        preview_text=data["preview_text"],
        headline=data["headline"],
        blocks=data["blocks"],
        cta_text=data["cta_text"],
        cta_url=cta_url,
    )


def render_html(content: EmailContent, *, language: str = "he") -> str:
    """Render ``content`` into a responsive, email-client-safe HTML document."""
    rtl = language == "he"
    direction = "rtl" if rtl else "ltr"
    align = "right" if rtl else "left"

    parts: list[str] = []
    for block in content.blocks:
        text = html.escape(block["text"])
        if block["type"] == "heading":
            parts.append(
                f'<h2 style="margin:24px 0 8px;font-size:20px;color:#111;">{text}</h2>'
            )
        else:
            parts.append(
                '<p style="margin:0 0 16px;font-size:16px;line-height:1.6;'
                f'color:#333;">{text}</p>'
            )
    body_html = "\n".join(parts)

    cta_html = ""
    if content.cta_text:
        href = html.escape(content.cta_url or "#")
        cta_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'style="margin:24px 0;"><tr><td style="border-radius:6px;'
            f'background:#1a7f5a;">'
            f'<a href="{href}" style="display:inline-block;padding:14px 28px;'
            f'font-size:16px;color:#ffffff;text-decoration:none;font-weight:bold;">'
            f'{html.escape(content.cta_text)}</a></td></tr></table>'
        )

    headline = html.escape(content.headline)
    preview = html.escape(content.preview_text)

    return f"""<!DOCTYPE html>
<html lang="{language}" dir="{direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{headline}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">{preview}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:#f4f4f5;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;
                    overflow:hidden;direction:{direction};text-align:{align};
                    font-family:Arial,Helvetica,sans-serif;">
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:26px;color:#111;">{headline}</h1>
            {body_html}
            {cta_html}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#fafafa;font-size:12px;
                     color:#888;">
            {{% unsubscribe %}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""
