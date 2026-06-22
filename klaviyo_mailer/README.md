# בונה אימיילים ל-Klaviyo עם תוכן AI

כלי שמייצר תוכן אימייל שיווקי באמצעות **Claude**, ממיר אותו ל-HTML מוכן לשליחה,
מעלה אותו כתבנית ב-**Klaviyo**, ויוצר קמפיין או תבנית לאוטומציה (flow).

מתאים לבניית **ניוזלטרים/קמפיינים** וגם **אוטומציות** (עגלה נטושה וכו') באופן קבוע.

מוגדר כברירת מחדל למותג **Kicksbox** ([kicksboxx.com](https://kicksboxx.com)) —
קופסאות תצוגה/אחסון אקריליק שקופות לאספני סניקרס. ה‑AI מקבל "תקציר מותג" מובנה
(חומר, מארזים, חוסם UV וכו') כדי שהתוכן יהיה מדויק. ברירת מחדל לשפה: **אנגלית**
(שוק ארה"ב). אפשר לשנות הכל במשתני סביבה (ראה `.env.example`).

> ⚠️ כברירת מחדל קמפיין נוצר כ**טיוטה** ולא נשלח. השליחה דורשת אישור מפורש
> (`--send-now` / `--schedule`) — כך לא נשלח אימייל לרשימה בטעות.

## 1. התקנה

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r klaviyo_mailer/requirements.txt
```

## 2. מפתחות והגדרות

צריך שני מפתחות:

- **Anthropic** — מפתח API מ-https://console.anthropic.com (למשתנה `ANTHROPIC_API_KEY`).
- **Klaviyo** — Private API Key מ-Klaviyo: **Settings → API keys → Create Private API Key**
  (הרשאות לפחות: Campaigns, Templates, Lists, Flows). למשתנה `KLAVIYO_API_KEY`.

העתק את `klaviyo_mailer/.env.example` ל-`klaviyo_mailer/.env`, מלא ערכים, וטען:

```bash
cp klaviyo_mailer/.env.example klaviyo_mailer/.env
# ערוך את הקובץ...
set -a; source klaviyo_mailer/.env; set +a
```

`FROM_EMAIL` חייב להיות שולח מאומת ב-Klaviyo כדי ליצור קמפיין.

## 3. שימוש

```bash
# רשימת ה-lists ב-Klaviyo (id ושם)
python -m klaviyo_mailer.cli lists

# רשימת ה-flows הקיימים
python -m klaviyo_mailer.cli flows

# יצירת טיוטת קמפיין ניוזלטר לרשימה לפי שם
python -m klaviyo_mailer.cli campaign \
    --topic "New drop: the 20-Box Favorite for growing collections" \
    --list-name "Newsletter"

# קמפיין מתוזמן
python -m klaviyo_mailer.cli campaign \
    --topic "Protect your grails from UV and dust" \
    --list-id ABC123 --schedule "2026-06-25T09:00:00"

# שליחה מיידית (זהירות!)
python -m klaviyo_mailer.cli campaign --topic "..." --list-id ABC123 --send-now

# תבנית לאוטומציה (עגלה נטושה) — מחברים אותה ל-flow ב-Klaviyo
python -m klaviyo_mailer.cli flow-template \
    --topic "You left the Full Wall in your cart" --email-type "abandoned cart"
```

ה-AI כותב נושא, preview text, כותרת, גוף ו-CTA — לפי תקציר המותג של Kicksbox.
ה-HTML מרונדר מתבנית קבועה (תומכת גם RTL אם משנים שפה לעברית) כך שהמבנה תמיד תקין.

לכתיבה בעברית: `EMAIL_LANGUAGE=he`. לשינוי מותג/מוצר: `BRAND_NAME`, `PRODUCT_NAME`,
`BRAND_BRIEF`.

## 4. הרצה קבועה (ניוזלטר אוטומטי)

### cron (חודשי, ה-1 בחודש ב-09:00)

```cron
0 9 1 * * cd /path/to/repo && set -a && . klaviyo_mailer/.env && set +a && \
  .venv/bin/python -m klaviyo_mailer.cli campaign \
  --topic "Monthly drop: new bundles and collector tips" --list-name "Newsletter"
```

### GitHub Actions (שבועי)

```yaml
name: weekly-newsletter
on:
  schedule:
    - cron: "0 9 * * 1"   # כל יום שני 09:00 UTC
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      KLAVIYO_API_KEY: ${{ secrets.KLAVIYO_API_KEY }}
      FROM_EMAIL: hello@kicksboxx.com
      KLAVIYO_LIST_NAME: Newsletter
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r klaviyo_mailer/requirements.txt
      - run: python -m klaviyo_mailer.cli campaign --topic "Weekly drop from Kicksbox"
```

מומלץ להשאיר את הריצה האוטומטית במצב טיוטה (ברירת המחדל) ולשלוח ידנית אחרי
בדיקה, או להוסיף `--schedule`/`--send-now` רק כשבוטחים בתוצאה.

## הערות על אוטומציות (flows)

Klaviyo לא מאפשרת ליצור flow חדש דרך ה-API. לכן עבור אוטומציות הכלי מייצר את
**תוכן האימייל ותבנית** מוכנה; אתה מחבר אותה ל-flow קיים (למשל "Abandoned Cart")
דרך ממשק Klaviyo: עריכת הודעת המייל ב-flow → *Use existing template*.

## מבנה

| קובץ | תפקיד |
|------|-------|
| `content.py` | יצירת תוכן עם Claude + רינדור HTML |
| `klaviyo.py` | קליינט ל-Klaviyo API (תבניות, קמפיינים, רשימות, flows) |
| `config.py` | טעינת הגדרות ממשתני סביבה |
| `cli.py` | נקודת כניסה (`python -m klaviyo_mailer.cli ...`) |
