"""Gmail invoice organizer.

Run once a month: prompts for a YYYY-MM month, then searches Gmail for invoice
emails in that month, downloads PDF attachments into invoices/<YYYY-MM>/,
writes an Excel summary, and applies a Hebrew month label to the matched
threads.

Usage:
    python invoices.py
"""

from __future__ import annotations

import base64
import calendar
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from openpyxl import Workbook

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
]

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token.json"
ROOT_DIR = Path("invoices")

KEYWORDS = ["חשבונית", "חשבוניות", "חשבונית מס", "קבלה", "invoice", "receipt"]
SENDERS = [
    "billing@shopify.com",
    "billing@iranigroup.co.il",
    "notify@morning.co",
    "noreply@ezcount.co.il",
    "hfd.co.il",
    "donotreply@rivhit.co.il",
]

HEBREW_MONTHS = {
    1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל",
    5: "מאי", 6: "יוני", 7: "יולי", 8: "אוגוסט",
    9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
}

DOC_NUMBER_RE = re.compile(
    r"(?:חשבונית(?:\s*מס)?|קבלה|invoice|receipt|מס(?:פר)?|#)[\s:#-]*"
    r"([A-Z0-9\-]{3,})",
    re.IGNORECASE,
)


@dataclass
class InvoiceRow:
    date: str
    sender: str
    subject: str
    doc_number: str
    filename: str


def authenticate():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                sys.exit(
                    f"Missing {CREDENTIALS_FILE}. See README for the Google Cloud "
                    "OAuth setup steps."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def prompt_month() -> tuple[int, int]:
    while True:
        raw = input("Which month? (YYYY-MM): ").strip()
        try:
            dt = datetime.strptime(raw, "%Y-%m")
            return dt.year, dt.month
        except ValueError:
            print("Invalid format. Use YYYY-MM, e.g. 2026-03.")


def build_query(year: int, month: int) -> str:
    last_day = calendar.monthrange(year, month)[1]
    after = f"{year:04d}/{month:02d}/01"
    if month == 12:
        before = f"{year + 1:04d}/01/01"
    else:
        before = f"{year:04d}/{month + 1:02d}/01"
    _ = last_day  # kept for clarity

    keyword_q = " OR ".join(f'"{kw}"' for kw in KEYWORDS)
    sender_q = " OR ".join(f"from:{s}" for s in SENDERS)
    return f"after:{after} before:{before} (({keyword_q}) OR ({sender_q}))"


def list_messages(service, query: str):
    messages = []
    request = service.users().messages().list(userId="me", q=query, maxResults=500)
    while request is not None:
        response = request.execute()
        messages.extend(response.get("messages", []))
        request = service.users().messages().list_next(request, response)
    return messages


def header(headers, name):
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def parse_date(date_str: str) -> datetime:
    try:
        dt = parsedate_to_datetime(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def safe_filename(text: str, max_len: int = 80) -> str:
    text = re.sub(r"[\\/:*?\"<>|\r\n\t]", " ", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] or "untitled"


def collect_text_and_pdfs(payload):
    """Walk MIME parts, returning (concatenated_text, [(filename, attachmentId)])."""
    text_chunks: list[str] = []
    pdfs: list[tuple[str, str]] = []

    def walk(part):
        mime = part.get("mimeType", "")
        filename = part.get("filename") or ""
        body = part.get("body", {})
        if mime.startswith("multipart/"):
            for sub in part.get("parts", []) or []:
                walk(sub)
            return
        if filename and (
            filename.lower().endswith(".pdf") or mime == "application/pdf"
        ):
            att_id = body.get("attachmentId")
            if att_id:
                pdfs.append((filename, att_id))
            return
        if mime in ("text/plain", "text/html"):
            data = body.get("data")
            if data:
                try:
                    decoded = base64.urlsafe_b64decode(data).decode(
                        "utf-8", errors="ignore"
                    )
                    text_chunks.append(decoded)
                except Exception:
                    pass

    walk(payload)
    return "\n".join(text_chunks), pdfs


def extract_doc_number(subject: str, body_text: str) -> str:
    for source in (subject, body_text):
        if not source:
            continue
        m = DOC_NUMBER_RE.search(source)
        if m:
            return m.group(1).strip()
    return ""


def ensure_label(service, name: str) -> str:
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for lbl in labels:
        if lbl["name"] == name:
            return lbl["id"]
    body = {
        "name": name,
        "labelListVisibility": "labelShow",
        "messageListVisibility": "show",
        "color": {"backgroundColor": "#16a766", "textColor": "#ffffff"},
    }
    created = service.users().labels().create(userId="me", body=body).execute()
    return created["id"]


def download_attachment(service, msg_id: str, att_id: str) -> bytes:
    att = (
        service.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=msg_id, id=att_id)
        .execute()
    )
    return base64.urlsafe_b64decode(att["data"])


def process_month(service, year: int, month: int) -> None:
    folder = ROOT_DIR / f"{year:04d}-{month:02d}"
    folder.mkdir(parents=True, exist_ok=True)

    label_name = f"חשבוניות {HEBREW_MONTHS[month]} {year}"
    label_id = ensure_label(service, label_name)

    query = build_query(year, month)
    print(f"Gmail query: {query}")
    messages = list_messages(service, query)
    print(f"Found {len(messages)} matching messages.")

    rows: list[InvoiceRow] = []
    seen_files: set[str] = set()
    matched_msg_ids: list[str] = []

    for i, m in enumerate(messages, 1):
        try:
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=m["id"], format="full")
                .execute()
            )
        except HttpError as e:
            print(f"  [skip] failed to fetch {m['id']}: {e}")
            continue

        headers = msg.get("payload", {}).get("headers", [])
        subject = header(headers, "Subject")
        from_raw = header(headers, "From")
        date_hdr = header(headers, "Date")
        sender_name, sender_email = parseaddr(from_raw)
        sender = sender_email or sender_name or from_raw
        dt = parse_date(date_hdr)
        # Restrict to the requested month (Gmail's date filter is timezone-loose).
        if (dt.year, dt.month) != (year, month):
            continue

        body_text, pdfs = collect_text_and_pdfs(msg.get("payload", {}))
        matched_msg_ids.append(m["id"])

        if not pdfs:
            print(f"  [{i}/{len(messages)}] no PDFs: {subject[:60]}")
            continue

        doc_number = extract_doc_number(subject, body_text)
        date_str = dt.strftime("%Y-%m-%d")
        base = f"{date_str}_{safe_filename(sender, 40)}_{safe_filename(subject, 60)}"

        for idx, (orig_name, att_id) in enumerate(pdfs):
            suffix = "" if len(pdfs) == 1 else f"_{idx + 1}"
            target = folder / f"{safe_filename(base)}{suffix}.pdf"
            if target.exists() or str(target) in seen_files:
                print(f"  [skip exists] {target.name}")
            else:
                try:
                    data = download_attachment(service, m["id"], att_id)
                    target.write_bytes(data)
                    seen_files.add(str(target))
                    print(f"  [saved] {target.name}")
                except HttpError as e:
                    print(f"  [error] {orig_name}: {e}")
                    continue
            rows.append(
                InvoiceRow(
                    date=date_str,
                    sender=sender,
                    subject=subject,
                    doc_number=doc_number,
                    filename=target.name,
                )
            )

    if matched_msg_ids:
        # Batch label in chunks of 1000 (Gmail API limit).
        for chunk_start in range(0, len(matched_msg_ids), 1000):
            chunk = matched_msg_ids[chunk_start : chunk_start + 1000]
            try:
                service.users().messages().batchModify(
                    userId="me",
                    body={"ids": chunk, "addLabelIds": [label_id]},
                ).execute()
            except HttpError as e:
                print(f"  [label error] {e}")
        print(f"Applied label '{label_name}' to {len(matched_msg_ids)} messages.")

    write_summary(folder, rows)
    print(f"Done. Folder: {folder}")


def write_summary(folder: Path, rows: list[InvoiceRow]) -> None:
    path = folder / "invoices_summary.xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"
    ws.append(["Date", "Sender", "Subject", "Document number", "Filename"])
    for r in sorted(rows, key=lambda x: x.date):
        ws.append([r.date, r.sender, r.subject, r.doc_number, r.filename])
    for col, width in enumerate([12, 32, 60, 20, 60], start=1):
        ws.column_dimensions[chr(64 + col)].width = width
    wb.save(path)
    print(f"Wrote summary: {path} ({len(rows)} rows)")


def main():
    year, month = prompt_month()
    service = authenticate()
    process_month(service, year, month)


if __name__ == "__main__":
    main()
