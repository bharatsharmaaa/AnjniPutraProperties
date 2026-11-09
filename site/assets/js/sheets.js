// assets/js/sheets.js (v55) — load the plot listings CSV → window.__PROPS__ and announce "props:ready"
(function () {
  console.log('[sheets] loaded', new Date().toISOString());

  const FEED_URL = (window.LISTINGS_FEED_URL || '').trim();
  const REMOTE_CSV_URL = (window.__CSV_URL__ || '').trim();
  const LOCAL_CSV_FALLBACK = 'data/listings.csv';
  const splitList = (v) => (v == null || v === '') ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean);
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v']);
  const splitRows = (v) => (v == null || v === '') ? [] : String(v).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  const PLOT_SCHEMA_HEADERS = ['plot options', 'plot type'];

  const parseNumber = (v) => {
    const raw = String(v ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return raw ? Number(raw[0]) : null;
  };

  // "99.10 L", "1.40 Cr", "₹ 85,00,000" → rupees.
  const parseINR = (v) => {
    const text = String(v ?? '').toLowerCase();
    const n = parseNumber(text);
    if (n == null) return null;
    if (/\d\s*(cr|crore)/.test(text)) return Math.round(n * 1e7);
    if (/\d\s*(l|lac|lakh|lakhs)\b/.test(text)) return Math.round(n * 1e5);
    return Math.round(n);
  };

  function parsePlotOptions(value) {
    return splitRows(value).map((entry) => {
      const [name = '', size = '', price = ''] = entry.split('|').map((s) => s.trim());
      return {
        name,
        size: parseNumber(size),
        sizeLabel: size,
        price: parseINR(price),
        priceLabel: price
      };
    }).filter((o) => o.name || o.size || o.priceLabel);
  }

  function parseConnectivity(value) {
    return splitRows(value).map((entry) => {
      const [place = '', distance = ''] = entry.split('|').map((s) => s.trim());
      return { place, distance };
    }).filter((c) => c.place);
  }

  const isYes = (v) => /^(y|yes|true|1)$/i.test(String(v || '').trim());

  function parseCSV(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let field = '';
    let row = [];
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          quoted = true;
        } else if (c === ',') {
          row.push(field);
          field = '';
        } else if (c === '\r') {
          // ignore
        } else if (c === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else {
          field += c;
        }
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function fixAssetPath(p) {
    if (!p) return p;
    const trimmed = String(p).trim().replace(/^\.\//, '');
    if (!trimmed) return trimmed;
    const drive = trimmed.match(/^drive:([\w-]+)$/);
    if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}=w1600`;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('assets/')) return trimmed;
    return 'assets/img/' + trimmed;
  }

  function mediaTypeFromPath(path) {
    const clean = String(path || '').split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1).toLowerCase() : '';
    return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image';
  }

  function normalizeMediaItem(value, forcedType) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return null;
    const typed = rawValue.match(/^(image|photo|video|youtube)\s*:\s*(.+)$/i);
    if (typed && typed[1].toLowerCase() === 'youtube') {
      const id = typed[2].trim();
      return /^[\w-]{11}$/.test(id) ? { type: 'youtube', src: id } : null;
    }
    const type = forcedType || (typed ? (typed[1].toLowerCase() === 'photo' ? 'image' : typed[1].toLowerCase()) : mediaTypeFromPath(rawValue));
    const src = fixAssetPath(typed ? typed[2] : rawValue);
    return src ? { type, src } : null;
  }

  function normalizeRows(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((h) => (h || '').toString().trim().toLowerCase());
    if (!PLOT_SCHEMA_HEADERS.some((h) => headers.includes(h))) {
      console.warn('[sheets] CSV has no plot columns (' + PLOT_SCHEMA_HEADERS.join(', ') + ') — skipping it');
      return [];
    }
    const body = rows.slice(1).filter((r) => r.some((cell) => (cell || '').toString().trim() !== ''));

    const list = body.map((r, index) => {
      const raw = {};
      headers.forEach((h, i) => {
        raw[h] = (r[i] ?? '').toString().trim();
      });

      const media = []
        .concat(splitList(raw['media']).map(item => normalizeMediaItem(item)))
        .concat(splitList(raw['images']).map(item => normalizeMediaItem(item, 'image')))
        .concat(splitList(raw['videos']).map(item => normalizeMediaItem(item, 'video')))
        .filter(Boolean);

      const category = /^flat/i.test(raw['category'] || '') ? 'Flat' : 'Plot';
      const floorRaw = raw['floor'] || '';
      return {
        id: raw['id'] || String(index + 1),
        category,
        title: raw['title'] || '',
        bhk: parseNumber(raw['bhk']),
        floor: /^(g|ground)/i.test(floorRaw) ? 0 : parseNumber(floorRaw),
        floorLabel: floorRaw,
        totalFloors: parseNumber(raw['total floors']),
        carpetArea: parseNumber(raw['carpet area']),
        price: parseINR(raw['price']),
        priceLabel: raw['price'] || '',
        location: raw['location'] || raw['locality'] || '',
        plotType: raw['plot type'] || '',
        status: raw['status'] || '',
        possession: raw['possession'] || '',
        landParcel: raw['land parcel'] || '',
        totalPlots: raw['total plots'] || '',
        plotOptions: parsePlotOptions(raw['plot options']),
        amenities: splitList(raw['amenities']),
        highlights: splitList(raw['highlights']),
        connectivity: parseConnectivity(raw['connectivity']),
        approvals: raw['approvals'] || '',
        availability: /^few/i.test(raw['availability'] || '') ? 'Few left' : (raw['availability'] || ''),
        media,
        images: media.filter(item => item.type === 'image').map(item => item.src),
        description: raw['description'] || '',
        featured: isYes(raw['featured']),
        dateAdded: raw['date added'] || '',
        meta: raw
      };
    });

    const visible = list.filter((p) => !/^hidden$/i.test(p.availability));
    return visible.sort((a, b) => Number(b.featured) - Number(a.featured));
  }

  async function fetchCSV(url) {
    const bust = (url.includes('?') ? '&' : '?') + 'cachebust=' + Date.now();
    const res = await fetch(url + bust, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  async function loadSource(url, label) {
    if (!url) return [];
    try {
      const text = await fetchCSV(url);
      const rows = parseCSV(text);
      const data = normalizeRows(rows);
      console.log(`[sheets] ${label} parsed rows:`, rows.length, '→', data.length, 'listings');
      return data;
    } catch (err) {
      console.warn(`[sheets] ${label} load failed:`, err.message || err);
      return [];
    }
  }

  // Pure Residential & Commercial NA Plots (No building photos, Expressway removed)
  const BUNDLED_DEFAULT_CSV = `id,category,title,location,plot type,bhk,floor,total floors,carpet area,price,status,possession,land parcel,total plots,plot options,amenities,highlights,connectivity,approvals,availability,media,description,featured,date added
P1,Plot,Riyasat Royalcrest – Gated European Plotted Township,"Khalapur, Khopoli",Residential Plots,,,,,,Under Construction,Jun 2027,15 acres,207,Courtyard Villa Plot | 1500 sq ft | 90 L; Royal Villa Plot | 2250 sq ft | 1.25 Cr; Grand Estate Plot | 3000 sq ft | 1.75 Cr; Palace Plot | 4200 sq ft | 2.45 Cr,"Grand Clubhouse, Swimming pool & kids pool, Tennis & pickleball court, Box cricket turf, Children's play park, Yoga & meditation deck, Open-air gym, 24/7 gated security with CCTV, 40-ft wide concrete roads, Underground electricity & water","European architecture theme, Sanctioned master blueprint with 207 demarcated plots, Clear title collector NA, Vastu compliant layouts",Old Mumbai–Pune Highway | 2 min; Mumbai–Pune Expressway | 5 min; Chowk Railway Station | 8 min; Imagicaa | 12 min; Navi Mumbai International Airport | 30 min; Atal Setu (MTHL) | 35 min,MahaRERA Approved & MSRDC Sanctioned Layout,Available,"image:assets/img/custom/royalcrestplotsblueprint.png, image:assets/img/custom/plot-amenities-layout.jpg, image:assets/img/custom/plot-site-demarcation.jpg","Ultra-premium European-style 15-acre gated township near Panvel and Khalapur. Features 207 demarcated villa plots, resort clubhouse, sports zone and verdant landscapes.",Yes,2026-11-09
P2,Plot,Royalcrest Commercial Boulevard & Retail Plots,"Khalapur, Khopoli",Commercial Plots,,,,,,Under Construction,Dec 2026,Road Frontage Zone,12,Commercial Showroom Plot | 1800 sq ft | 1.25 Cr; Highway Retail Plot | 2400 sq ft | 1.50 Cr; Commercial Mixed Plot | 3200 sq ft | 2.00 Cr,"Direct highway frontage, 60-ft wide access road, Dedicated customer parking, High-power commercial electricity, High-speed fiber internet, 24/7 CCTV surveillance","Main road frontage on high-traffic corridor, High ROI rental potential, Ideal for retail showrooms, restaurants, clinics, bank branches & commercial offices",Old Mumbai–Pune Highway | Direct frontage; Mumbai–Pune Expressway | 4 min; Panvel Railway Junction | 20 min; Navi Mumbai International Airport | 30 min,Commercial NA Sanctioned & MahaRERA Registered,Available,"image:assets/img/custom/plot-site-roads.jpg, image:assets/img/custom/royalcrestplotsblueprint.png, image:assets/img/custom/plot-site-demarcation.jpg","High-visibility commercial NA plots strategically positioned at the entrance of the 15-acre Royalcrest township with maximum road frontage and heavy daily commuter traffic.",Yes,2026-11-09
P3,Plot,The Riyasat Sankalp – 37-Acre Royal Plotted Township,Panvel,Residential Plots,,,,,,Under Construction,Dec 2026,37 acres,450,Smart Plot | 1000 sq ft | 55 L; Premium Plot | 1500 sq ft | 85 L; Luxury Plot | 2000 sq ft | 1.15 Cr; Signature Plot | 3000 sq ft | 1.70 Cr,"Royal entrance archway, Central landscaped park, Temple complex, Grand community club, Jogging track, Multi-sports turf, Kids adventure park, 24/7 RFID gated security","Largest master-planned township in Panvel region, 100% Collector NA sanctioned, 10 min from Navi Mumbai International Airport corridor",Navi Mumbai International Airport | 12 min; Panvel Railway Station | 10 min; Mumbai–Pune Expressway | 6 min; Atal Setu (MTHL) | 20 min,MahaRERA Registered & MSRDC Approved,Available,"image:assets/img/custom/plot-site-demarcation.jpg, image:assets/img/custom/plot-amenities-layout.jpg, image:assets/img/custom/plot-site-roads.jpg","A monumental 37-acre royal-themed luxury plotted township in Panvel offering eco-friendly residential plots equipped with modern infrastructure and world-class amenities.",Yes,2026-11-09
P4,Plot,Sankalp Commercial Plaza & High-Street Retail Plots,Panvel,Commercial Plots,,,,,,Under Construction,Mar 2027,5-acre Arcade,24,Boutique Retail Plot | 1200 sq ft | 1.00 Cr; Commercial High-Street Plot | 1800 sq ft | 1.50 Cr; Flagship Commercial Plot | 2500 sq ft | 2.00 Cr,"High-street pedestrian boulevard, Ample customer parking, Wide 80-ft entry avenue, EV charging stations, 24/7 security & CCTV, Backup power supply","Captive footfall from 450+ township families + Panvel growth corridor, Massive capital appreciation & rental yield potential",Navi Mumbai International Airport | 12 min; Panvel Railway Station | 10 min; Sion–Panvel Expressway | 12 min; Atal Setu (MTHL) | 20 min,Commercial NA Sanctioned & MahaRERA Approved,Available,"image:assets/img/custom/plot-site-roads.jpg, image:assets/img/custom/plot-site-demarcation.jpg, image:assets/img/custom/amenites.png","Prime commercial plots within Panvel's premier 37-acre township development, designed for high-street retail, restaurants, medical centres, and commercial plazas.",Yes,2026-11-09
P5,Plot,Riyasat Bliss – Nature-Themed Villa Plots,Panvel,Residential Plots,,,,,,Under Construction,Dec 2027,23.82 acres,180,Bliss Villa Plot | 1650 sq ft | 78 L; Panorama Plot | 2200 sq ft | 1.05 Cr; Mountain View Estate | 3100 sq ft | 1.50 Cr; Grand Bliss Plot | 4500 sq ft | 2.00 Cr,"Iconic 65ft Shiva Statue & Waterfall, Zen meditation pavilion, Luxury clubhouse, Swimming pool, Organic fruit orchard, Forest walking trails, Star gazing deck, Solar lighting","Lush green hillside environment, 100% serene non-polluted sanctuary, Clear title demarcated plots, Bank loan approved",Navi Mumbai International Airport | 15 min; Panvel Railway Junction | 12 min; Karnala Bird Sanctuary | 8 min; Atal Setu (MTHL) | 25 min,MahaRERA Approved & Clear Title Sanctioned,Available,"image:assets/img/custom/plot-amenities-layout.jpg, image:assets/img/custom/plot-site-demarcation.jpg, image:assets/img/custom/amenites.png","Nature-themed 23.82-acre residential plotted development in Panvel featuring waterfall landscapes, central Shiva monument, wellness clubhouse and mountain backdrops.",No,2026-11-09
P6,Plot,Riyasat Montera – Hillside Contemporary Plots,"Khalapur, Khopoli",Residential Plots,,,,,,Under Construction,Sep 2027,17 acres,195,Compact Hillside Plot | 1100 sq ft | 55 L; Standard Villa Plot | 1600 sq ft | 80 L; Deluxe Plot | 2100 sq ft | 1.05 Cr; Hill Crest Plot | 3000 sq ft | 1.50 Cr,"Panoramic mountain view deck, Clubhouse, Infinity edge pool, Outdoor fitness gym, Children's play park, Jogging track, Solar street lights, 24/7 security","Scenic Sahyadri foothills, 3 min from Mumbai-Pune Expressway, Vastu aligned layout, Clear plot demarcation",Mumbai–Pune Expressway | 3 min; Old Mumbai–Pune Highway | 2 min; Khopoli Railway Station | 8 min; Imagicaa | 10 min,MahaRERA Registered & Clear Title NA Sanctioned,Available,"image:assets/img/custom/royalcrestplotsblueprint.png, image:assets/img/custom/plot-site-roads.jpg, image:assets/img/custom/plot-amenities-layout.jpg","Modern contemporary hillside plotted layout in Khalapur near Khopoli, offering refreshing mountain air, seamless expressway access, and ready-to-build villa infrastructure.",No,2026-11-09
P7,Plot,Sankalp Meadows – Boutique Plotted Layout,Khalapur,Residential Plots,,,,,,Under Construction,Mar 2027,13 acres,140,Meadows Villa Plot | 1250 sq ft | 62 L; Garden Plot | 1750 sq ft | 88 L; Corner Estate Plot | 2400 sq ft | 1.20 Cr,"Community clubhouse, Swimming pool, Multipurpose sports court, Landscaped walkways, Kids park, Gated entry with CCTV, Wide internal roads","5 mins from Chauk railway station, calm green surroundings, close to Morbe Dam, Clear title NA plots",Chauk Railway Station | 5 min; Old Mumbai–Pune Highway | 4 min; Panvel City | 18 min; Navi Mumbai International Airport | 28 min,MahaRERA Approved & Clear Demarcated Layout,Available,"image:assets/img/custom/plot-site-demarcation.jpg, image:assets/img/custom/amenities2.png, image:assets/img/custom/plot-site-roads.jpg","Boutique 13-acre plotted township near Khalapur offering serene nature living, community sports amenities, and convenient proximity to Panvel and the airport.",No,2026-11-09`;

  async function start() {
    console.log('[sheets] feed:', FEED_URL || '(none)', '| CSV URL:', REMOTE_CSV_URL || '(none)');

    const forceLocal = /[?&]local=1\b/.test(window.location.search) || !REMOTE_CSV_URL;
    const sources = [];
    if (FEED_URL && !forceLocal) sources.push({ url: FEED_URL, label: 'feed' });
    if (REMOTE_CSV_URL && !forceLocal) sources.push({ url: REMOTE_CSV_URL, label: 'remote' });
    sources.push({ url: LOCAL_CSV_FALLBACK, label: 'local' });

    let data = [];
    for (const src of sources) {
      const list = await loadSource(src.url, src.label);
      if (list.length) {
        data = list;
        window.__CSV_SOURCE__ = src.label;
        break;
      }
    }

    if (!data.length) {
      console.log('[sheets] falling back to bundled default listings');
      const rows = parseCSV(BUNDLED_DEFAULT_CSV);
      data = normalizeRows(rows);
      window.__CSV_SOURCE__ = 'bundled';
    }

    window.__PROPS__ = Array.isArray(data) ? data : [];
    console.log('[sheets] ready:', window.__PROPS__.length, 'source:', window.__CSV_SOURCE__);

    try {
      document.dispatchEvent(new CustomEvent('props:ready', { detail: { count: window.__PROPS__.length } }));
    } catch (_err) {}

    if (typeof window.__RENDER_APP__ === 'function') {
      window.__RENDER_APP__();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
