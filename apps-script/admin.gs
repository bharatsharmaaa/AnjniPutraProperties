// AnjaniPutra admin panel + public listings feed.
//
// Lives in the same Apps Script project as leads.gs, bound to the listings spreadsheet
// (Extensions → Apps Script). One Web App deployment serves:
//   GET  <url>            → the admin panel (Admin.html), protected by a PIN
//   GET  <url>?feed=csv   → public CSV of visible listings, read by site/assets/js/sheets.js
//   POST <url>            → website enquiries (leads.gs)
// Deploy as: Execute as "Me", Who has access "Anyone".
// Script properties: ADMIN_PIN (required, 6+ digits), SITE_URL (optional), LEADS_SPREADSHEET_ID (optional).

var LISTINGS_SHEET = 'Listings';
var PRIVATE_SHEET = 'Private';
// Plots and flats share one sheet. For flats, "amenities" holds facilities and "highlights" holds features.
var LISTING_HEADERS = [
  'id', 'category', 'title', 'location', 'plot type', 'bhk', 'floor', 'total floors', 'carpet area', 'price',
  'status', 'possession', 'land parcel', 'total plots', 'plot options', 'amenities', 'highlights',
  'connectivity', 'approvals', 'availability', 'media', 'description', 'featured', 'date added'
];
var AVAILABILITY = ['Available', 'Few left', 'Sold out', 'Hidden'];
var PRIVATE_HEADERS = ['id', 'project name', 'rera number', 'developer contact', 'notes', 'updated'];
var LEAD_STATUSES = ['New', 'Contacted', 'Visit booked', 'Visited', 'Booked', 'Not interested'];
var PHOTO_FOLDER_NAME = 'AnjaniPutra listing photos';
var SESSION_DAYS = 90;
var MAX_PIN_FAILURES = 5;
var FEED_CACHE_KEY = 'feed_csv';

// ---------- entry points ----------

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.feed === 'csv') return feedCsv_();
  return HtmlService.createHtmlOutputFromFile('Admin')
    .setTitle('AnjaniPutra Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run once from the editor (select "setup" → Run) to create the sheets and photo folder
// and grant permissions. Safe to run again.
function setup() {
  listingsSheet_();
  privateSheet_();
  photoFolder_();
  var pin = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  Logger.log(pin ? 'Setup complete.' : 'Setup complete. Now add the ADMIN_PIN script property (Project Settings → Script properties).');
}

// ---------- public feed ----------

function feedCsv_() {
  var cache = CacheService.getScriptCache();
  var csv = cache.get(FEED_CACHE_KEY);
  if (!csv) {
    var rows = listingsSheet_().getDataRange().getDisplayValues();
    var headers = rows[0];
    var availability = headers.indexOf('availability');
    var body = rows.slice(1).filter(function (r) {
      return r.join('').trim() !== '' && !/^hidden$/i.test(String(r[availability] || '').trim());
    });
    csv = [headers].concat(body).map(function (r) { return r.map(csvCell_).join(','); }).join('\n');
    if (csv.length < 95000) cache.put(FEED_CACHE_KEY, csv, 300);
  }
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function csvCell_(value) {
  var s = String(value == null ? '' : value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function clearFeedCache_() {
  CacheService.getScriptCache().remove(FEED_CACHE_KEY);
}

// ---------- PIN sessions ----------

function login(pin) {
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('pin_failures') || 0);
  if (failures >= MAX_PIN_FAILURES) throw new Error('LOCKED');
  var props = PropertiesService.getScriptProperties();
  var expected = String(props.getProperty('ADMIN_PIN') || '').trim();
  if (!expected) throw new Error('NO_PIN');
  Utilities.sleep(300);
  if (String(pin || '').trim() !== expected) {
    cache.put('pin_failures', String(failures + 1), 900);
    throw new Error('BAD_PIN');
  }
  cache.remove('pin_failures');
  pruneSessions_(props);
  var token = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty('sess_' + hash_(token), String(Date.now() + SESSION_DAYS * 86400000));
  return token;
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess_' + hash_(token));
  return true;
}

function requireSession_(token) {
  if (!token) throw new Error('AUTH');
  var expires = Number(PropertiesService.getScriptProperties().getProperty('sess_' + hash_(token)) || 0);
  if (expires < Date.now()) throw new Error('AUTH');
}

function pruneSessions_(props) {
  var all = props.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('sess_') === 0 && Number(all[key]) < Date.now()) props.deleteProperty(key);
  });
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
  ).replace(/=+$/, '');
}

// ---------- sheets ----------

function listingsSheet_() { return ensureSheet_(LISTINGS_SHEET, LISTING_HEADERS); }
function privateSheet_() { return ensureSheet_(PRIVATE_SHEET, PRIVATE_HEADERS); }

// Creates the sheet if needed and appends any missing header columns. Cells are plain text
// so values like "1.40 Cr" or "2026-10-18" are never reformatted by Sheets.
function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getLastRow() ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var normalized = current.map(function (h) { return String(h).trim().toLowerCase(); });
  var missing = headers.filter(function (h) { return normalized.indexOf(h) === -1; });
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
  } else if (missing.length) {
    var start = current.filter(String).length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
    sheet.getRange(1, start, sheet.getMaxRows(), missing.length).setNumberFormat('@');
  }
  return sheet;
}

function readTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var rows = values.slice(1).map(function (r, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (h, j) { if (h) obj[h] = r[j]; });
    return obj;
  });
  return { headers: headers, rows: rows };
}

function writeRecord_(sheet, headers, rowNumber, record) {
  var row = headers.map(function (h) { return h && record.hasOwnProperty(h) ? String(record[h]) : null; });
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rowNumber - sheet.getMaxRows());
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var existing = range.getValues()[0];
  range.setNumberFormat('@').setValues([row.map(function (v, i) { return v === null ? existing[i] : v; })]);
}

// ---------- listing <-> row conversion ----------

var clean_ = function (v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 300); };
var cleanPart_ = function (v, max) { return clean_(v, max).replace(/[|;]/g, ' '); };
var cleanItem_ = function (v) { return clean_(v, 120).replace(/,/g, ' '); };
var splitList_ = function (v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String); };
var splitRows_ = function (v) { return String(v || '').split(/[;\n]/).map(function (s) { return s.trim(); }).filter(String); };

function parsePrice_(label) {
  var text = String(label || '').toLowerCase();
  var m = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!m) return { price: '', unit: 'request' };
  var n = Number(m[0]);
  if (/\d\s*(cr|crore)/.test(text)) return { price: String(n), unit: 'Cr' };
  if (/\d\s*(l|lac|lakh|lakhs)\b/.test(text)) return { price: String(n), unit: 'L' };
  if (n >= 1e7) return { price: String(+(n / 1e7).toFixed(2)), unit: 'Cr' };
  if (n >= 1e5) return { price: String(+(n / 1e5).toFixed(2)), unit: 'L' };
  return { price: String(n), unit: 'L' };
}

function youtubeId_(value) {
  var s = String(value || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  var m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : '';
}

function rowToListing_(r, priv) {
  var media = [];
  var youtube = '';
  splitList_(r['media']).forEach(function (item) {
    var m = item.match(/^(image|photo|video|youtube)\s*:\s*(.+)$/i);
    var type = m ? m[1].toLowerCase() : (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?|$)/i.test(item) ? 'video' : 'image');
    var src = m ? m[2].trim() : item;
    if (type === 'youtube') { if (!youtube) youtube = 'https://youtu.be/' + src; return; }
    media.push({ type: type === 'photo' ? 'image' : type, src: src });
  });
  var flatPrice = parsePrice_(r['price']);
  return {
    id: r['id'],
    category: /^flat/i.test(r['category'] || '') ? 'Flat' : 'Plot',
    bhk: r['bhk'] || '',
    floor: r['floor'] || '',
    totalFloors: r['total floors'] || '',
    carpetArea: String(r['carpet area'] || '').replace(/[^\d.]/g, ''),
    price: flatPrice.price,
    priceUnit: flatPrice.unit,
    title: r['title'] || '',
    location: r['location'] || r['locality'] || '',
    plotType: r['plot type'] || '',
    status: r['status'] || '',
    possession: r['possession'] || '',
    landParcel: r['land parcel'] || '',
    totalPlots: r['total plots'] || '',
    plotOptions: splitRows_(r['plot options']).map(function (entry) {
      var parts = entry.split('|').map(function (s) { return s.trim(); });
      var price = parsePrice_(parts[2]);
      var size = String(parts[1] || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      return { name: parts[0] || '', size: size ? size[0] : '', price: price.price, unit: price.unit };
    }),
    amenities: splitList_(r['amenities']),
    highlights: r['highlights'] || '',
    connectivity: splitRows_(r['connectivity']).map(function (entry) {
      var parts = entry.split('|').map(function (s) { return s.trim(); });
      return { place: parts[0] || '', distance: parts[1] || '' };
    }),
    approvals: r['approvals'] || '',
    availability: /^few/i.test(r['availability'] || '') ? 'Few left' : (r['availability'] || 'Available'),
    media: media,
    youtube: youtube,
    description: r['description'] || '',
    featured: /^(y|yes|true|1)$/i.test(String(r['featured'] || '').trim()),
    dateAdded: r['date added'] || '',
    private: {
      projectName: (priv && priv['project name']) || '',
      reraNumber: (priv && priv['rera number']) || '',
      developerContact: (priv && priv['developer contact']) || '',
      notes: (priv && priv['notes']) || ''
    }
  };
}

function listingToRecord_(d) {
  var media = (d.media || []).map(function (m) {
    var type = m.type === 'video' ? 'video' : 'image';
    return type + ':' + clean_(m.src, 500).replace(/,/g, '%2C');
  });
  var yt = youtubeId_(d.youtube);
  if (yt) media.push('youtube:' + yt);
  var flat = d.category === 'Flat';
  var price = clean_(d.price, 20).replace(/[^\d.]/g, '');
  return {
    'category': flat ? 'Flat' : 'Plot',
    'bhk': flat ? clean_(d.bhk, 6).replace(/[^\d.]/g, '') : '',
    'floor': flat ? clean_(d.floor, 20) : '',
    'total floors': flat ? clean_(d.totalFloors, 6).replace(/[^\d]/g, '') : '',
    'carpet area': flat ? clean_(d.carpetArea, 12).replace(/[^\d.]/g, '') : '',
    'price': flat ? (d.priceUnit === 'request' || !price ? 'On request' : price + ' ' + (d.priceUnit === 'Cr' ? 'Cr' : 'L')) : '',
    'title': clean_(d.title, 120),
    'location': clean_(d.location, 120),
    'plot type': flat ? '' : clean_(d.plotType, 60),
    'status': clean_(d.status, 60),
    'possession': clean_(d.possession, 60),
    'land parcel': flat ? '' : clean_(d.landParcel, 60),
    'total plots': flat ? '' : clean_(d.totalPlots, 20),
    'plot options': (flat ? [] : d.plotOptions || []).map(function (o) {
      var size = clean_(o.size, 20).replace(/[^\d.]/g, '');
      var price = clean_(o.price, 20).replace(/[^\d.]/g, '');
      var priceLabel = o.unit === 'request' || !price ? 'On request' : price + ' ' + (o.unit === 'Cr' ? 'Cr' : 'L');
      return [cleanPart_(o.name, 60), size ? size + ' sq ft' : '', priceLabel].join(' | ');
    }).filter(function (s) { return s.replace(/[|\s]|On request/g, ''); }).join('; '),
    'amenities': (d.amenities || []).map(cleanItem_).filter(String).join(', '),
    'highlights': splitList_(d.highlights).map(cleanItem_).filter(String).join(', '),
    'connectivity': (d.connectivity || []).map(function (c) {
      return cleanPart_(c.place, 80) + (clean_(c.distance) ? ' | ' + cleanPart_(c.distance, 40) : '');
    }).filter(function (s) { return s.trim(); }).join('; '),
    'approvals': clean_(d.approvals, 200),
    'availability': AVAILABILITY.indexOf(d.availability) >= 0 ? d.availability : 'Available',
    'media': media.join(', '),
    'description': clean_(d.description, 1500),
    'featured': d.featured ? 'Yes' : 'No'
  };
}

function driveIds_(mediaValue) {
  var ids = [];
  String(mediaValue || '').replace(/drive:([\w-]+)/g, function (_m, id) { ids.push(id); return _m; });
  return ids;
}

// ---------- admin API (called from Admin.html via google.script.run) ----------

function listListings(token) {
  requireSession_(token);
  var privRows = readTable_(privateSheet_()).rows;
  var privById = {};
  privRows.forEach(function (p) { if (p.id) privById[p.id] = p; });
  var listings = readTable_(listingsSheet_()).rows
    .filter(function (r) { return String(r.id || '').trim(); })
    .map(function (r) { return rowToListing_(r, privById[r.id]); })
    .reverse();
  return {
    listings: listings,
    siteUrl: PropertiesService.getScriptProperties().getProperty('SITE_URL') || ''
  };
}

function saveListing(token, data) {
  requireSession_(token);
  if (!data || !clean_(data.title) || !clean_(data.location)) throw new Error('MISSING_FIELDS');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = listingsSheet_();
    var table = readTable_(sheet);
    var record = listingToRecord_(data);
    var existing = data.id ? table.rows.filter(function (r) { return r.id === data.id; })[0] : null;
    var id = existing ? existing.id : nextId_(table.rows, data.category === 'Flat' ? 'F' : 'P');
    record['id'] = id;
    var rowNumber;
    if (existing) {
      rowNumber = existing._row;
      var kept = driveIds_(record['media']);
      trashPhotos_(driveIds_(existing['media']).filter(function (x) { return kept.indexOf(x) === -1; }));
    } else {
      record['date added'] = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
      rowNumber = sheet.getLastRow() + 1;
    }
    writeRecord_(sheet, table.headers, rowNumber, record);
    savePrivate_(id, data.private || {});
    clearFeedCache_();
    return id;
  } finally {
    lock.releaseLock();
  }
}

// P1, P2… for plots and F1, F2… for flats.
function nextId_(rows, prefix) {
  var max = 0;
  rows.forEach(function (r) {
    var m = String(r.id || '').match(/^([A-Za-z]*)(\d+)/);
    if (m && m[1].toUpperCase() === prefix) max = Math.max(max, Number(m[2]));
  });
  return prefix + (max + 1);
}

function savePrivate_(id, p) {
  var sheet = privateSheet_();
  var table = readTable_(sheet);
  var existing = table.rows.filter(function (r) { return r.id === id; })[0];
  var record = {
    'id': id,
    'project name': clean_(p.projectName, 120),
    'rera number': clean_(p.reraNumber, 60),
    'developer contact': clean_(p.developerContact, 200),
    'notes': clean_(p.notes, 2000),
    'updated': Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm')
  };
  writeRecord_(sheet, table.headers, existing ? existing._row : sheet.getLastRow() + 1, record);
}

function deleteListing(token, id) {
  requireSession_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = listingsSheet_();
    var row = readTable_(sheet).rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return false;
    trashPhotos_(driveIds_(row['media']));
    sheet.deleteRow(row._row);
    var privSheet = privateSheet_();
    var priv = readTable_(privSheet).rows.filter(function (r) { return r.id === id; })[0];
    if (priv) privSheet.deleteRow(priv._row);
    clearFeedCache_();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function setAvailability(token, id, availability) {
  requireSession_(token);
  if (AVAILABILITY.indexOf(availability) === -1) throw new Error('BAD_VALUE');
  var sheet = listingsSheet_();
  var table = readTable_(sheet);
  var row = table.rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('NOT_FOUND');
  writeRecord_(sheet, table.headers, row._row, { 'availability': availability });
  clearFeedCache_();
  return true;
}

// ---------- photos ----------

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_err) {}
  }
  var folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function uploadPhoto(token, dataUrl) {
  requireSession_(token);
  var m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('BAD_IMAGE');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('TOO_BIG');
  var ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  var file = photoFolder_().createFile(Utilities.newBlob(bytes, m[1], 'plot-' + Date.now() + '.' + ext));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

// Photos uploaded during an edit that was then cancelled.
function discardPhotos(token, ids) {
  requireSession_(token);
  trashPhotos_(ids || []);
  return true;
}

// Only ever trashes files inside the listing-photos folder (recoverable from Drive Trash for 30 days).
function trashPhotos_(ids) {
  if (!ids || !ids.length) return;
  var folderId = photoFolder_().getId();
  ids.forEach(function (id) {
    try {
      var file = DriveApp.getFileById(id);
      var parents = file.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === folderId) { file.setTrashed(true); return; }
      }
    } catch (_err) {}
  });
}

// ---------- enquiries ----------

function leadsSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('LEADS_SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return ss.getSheetByName(typeof LEADS_SHEET !== 'undefined' ? LEADS_SHEET : 'Leads');
}

// Column positions follow leads.gs: Timestamp, Name, Phone, Email, Message, Source page,
// Listing ID, Listing, Enquiry type, Plot option, Visit date, Visit time, Budget, Follow-up status.
function listLeads(token) {
  requireSession_(token);
  var sheet = leadsSheet_();
  if (!sheet || sheet.getLastRow() < 2) return { leads: [], statuses: LEAD_STATUSES };
  var last = sheet.getLastRow();
  var first = Math.max(2, last - 99);
  var values = sheet.getRange(first, 1, last - first + 1, 14).getDisplayValues();
  var leads = values.map(function (r, i) {
    return {
      row: first + i,
      time: r[0], name: r[1], phone: String(r[2]).replace(/^'/, ''), email: r[3], message: r[4],
      listingId: r[6], listing: r[7], type: r[8], plotOption: r[9],
      visitDate: r[10], visitTime: r[11], budget: r[12], status: r[13] || 'New'
    };
  }).filter(function (l) { return l.name || l.phone; }).reverse();
  return { leads: leads, statuses: LEAD_STATUSES };
}

function setLeadStatus(token, row, status, phone) {
  requireSession_(token);
  if (LEAD_STATUSES.indexOf(status) === -1) throw new Error('BAD_VALUE');
  var sheet = leadsSheet_();
  row = Number(row);
  if (!sheet || row < 2 || row > sheet.getLastRow()) throw new Error('NOT_FOUND');
  // Guard against rows having shifted since the list was loaded.
  var rowPhone = String(sheet.getRange(row, 3).getDisplayValue()).replace(/^'/, '');
  if (phone && rowPhone !== phone) throw new Error('STALE');
  sheet.getRange(row, 14).setValue(status);
  return true;
}
