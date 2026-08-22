# ICEBOX OS

Internal financial operating system for ICEBOX (Next.js + TypeScript + Supabase).
See [CLAUDE.md](./CLAUDE.md) for architecture and development rules.

```bash
npm install
cp .env.example .env.local   # fill in Supabase credentials
npm run dev
```

---

# Gmail Invoice Organizer

A small Python script that logs into Gmail once a month, finds invoice / receipt
emails (Hebrew + English keywords and a list of known senders), downloads the
PDF attachments into a per-month folder, writes an Excel summary, and applies a
green Gmail label like `חשבוניות מרץ 2026` to the matched threads.

Run it with:

```bash
python invoices.py
```

You will be prompted for `YYYY-MM` and the script does the rest.

## 1. One-time Google Cloud / OAuth setup

You only need to do this once.

1. Go to https://console.cloud.google.com/ and create (or pick) a project.
2. Open **APIs & Services → Library**, search for **Gmail API**, click **Enable**.
3. Open **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: anything (e.g. `Invoice Organizer`). Add your own email as
     support email and developer contact. Save.
   - On the **Scopes** step you can leave it empty (the script requests
     scopes at runtime). Save.
   - On the **Test users** step, add the Gmail address you want to scan.
     Save. (Keeping the app in "Testing" mode is fine — you just need to
     reauthorize roughly every 7 days, or click **Publish app** to avoid
     that.)
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Name: anything.
   - Click **Create**, then **Download JSON**.
5. Save that file next to `invoices.py` as **`credentials.json`**.

The first time you run the script it will open a browser window asking you to
sign in and approve the three Gmail scopes (read, modify, labels). After you
approve, a `token.json` is saved locally and reused on subsequent runs — no
re-login needed.

Both `credentials.json` and `token.json` are git-ignored. Don't commit them.

## 2. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Run

```bash
python invoices.py
# Which month? (YYYY-MM): 2026-03
```

Output:

```
invoices/
└── 2026-03/
    ├── 2026-03-04_billing@shopify.com_Your Shopify invoice.pdf
    ├── 2026-03-12_noreply@ezcount.co.il_חשבונית מס 12345.pdf
    ├── ...
    └── invoices_summary.xlsx
```

The summary has columns: **Date | Sender | Subject | Document number | Filename**.

In Gmail you'll see a new green label `חשבוניות <Hebrew month> <year>` applied
to every matched thread.

## How it searches

- Date range: the entire calendar month you typed.
- Keyword match (subject or body): `חשבונית`, `חשבוניות`, `חשבונית מס`,
  `קבלה`, `invoice`, `receipt`.
- Sender match (any of):
  - `billing@shopify.com`
  - `billing@iranigroup.co.il`
  - `notify@morning.co`
  - `noreply@ezcount.co.il`
  - `hfd.co.il`
  - `donotreply@rivhit.co.il`

To tweak these, edit the `KEYWORDS` and `SENDERS` lists at the top of
`invoices.py`.

## Notes

- Files that already exist in the target folder are skipped (safe to re-run).
- The document number is best-effort: regex over the subject and email body
  looking for things like `חשבונית מס 12345`, `Invoice #ABC-001`, etc. If it
  can't find one, the column is left blank.
- Gmail's `after:` / `before:` filter is interpreted in your account's
  timezone, so the script also re-checks each message's `Date:` header to
  avoid spill-over from neighboring months.
