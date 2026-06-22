"""Build Klaviyo emails with AI-written content.

Generates marketing-email copy with Claude, renders it to HTML, uploads it as a
Klaviyo template, and (for campaigns) creates the campaign in Klaviyo.

By default a campaign is created as a DRAFT — nothing is sent until you review
it in Klaviyo and hit send, or you explicitly pass --send-now / --schedule.

Examples:
    # Draft a newsletter campaign to a named list
    python -m klaviyo_mailer.cli campaign \\
        --topic "מבצע סוף עונה על קו ה-kickbox" --list-name "Newsletter"

    # Schedule it
    python -m klaviyo_mailer.cli campaign --topic "..." \\
        --list-id ABC123 --schedule "2026-06-25T09:00:00"

    # Build a reusable template for an abandoned-cart flow (attach it in Klaviyo)
    python -m klaviyo_mailer.cli flow-template \\
        --topic "תזכורת עגלה נטושה - kickbox" --email-type "abandoned cart"

    # List your Klaviyo lists / flows
    python -m klaviyo_mailer.cli lists
    python -m klaviyo_mailer.cli flows
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from . import content as content_mod
from .config import Config
from .klaviyo import KlaviyoClient, KlaviyoError


def _client(cfg: Config) -> KlaviyoClient:
    return KlaviyoClient(cfg.klaviyo_api_key)


def _resolve_list_id(client: KlaviyoClient, cfg: Config, args) -> str:
    list_id = getattr(args, "list_id", None) or cfg.list_id
    if list_id:
        return list_id
    list_name = getattr(args, "list_name", None) or cfg.list_name
    if list_name:
        resolved = client.find_list_id(list_name)
        if not resolved:
            sys.exit(f"No Klaviyo list named {list_name!r} found. Try: cli lists")
        return resolved
    sys.exit("Provide --list-id or --list-name (or set KLAVIYO_LIST_ID/NAME).")


def _template_name(cfg: Config, args) -> str:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"{cfg.brand} - {args.email_type} - {stamp}"


def cmd_lists(cfg: Config, args) -> None:
    for lst in _client(cfg).get_lists():
        print(f"{lst['id']}\t{lst['name']}")


def cmd_flows(cfg: Config, args) -> None:
    for flow in _client(cfg).get_flows():
        print(f"{flow['id']}\t{flow['status']}\t{flow['name']}")


def cmd_campaign(cfg: Config, args) -> None:
    if not cfg.from_email:
        sys.exit("FROM_EMAIL is required to create a campaign (set it in the env).")

    client = _client(cfg)
    list_id = _resolve_list_id(client, cfg, args)

    print("Generating email copy with Claude...")
    email = content_mod.generate_email(
        args.topic,
        brand=cfg.brand,
        product=cfg.product,
        brand_brief=cfg.brand_brief,
        language=cfg.language,
        email_type=args.email_type,
        cta_url=args.cta_url or cfg.cta_url,
    )
    print(f"  subject: {email.subject}")

    html = content_mod.render_html(email, language=cfg.language)

    print("Uploading template to Klaviyo...")
    template_id = client.create_template(_template_name(cfg, args), html)

    print("Creating campaign...")
    campaign = client.create_campaign(
        name=_template_name(cfg, args),
        list_id=list_id,
        subject=email.subject,
        preview_text=email.preview_text,
        from_email=cfg.from_email,
        from_label=cfg.from_label,
        schedule_datetime=args.schedule,
        send_now=args.send_now,
    )
    client.assign_template(campaign.message_id, template_id)

    if args.send_now or args.schedule:
        client.create_send_job(campaign.campaign_id)
        when = "now" if args.send_now else f"at {args.schedule}"
        print(f"Campaign {campaign.campaign_id} queued to send {when}.")
    else:
        print(
            f"Draft campaign {campaign.campaign_id} created. "
            "Review and send it from the Klaviyo dashboard."
        )


def cmd_flow_template(cfg: Config, args) -> None:
    client = _client(cfg)

    print("Generating email copy with Claude...")
    email = content_mod.generate_email(
        args.topic,
        brand=cfg.brand,
        product=cfg.product,
        brand_brief=cfg.brand_brief,
        language=cfg.language,
        email_type=args.email_type,
        cta_url=args.cta_url or cfg.cta_url,
    )
    print(f"  subject: {email.subject}")

    html = content_mod.render_html(email, language=cfg.language)
    template_id = client.create_template(_template_name(cfg, args), html)
    print(
        f"Template {template_id} created. In Klaviyo, open your "
        f"{args.email_type!r} flow, edit the email message, and choose "
        "'Use existing template' to attach it."
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build Klaviyo emails with AI content.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("lists", help="List Klaviyo lists (id and name).")
    sub.add_parser("flows", help="List Klaviyo flows (id, status, name).")

    def add_content_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--topic", required=True, help="Brief / theme for the email.")
        p.add_argument("--email-type", default="newsletter",
                       help="newsletter | promotion | abandoned cart | ...")
        p.add_argument("--cta-url", default=None, help="Call-to-action link.")

    c = sub.add_parser("campaign", help="Create a campaign (draft by default).")
    add_content_args(c)
    c.add_argument("--list-id", default=None)
    c.add_argument("--list-name", default=None)
    g = c.add_mutually_exclusive_group()
    g.add_argument("--send-now", action="store_true", help="Send immediately.")
    g.add_argument("--schedule", default=None, help="ISO datetime, e.g. 2026-06-25T09:00:00")

    f = sub.add_parser("flow-template", help="Build a template for a flow/automation.")
    add_content_args(f)

    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    cfg = Config.from_env()

    handlers = {
        "lists": cmd_lists,
        "flows": cmd_flows,
        "campaign": cmd_campaign,
        "flow-template": cmd_flow_template,
    }
    try:
        handlers[args.command](cfg, args)
    except KlaviyoError as exc:
        sys.exit(f"Klaviyo API error:\n{exc}")


if __name__ == "__main__":
    main()
