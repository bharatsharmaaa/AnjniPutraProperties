// Leads Web App (POST) — appends one row per website enquiry to the "Leads" sheet.
// The first eight columns match the original layout; plot / site-visit columns are appended after them.
var LEADS_SHEET = 'Leads';
var LEADS_HEADERS = [
  'Timestamp', 'Name', 'Phone', 'Email', 'Message', 'Source page', 'Listing ID', 'Listing',
  'Enquiry type', 'Plot option', 'Visit date', 'Visit time', 'Budget', 'Follow-up status'
];

function doPost(e){
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch(err){}
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(LEADS_SHEET) || ss.insertSheet(LEADS_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(LEADS_HEADERS);
  var clean = function(v){ return String(v || '').slice(0, 1000); };
  sheet.appendRow([
    new Date(),
    clean(body.name),
    // Leading apostrophe stops Sheets treating "+91…" as a formula/number.
    body.phone ? "'" + clean(body.phone) : '',
    clean(body.email),
    clean(body.message),
    clean(body.source),
    clean(body.propertyId),
    clean(body.propertyTitle),
    clean(body.enquiryType),
    clean(body.plotOption),
    clean(body.visitDate),
    clean(body.visitTime),
    clean(body.budget),
    'New'
  ]);
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}
