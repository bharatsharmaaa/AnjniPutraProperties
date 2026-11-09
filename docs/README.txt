Plot listings
-------------

The agent normally edits listings in the admin panel (apps-script/Admin.html,
guide: docs/ADMIN-GUIDE.md), which writes the "Listings" tab described below.
The website reads it via the Web App feed (window.LISTINGS_FEED_URL), then the
published-sheet CSV (window.__CSV_URL__), then site/data/listings.csv.

The published sheet is PUBLIC. Never put the project name, developer name,
RERA number or owner details in it. Keep those in a separate, unpublished tab.

Columns (header names must match; order does not matter):

id            Short reference shown to buyers: P1, P2… for plots, F1, F2… for flats
category      Plot or Flat (empty = Plot)
title         Public name, e.g. "Gated Villa Plots off the Mumbai–Pune Expressway"
location      e.g. "Wavandhal, Khalapur" (each comma-separated place becomes a filter option)
plot type     Villa Plots / NA Plots / Residential Plots / Farmhouse Plots …
status        Pre-launch / Under development / Ongoing / Ready for registration
possession    e.g. Sep 2027, or "Ask the agent"
land parcel   e.g. 18 acres
total plots   optional
plot options  One entry per plot category, separated by ";" — Name | size | price
              e.g. Prime | 1648 sq ft | 99.10 L; Regal | 2337 sq ft | 1.40 Cr
              Price may be "99.10 L", "1.40 Cr", "8500000" or "On request".
amenities     comma-separated
highlights    comma-separated
connectivity  One entry per place, separated by ";" — Place | distance/time
              e.g. Mumbai–Pune Expressway | 2.5 km · 5 min; Khopoli Station | 12 min
approvals     Public-safe text, e.g. "RERA registered — details shared on enquiry"
availability  Available / Few left / Sold out / Hidden (Hidden rows are not shown)
media         see below
description   Short buyer-friendly text without the project name
featured      Yes → listed first
date added    YYYY-MM-DD

Flat-only columns (leave empty for plots):

bhk           1, 1.5, 2, 2.5, 3 … (shown as "2.5 BHK"; the Flat type filter is built from these)
floor         7, or Ground
total floors  e.g. 12
carpet area   sq ft, e.g. 650
price         e.g. 85 L, 1.2 Cr or On request

For flats, "amenities" holds the Facilities and "highlights" the Features;
"plot type", "land parcel", "total plots" and "plot options" stay empty.

site/data/listings.csv is the bundled fallback (and a good example of every
column). If the published sheet has no "plot options"/"plot type"
column, the site ignores it and uses data/listings.csv. Add ?local=1 to the
page URL to preview data/listings.csv without the sheet.

Media format
------------

image:plots/p1-entrance.jpg, image:plots/p1-layout.jpg, video:plots/p1-drone.mp4

- drive:<fileId> is a photo uploaded from the admin panel (Google Drive).
- youtube:<videoId> adds a YouTube video to the listing's gallery.
- Relative paths load from site/assets/img/ (plots/p1.jpg → assets/img/plots/p1.jpg).
- Full URLs and paths starting with assets/ are used as-is.
- Without a prefix, jpg/png/webp/gif are images and mp4/webm/mov are videos.
- Listings without media show assets/img/plot-placeholder.svg.

Enquiries
---------

apps-script/leads.gs writes each enquiry to the "Leads" sheet: name, phone,
listing, plot option, enquiry type, preferred visit date/time, budget, and a
"Follow-up status" column (starts as "New") for the agent to update.
