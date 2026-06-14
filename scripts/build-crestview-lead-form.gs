/**
 * Skyeline Homes — Crestview Solace (Build #27) lead-intake Google Form builder.
 *
 * WHY THIS IS A SCRIPT: there is no Forms API tool in the SkyelineOS dev
 * environment, so the form is generated programmatically. Paste this whole file
 * into a new Apps Script project (script.google.com → New project), set the two
 * Script Properties below, then run buildCrestviewForm() once. It creates:
 *   - the branded, sectioned form (exactly the spec),
 *   - a linked Google Sheet with a "Lead Tracking (CRM)" tab + Lead Status
 *     dropdown,
 *   - an onFormSubmit trigger that appends a CRM row AND pushes the lead into
 *     SkyelineOS (clients collection) via POST /api/leads/intake.
 *
 * ── ONE-TIME SETUP ───────────────────────────────────────────────────────────
 * 1. script.google.com → New project → paste this file (replace Code.gs).
 * 2. Project Settings → Script Properties → add:
 *      INTAKE_URL    = https://skyelineos.web.app/api/leads/intake
 *      INTAKE_SECRET = <the same value set as LEAD_INTAKE_SECRET in Secret Manager>
 *    (Leave INTAKE_URL blank to skip the SkyelineOS push and only use the Sheet.)
 * 3. Run buildCrestviewForm(). Approve the OAuth scopes when prompted.
 * 4. Read the execution log for the published Form URL + Sheet URL.
 * 5. Optional banner: open the form → Customize Theme → Header → upload the logo
 *    (Apps Script can't set the header image; the logo is added as a top image
 *    item automatically, but the themed banner is a manual one-click step).
 */

// ── Brand + content constants ────────────────────────────────────────────────
var LOGO_URL = 'https://skyelineos.web.app/logos/logo-dark-cropped.png';
var BRAND_GOLD = '#C9A96E';

var FORM_TITLE = 'Skyeline Homes | Crestview Solace Information Request';

var FORM_DESCRIPTION =
  'Thank you for visiting Crestview Solace by Skyeline Homes.\n\n' +
  "Whether you're interested in building a custom home, learning more about the " +
  'products and finishes used throughout this residence, or speaking with our ' +
  "team about your future project, we'd love to connect.\n\n" +
  'Please complete the information below and a member of our team will reach out shortly.';

var QR_CALLOUT =
  'Love what you see? Scan, submit, and we’ll provide information about the ' +
  'selections used throughout this home — or help you begin planning your own custom home.';

var THANK_YOU =
  'We appreciate your interest in Skyeline Homes.\n\n' +
  'A member of our team will review your information and contact you soon. If you ' +
  'requested product or vendor information from Crestview Solace, we will provide ' +
  'those details as quickly as possible.\n\n' +
  'Skyeline Homes\n' +
  'Building Extraordinary Homes Through Extraordinary Experiences';

// Question titles are the contract between the form and onCrestviewSubmit().
// Keep these in sync if you rename a question.
var Q = {
  fullName: 'Full Name',
  phone: 'Phone Number',
  email: 'Email Address',
  preferredContact: 'Preferred Method of Contact',
  city: 'City or Area You Plan to Build In',
  interests: 'I Am Interested In',
  selections: 'Which Products or Selections Would You Like More Information About?',
  crestviewQuestions: 'Specific Questions About Crestview Solace',
  timeline: 'Are You Planning to Build?',
  budget: 'Estimated Project Budget',
  ownsLot: 'Do You Already Own a Lot?',
  projectVision: 'Tell Us About Your Project',
  helpWith: 'How Can We Help?',
  consent: 'Communication Consent',
};

var CRM_HEADERS = [
  'Date Submitted', 'Full Name', 'Phone', 'Email', 'Preferred Contact Method',
  'Build Location', 'Interest Type', 'Build Timeline', 'Budget Range', 'Own Lot?',
  'Requested Information', 'Consultation Requested', 'Lead Score', 'Follow-Up Date',
  'Assigned Team Member', 'Lead Status',
];

var LEAD_STATUS_OPTIONS = [
  'New Lead', 'Contacted', 'Consultation Scheduled', 'Proposal Sent',
  'Under Contract', 'Closed',
];

var TRACKING_SHEET_NAME = 'Lead Tracking (CRM)';

// ── Builder ──────────────────────────────────────────────────────────────────
function buildCrestviewForm() {
  var form = FormApp.create(FORM_TITLE);
  form.setTitle(FORM_TITLE);
  form.setDescription(FORM_DESCRIPTION);
  form.setConfirmationMessage(THANK_YOU);
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(false);

  // Logo as a top image item (best-effort; themed header banner is manual).
  try {
    var logo = UrlFetchApp.fetch(LOGO_URL).getBlob();
    form.addImageItem()
      .setImage(logo)
      .setTitle('Skyeline Homes — Crestview Solace | Build #27')
      .setAlignment(FormApp.Alignment.CENTER);
  } catch (err) {
    Logger.log('Could not fetch logo (' + err + ') — add it manually in the editor.');
  }

  // Intro callout for QR traffic.
  form.addSectionHeaderItem()
    .setTitle('Crestview Solace | Build #27')
    .setHelpText(QR_CALLOUT);

  // SECTION 1 — Contact Information
  form.addPageBreakItem()
    .setTitle('Contact Information')
    .setHelpText('Tell us who you are and the best way to reach you.');

  form.addTextItem().setTitle(Q.fullName).setRequired(true);

  form.addTextItem().setTitle(Q.phone).setRequired(true);

  var email = form.addTextItem().setTitle(Q.email).setRequired(true);
  email.setValidation(
    FormApp.createTextValidation()
      .setHelpText('Please enter a valid email address.')
      .requireTextIsEmail()
      .build()
  );

  form.addMultipleChoiceItem()
    .setTitle(Q.preferredContact)
    .setChoiceValues(['Phone Call', 'Text Message', 'Email'])
    .setRequired(true);

  form.addListItem()
    .setTitle(Q.city)
    .setChoiceValues([
      'St. George', 'Washington', 'Hurricane', 'Ivins', 'Santa Clara',
      'Cedar City', 'Enterprise', 'Other',
    ])
    .setRequired(true);

  // SECTION 2 — What are you interested in?
  form.addPageBreakItem().setTitle('What Are You Interested In?');
  form.addCheckboxItem()
    .setTitle(Q.interests)
    .setChoiceValues([
      'Building a Custom Home',
      'Learning More About Crestview Solace',
      'Product & Finish Information',
      'Design Services',
      'Remodel or Addition',
      'Investment or Spec Home Opportunities',
      'Future Skyeline Homes Projects',
    ]);

  // SECTION 3 — Crestview Solace selections
  form.addPageBreakItem()
    .setTitle('Crestview Solace Selections')
    .setHelpText('Want the exact products used in this home? Pick anything you’d like details on.');
  form.addCheckboxItem()
    .setTitle(Q.selections)
    .setChoiceValues([
      'Exterior Finishes', 'Stone & Masonry', 'Roofing', 'Windows & Doors',
      'Flooring', 'Cabinets', 'Countertops', 'Appliances', 'Plumbing Fixtures',
      'Lighting Fixtures', 'Interior Paint Colors', 'Tile & Backsplashes',
      'Smart Home Features', 'Landscaping', 'Pool & Outdoor Living',
      'Furnishings & Decor', 'All Selections',
    ]);
  form.addParagraphTextItem().setTitle(Q.crestviewQuestions);

  // SECTION 4 — Your project
  form.addPageBreakItem().setTitle('Your Project');
  form.addMultipleChoiceItem()
    .setTitle(Q.timeline)
    .setChoiceValues([
      'Within 3 Months', 'Within 6 Months', 'Within 12 Months',
      '1–2 Years', 'Just Gathering Information',
    ]);
  form.addMultipleChoiceItem()
    .setTitle(Q.budget)
    .setChoiceValues([
      'Under $1 Million', '$1 Million – $1.5 Million',
      '$1.5 Million – $2 Million', '$2 Million+',
    ]);
  form.addMultipleChoiceItem()
    .setTitle(Q.ownsLot)
    .setChoiceValues(['Yes', 'No', 'Currently Looking']);
  form.addParagraphTextItem()
    .setTitle(Q.projectVision)
    .setHelpText('Tell us about your vision, desired square footage, style preferences, location, and anything else you’d like us to know.');

  // SECTION 5 — Next steps
  form.addPageBreakItem().setTitle('Next Steps');
  form.addCheckboxItem()
    .setTitle(Q.helpWith)
    .setChoiceValues([
      'Schedule a Consultation',
      'Receive Pricing Information',
      'Receive Floor Plan Ideas',
      'Receive Crestview Solace Product & Vendor Information',
      'Tour Another Skyeline Homes Project',
      'Speak With a Builder',
      'Join Our Email List',
    ]);

  // SECTION 6 — Consent (required)
  form.addPageBreakItem().setTitle('Consent');
  var consent = form.addCheckboxItem();
  consent.setTitle(Q.consent)
    .setChoiceValues([
      'I agree to receive communications from Skyeline Homes regarding custom ' +
      'home building opportunities, project information, and related services.',
    ])
    .setRequired(true);
  consent.setValidation(
    FormApp.createCheckboxValidation().requireSelectAtLeast(1).build()
  );

  // ── Linked spreadsheet + CRM tracking tab ──────────────────────────────────
  var ss = SpreadsheetApp.create('Crestview Solace — Leads');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var tracking = ss.insertSheet(TRACKING_SHEET_NAME, 0);
  tracking.appendRow(CRM_HEADERS);
  tracking.getRange(1, 1, 1, CRM_HEADERS.length)
    .setFontWeight('bold')
    .setBackground(BRAND_GOLD)
    .setFontColor('#141414');
  tracking.setFrozenRows(1);
  // Lead Status dropdown on the whole column (col 16).
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(LEAD_STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  tracking.getRange(2, 16, tracking.getMaxRows() - 1, 1).setDataValidation(statusRule);
  tracking.setColumnWidths(1, CRM_HEADERS.length, 160);

  // ── onFormSubmit trigger (idempotent re-create) ─────────────────────────────
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCrestviewSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onCrestviewSubmit').forForm(form).onFormSubmit().create();

  Logger.log('✅ Form built.');
  Logger.log('Live (fill-out) URL: ' + form.getPublishedUrl());
  Logger.log('Edit URL:            ' + form.getEditUrl());
  Logger.log('Responses sheet:     ' + ss.getUrl());
  Logger.log('Make a QR code from the Live URL above for the model-home placard.');
}

// ── Submit handler: CRM row + SkyelineOS push ────────────────────────────────
function onCrestviewSubmit(e) {
  var answers = responseToMap(e.response);
  var score = computeLeadScore(answers);

  // e.source is the Form for a form-submit trigger; its destination is the Sheet.
  var destId = e.source.getDestinationId();
  appendTrackingRow(destId, answers, score);
  pushToSkyelineOS(e.response, answers, score);
}

function responseToMap(formResponse) {
  var map = {};
  formResponse.getItemResponses().forEach(function (ir) {
    map[ir.getItem().getTitle()] = ir.getResponse(); // string OR array (checkboxes)
  });
  return map;
}

function asArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function asString(v) { return Array.isArray(v) ? v.join(', ') : (v || ''); }

function computeLeadScore(a) {
  var score = 0;
  var timeline = a[Q.timeline];
  if (timeline === 'Within 3 Months') score += 30;
  else if (timeline === 'Within 6 Months') score += 24;
  else if (timeline === 'Within 12 Months') score += 18;
  else if (timeline === '1–2 Years') score += 10;
  else if (timeline === 'Just Gathering Information') score += 4;

  var budget = a[Q.budget];
  if (budget === '$2 Million+') score += 30;
  else if (budget === '$1.5 Million – $2 Million') score += 24;
  else if (budget === '$1 Million – $1.5 Million') score += 18;
  else if (budget === 'Under $1 Million') score += 10;

  var lot = a[Q.ownsLot];
  if (lot === 'Yes') score += 20;
  else if (lot === 'Currently Looking') score += 12;
  else if (lot === 'No') score += 6;

  var interests = asArray(a[Q.interests]);
  if (interests.indexOf('Building a Custom Home') !== -1) score += 10;

  var help = asArray(a[Q.helpWith]);
  if (help.indexOf('Schedule a Consultation') !== -1 ||
      help.indexOf('Speak With a Builder') !== -1) score += 10;

  return Math.min(100, score);
}

function appendTrackingRow(destId, a, score) {
  var dest = SpreadsheetApp.openById(destId);
  var sheet = dest.getSheetByName(TRACKING_SHEET_NAME) || dest.insertSheet(TRACKING_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(CRM_HEADERS);

  var help = asArray(a[Q.helpWith]);
  var consultation =
    help.indexOf('Schedule a Consultation') !== -1 ? 'Yes' : 'No';
  var requestedInfo = asArray(a[Q.selections]).concat(asArray(a[Q.interests])).join(', ');

  sheet.appendRow([
    new Date(),                       // Date Submitted
    asString(a[Q.fullName]),          // Full Name
    asString(a[Q.phone]),             // Phone
    asString(a[Q.email]),             // Email
    asString(a[Q.preferredContact]),  // Preferred Contact Method
    asString(a[Q.city]),              // Build Location
    asArray(a[Q.interests]).join(', '), // Interest Type
    asString(a[Q.timeline]),          // Build Timeline
    asString(a[Q.budget]),            // Budget Range
    asString(a[Q.ownsLot]),           // Own Lot?
    requestedInfo,                    // Requested Information
    consultation,                     // Consultation Requested
    score,                            // Lead Score
    '',                               // Follow-Up Date (manual)
    '',                               // Assigned Team Member (manual)
    'New Lead',                       // Lead Status
  ]);
}

function pushToSkyelineOS(formResponse, a, score) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INTAKE_URL');
  var secret = props.getProperty('INTAKE_SECRET');
  if (!url || !secret) {
    Logger.log('INTAKE_URL / INTAKE_SECRET not set — skipping SkyelineOS push (Sheet still updated).');
    return;
  }

  var fullName = asString(a[Q.fullName]).trim();
  var parts = fullName.split(' ');
  var payload = {
    formResponseId: formResponse.getId(),
    submittedAt: new Date().toISOString(),
    fullName: fullName,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    email: asString(a[Q.email]),
    phone: asString(a[Q.phone]),
    preferredContact: asString(a[Q.preferredContact]),
    city: asString(a[Q.city]),
    interests: asArray(a[Q.interests]),
    selections: asArray(a[Q.selections]),
    crestviewQuestions: asString(a[Q.crestviewQuestions]),
    timeline: asString(a[Q.timeline]),
    budgetRange: asString(a[Q.budget]),
    ownsLot: asString(a[Q.ownsLot]),
    projectVision: asString(a[Q.projectVision]),
    helpWith: asArray(a[Q.helpWith]),
    consent: asArray(a[Q.consent]).length > 0,
    leadScore: score,
    source: 'website',
    tags: asArray(a[Q.interests]).slice(0, 5),
  };

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-skyeline-intake-secret': secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    Logger.log('SkyelineOS intake → ' + res.getResponseCode() + ' ' + res.getContentText());
  } catch (err) {
    Logger.log('SkyelineOS push failed (lead is still in the Sheet): ' + err);
  }
}
