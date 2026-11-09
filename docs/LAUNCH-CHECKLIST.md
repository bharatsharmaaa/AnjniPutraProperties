# AnjaniPutra Properties — go-live checklist

## What is in this folder

| Folder | What it is | Goes online? |
|---|---|---|
| `site/` | The public website: home page, two plot landing pages, privacy page, `admin/` (short link to the admin panel), images, scripts, and `data/listings.csv` (backup listings) | **Yes. Deploy only this folder.** |
| `apps-script/` | Google Apps Script code: agent admin panel (`admin.gs`, `Admin.html`) and enquiry form handler (`leads.gs`) | No. Pasted into Google Apps Script |
| `docs/` | This checklist, the agent's guide (`ADMIN-GUIDE.md`), and the data reference (`README.txt`) | **No. Never publish** (it names projects) |

The website is complete. What remains is setup, real content and
configuration, in this order.

---

## Step 1 — Decisions and information to collect

- [ ] **Legal check on RERA disclosure (blocker).** MahaRERA requires
  advertisements of registered projects to show the project's registration
  number and QR code, and agents to show their own registration number. A
  listing with price, size and location may count as an advertisement even
  without the project name. Ask a lawyer whether to:
  - show each project's RERA number/QR in the listing (project name can stay
    private), or
  - keep listings general and share details only on enquiry.
  If the advice changes the approach, update the `approvals` text per listing
  and the note `PRIVATE_DETAILS_NOTE` in `site/assets/js/app.js`.
- [ ] The agent's own **MahaRERA agent registration number** (`A5…`).
- [ ] Written permission from each developer to market their plots and
  advertise prices.
- [ ] A **domain name** (e.g. `anjaniputraproperties.in`), bought from any
  registrar or from Cloudflare. A `.in` or `.com` domain costs roughly
  ₹700–1,500 a year.
- [ ] A clear **photo of the agent** for the About section (square, at least
  400×400).
- [ ] Have a lawyer review the privacy policy and disclaimer
  (`site/privacy/index.html`).

## Step 2 — Set up the admin panel and enquiries in Google (about 20 minutes)

- [ ] Open the Google Sheet that holds the `Leads` tab → **Extensions → Apps
  Script**.
- [ ] Put three files in that project, pasting from `apps-script/`:
  `leads.gs`, `admin.gs`, and an **HTML** file named exactly `Admin`.
  Delete any other file that has a `doGet` function (e.g. an old
  `properties.gs`).
- [ ] Pick `setup` in the function dropdown → **Run** → allow the permissions
  (Advanced → Go to project). This creates the `Listings` and `Private` tabs
  and the Drive folder "AnjaniPutra listing photos".
- [ ] **Project Settings → Script properties** → add `ADMIN_PIN` (6–8 digits)
  and, once the domain is known, `SITE_URL` (e.g. `https://anjaniputraproperties.in/`).
- [ ] **Deploy → Manage deployments → ✏️ Edit → Version: New version →
  Deploy**, with Execute as **Me** and Who has access **Anyone**. The URL stays
  the same as `window.LEADS_ENDPOINT` in `site/index.html`.
- [ ] If the `Leads` tab already has a header row, add these columns after
  "Listing": `Enquiry type, Plot option, Visit date, Visit time, Budget,
  Follow-up status`.
- [ ] Turn on lead alerts: in the sheet, **Tools → Notification settings →
  Edit notifications → Any changes → Email right away**.
- [ ] Check the admin panel opens: visit the Web App URL (the `LEADS_ENDPOINT`
  address) in a browser and you should see the PIN screen. After the site is
  live, **`yourdomain/admin`** redirects there too (`site/admin/index.html`). If
  you ever create a *new* deployment, update the URL in both
  `site/index.html` and `site/admin/index.html`.
- [ ] On the **agent's phone**: open `yourdomain/admin` (or the Web App URL) in Chrome, enter the PIN,
  then ⋮ → **Add to Home screen** (iPhone Safari: Share → Add to Home Screen).
  Walk through one practice listing together using `docs/ADMIN-GUIDE.md`.

## Step 3 — Add the real listings (the agent, from the admin panel)

- [ ] Optional head start: in the `Listings` tab, **File → Import → Upload**
  `site/data/listings.csv` → "Replace current sheet". This loads the 4 sample
  plots and 4 sample flats so he can edit them instead of typing from scratch.
- [ ] **Correct or delete every sample.** The plot samples (P1–P4) come from
  public pages for Riyasat projects that contradict each other. The flat
  samples (F1–F4) have made-up floor numbers, and F4 is invented.
- [ ] For each plot listing, enter: sizes and prices from the current cost
  sheet, possession, land parcel, amenities and nearby places. For each flat,
  enter: BHK, floor, carpet area, price, facilities and features.
- [ ] Upload real photos, plus a YouTube drone/walkthrough link if available.
  Avoid photos with signage or logos that reveal the project name.
- [ ] Project names, RERA numbers and developer contacts go **only** in the
  🔒 Private box.
- [ ] Once the real listings are in, replace `site/data/listings.csv` with the
  same data (in the sheet: File → Download → CSV, Listings tab). It is the
  backup if Google is unreachable.

## Step 4 — Fill in the website settings

All of these are in `site/` and need only small text edits:

| What | Where | Set to |
|---|---|---|
| Listings feed | `index.html` → `window.LISTINGS_FEED_URL` | The Web App URL from Step 2 + `?feed=csv` |
| Old sheet backup | `index.html` → `window.__CSV_URL__` | `''` (empty), or the published CSV link of the new `Listings` tab. The current link points to the old flat tab. |
| Agent RERA no. | `index.html` → `window.AGENT_RERA` | e.g. `'A51700000000'` (it then shows in About) |
| Google Analytics | `assets/js/ga4.js` | Replace both `G-XXXXXXX` with the GA4 Measurement ID (create a free GA4 property first) |
| Domain | `index.html`, `plots-in-khalapur-khopoli/index.html`, `plots-in-panvel/index.html`, `privacy/index.html`, `robots.txt`, `sitemap.xml` | Replace every `YOUR-DOMAIN` (find and replace across `site/`) |
| Share preview image | `index.html` (and the two plot pages) | Add `<meta property="og:image" content="https://YOUR-DOMAIN/assets/img/og.jpg">` with a 1200×630 JPG of a real plot or layout |
| Agent photo | `assets/img/blank.png` → About section | Save the photo as e.g. `assets/img/agent.jpg` and update the `<img>` in About |

- [ ] In Google Sheets, stop publishing the old flat tab: **File → Share →
  Publish to web → Stop publishing**.

## Step 5 — Put it online (Cloudflare Pages, free)

- [ ] Create a free Cloudflare account → **Workers & Pages → Create → Pages →
  Upload assets** → name the project → drag in the **`site` folder** → Deploy.
  (Or connect a GitHub repository with **build output directory `site`** and
  no build command. Every push then deploys automatically.)
- [ ] **Custom domains → Set up a domain** → enter the domain and follow the
  DNS steps. HTTPS is switched on automatically.
- [ ] Set the `SITE_URL` script property (Step 2) to the live address.
- [ ] To update the site later, upload the `site` folder again as a new
  deployment. Listing changes **never** need this, because they come from the
  admin panel.

Netlify (drag-and-drop the `site` folder at app.netlify.com/drop) works the
same way if preferred. Both serve visitors in India and NRIs abroad quickly.

## Step 6 — Launch test (on the live domain)

- [ ] On an Android phone, an iPhone and a desktop: menu, hero slideshow, plot
  filters, flat filters, details pop-up, photos and videos, Call, WhatsApp
  (check that the message names the listing), and the enquiry form.
- [ ] Send a test **site-visit enquiry**. It should arrive in the `Leads` sheet,
  send the email alert, and appear in the admin panel's **Enquiries** tab.
- [ ] In the admin panel, add a test plot with 2 photos. It should appear on
  the site within about 5 minutes. Hide it, check it disappears, then delete it.
- [ ] Open the browser console on the live site. It should log
  `[sheets] feed parsed rows`, not "skipping it" or "local".
- [ ] Share the home page link on WhatsApp and check the preview.
- [ ] Check GA4 → Realtime shows your visit. Then mark `generate_lead` as a
  key event.

## Step 7 — After launch

- [ ] Google Search Console: add the domain and submit
  `https://YOUR-DOMAIN/sitemap.xml`.
- [ ] Create or update the Google Business Profile with the website link and
  phone number.
- [ ] Collect real buyer reviews (with permission). Add them to the
  `#testimonials` section in `index.html` and remove its `hidden` attribute.
- [ ] Agree the follow-up routine: call new enquiries within a few hours,
  confirm the visit on WhatsApp with a location pin, and update the status in
  the Enquiries tab.

---

### Good to know

- **Photos** are stored in the Drive folder, shared as "anyone with the link"
  so the website can show them. Never keep documents in that folder. Deleted
  listings' photos go to Drive Trash (recoverable for 30 days).
- **Photo loading** uses Google's image servers. If Google ever blocks this,
  photos can move to Cloudinary (free) without changing the agent's workflow.
- **PIN security:** the admin panel is protected only by the PIN (5 wrong
  tries → 15-minute lock). To change it, edit `ADMIN_PIN`. To log out every
  phone, also delete all `sess_…` script properties.
- **Data reference:** `docs/README.txt` lists every column in the `Listings`
  tab.
