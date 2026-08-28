#!/usr/bin/env node
// Search Google Drive for Skyeline estimate spreadsheets.
// Uses refresh token stored in Firestore (ingestion_lab/config.drive)
// and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from Firebase Secret Manager
// via gcloud CLI as fallback.




const admin = require('firebase-admin');
const { google } = require('googleapis');

// Initialize Firebase Admin with application default credentials (gcloud ADC)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'skyelineos',
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function getSecret(secretName) {
  const { execSync } = require('child_process');
  try {
    const val = execSync(
      `gcloud secrets versions access latest --secret=${secretName} --project=skyelineos 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim();
    return val;
  } catch (e) {
    return null;
  }
}

async function getAuthorizedDriveClient() {
  const configSnap = await db.collection('ingestion_lab').doc('config').get();
  const config = configSnap.data() || {};
  const conn = config.drive;

  if (!conn || !conn.refreshToken) {
    throw new Error('Drive is not connected. No refresh token found in ingestion_lab/config.drive');
  }

  console.log(`[auth] Drive connected as: ${conn.email || 'unknown'}`);

  const clientId = await getSecret('GOOGLE_CLIENT_ID');
  const clientSecret = await getSecret('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Could not fetch GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from Secret Manager');
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);

  const expiryMs = conn.expiresAt && typeof conn.expiresAt.toMillis === 'function'
    ? conn.expiresAt.toMillis()
    : null;

  oauth2.setCredentials({
    refresh_token: conn.refreshToken,
    access_token: conn.accessToken || undefined,
    expiry_date: expiryMs,
  });

  return oauth2;
}

async function searchDriveForEstimates(drive) {
  const queries = [
    "name contains 'estimate' and trashed = false",
    "name contains 'Estimate' and trashed = false",
    "name contains 'bid' and trashed = false",
    "name contains 'Bid' and trashed = false",
    "name contains 'cost' and trashed = false",
    "name contains 'Cost' and trashed = false",
    "name contains 'Skyeline' and trashed = false",
    "name contains 'skyeline' and trashed = false",
  ];

  const seen = new Set();
  const files = [];

  for (const q of queries) {
    try {
      const r = await drive.files.list({
        q,
        fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
        pageSize: 50,
        orderBy: 'modifiedTime desc',
      });
      for (const f of r.data.files || []) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          files.push(f);
        }
      }
    } catch (e) {
      console.warn(`[search] query failed: ${q} — ${e.message}`);
    }
  }

  return files;
}

function mimeLabel(mime) {
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet';
  if (mime === 'application/vnd.google-apps.document') return 'Google Doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'Excel (.xlsx)';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'application/vnd.ms-excel') return 'Excel (.xls)';
  return mime;
}

async function readSheetStructure(drive, fileId, fileName) {
  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });

  try {
    // Get sheet metadata
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: fileId,
      fields: 'sheets(properties(sheetId,title,index))',
    });

    const sheetTabs = (meta.data.sheets || []).map(s => s.properties);
    console.log(`\n[sheet] "${fileName}" has ${sheetTabs.length} tab(s): ${sheetTabs.map(t => t.title).join(', ')}`);

    const results = [];

    for (const tab of sheetTabs.slice(0, 3)) { // read first 3 tabs
      try {
        const dataRes = await sheets.spreadsheets.values.get({
          spreadsheetId: fileId,
          range: `'${tab.title}'!A1:Z200`,
        });

        const rows = dataRes.data.values || [];
        results.push({
          tab: tab.title,
          rowCount: rows.length,
          rows: rows.slice(0, 100), // cap at 100 rows for output
        });
      } catch (e) {
        console.warn(`[sheet] tab "${tab.title}" read error: ${e.message}`);
        results.push({ tab: tab.title, error: e.message });
      }
    }

    return { tabs: sheetTabs, data: results };
  } catch (e) {
    console.warn(`[sheet] metadata error for ${fileId}: ${e.message}`);
    return { error: e.message };
  }
}

function analyzeStructure(sheetData) {
  const analysis = [];

  for (const tabData of sheetData.data || []) {
    if (tabData.error) continue;
    const rows = tabData.rows || [];
    if (!rows.length) continue;

    const tabAnalysis = { tab: tabData.tab, headers: null, sections: [], lineItems: [] };

    // Find header row (first non-empty row)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (row && row.some(c => c && c.trim())) {
        tabAnalysis.headers = row.filter(c => c && c.trim());
        headerRowIdx = i;
        break;
      }
    }

    // Scan remaining rows for section headers and line items
    let currentSection = null;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(c => c && c.trim())) continue;

      const firstCell = (row[0] || '').trim();
      const secondCell = (row[1] || '').trim();

      // Heuristic: a section header has content in col A but not B, or looks like a category
      // (no numbers, all caps, or short descriptive label)
      const hasNumber = row.some(c => c && /\d+(\.\d+)?/.test(c) && parseFloat(c.replace(/[$,]/g, '')) > 0);
      const isLikelySection = firstCell &&
        !secondCell &&
        !hasNumber &&
        firstCell.length < 60;

      if (isLikelySection) {
        currentSection = firstCell;
        if (!tabAnalysis.sections.includes(currentSection)) {
          tabAnalysis.sections.push(currentSection);
        }
      } else if (firstCell || secondCell) {
        tabAnalysis.lineItems.push({
          section: currentSection,
          description: firstCell || secondCell,
          rowData: row.slice(0, 8), // first 8 cols
        });
      }
    }

    analysis.push(tabAnalysis);
  }

  return analysis;
}

async function main() {
  console.log('=== Skyeline Drive Estimate Search ===\n');

  const auth = await getAuthorizedDriveClient();
  const drive = google.drive({ version: 'v3', auth });

  // Step 1: Search Drive
  console.log('Searching Drive for estimate/bid/cost files...');
  const files = await searchDriveForEstimates(drive);

  console.log(`\nFound ${files.length} files:\n`);
  for (const f of files) {
    console.log(`  [${mimeLabel(f.mimeType)}] ${f.name}`);
    console.log(`    ID: ${f.id}`);
    console.log(`    Modified: ${f.modifiedTime}`);
    console.log(`    Link: ${f.webViewLink || 'n/a'}`);
    console.log('');
  }

  // Step 2: Read Google Sheets structure
  const sheets = files.filter(f => f.mimeType === 'application/vnd.google-apps.spreadsheet');
  console.log(`\n=== Reading ${sheets.length} Google Sheet(s) ===`);

  const sheetStructures = [];
  for (const f of sheets) {
    console.log(`\nReading: "${f.name}" (${f.id})`);
    const driveWithAuth = google.drive({ version: 'v3', auth });
    driveWithAuth.context = { _options: { auth } }; // pass auth for sheets call
    const sheetsAPI = google.sheets({ version: 'v4', auth });

    // Get sheet metadata
    let meta;
    try {
      meta = await sheetsAPI.spreadsheets.get({
        spreadsheetId: f.id,
        fields: 'sheets(properties(sheetId,title,index))',
      });
    } catch (e) {
      console.warn(`  Could not read metadata: ${e.message}`);
      sheetStructures.push({ file: f, error: e.message });
      continue;
    }

    const tabs = (meta.data.sheets || []).map(s => s.properties);
    console.log(`  Tabs: ${tabs.map(t => t.title).join(', ')}`);

    const tabData = [];
    for (const tab of tabs.slice(0, 5)) {
      try {
        const dataRes = await sheetsAPI.spreadsheets.values.get({
          spreadsheetId: f.id,
          range: `'${tab.title}'!A1:J300`,
        });
        const rows = dataRes.data.values || [];
        tabData.push({ tab: tab.title, rows });
        console.log(`  Tab "${tab.title}": ${rows.length} rows`);
      } catch (e) {
        console.warn(`  Tab "${tab.title}" error: ${e.message}`);
        tabData.push({ tab: tab.title, error: e.message });
      }
    }

    const structure = analyzeStructure({ data: tabData });
    sheetStructures.push({ file: f, tabs, tabData, structure });
  }

  // Step 3: Output full analysis
  console.log('\n\n========== FULL STRUCTURE ANALYSIS ==========\n');
  const OUTPUT = { files, sheets: sheetStructures };

  for (const s of sheetStructures) {
    if (s.error) {
      console.log(`\n### ${s.file.name}\nERROR: ${s.error}\n`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`FILE: ${s.file.name}`);
    console.log(`ID:   ${s.file.id}`);
    console.log(`URL:  ${s.file.webViewLink}`);
    console.log(`${'='.repeat(60)}\n`);

    for (const analysis of s.structure || []) {
      console.log(`--- Tab: "${analysis.tab}" ---`);

      if (analysis.headers) {
        console.log(`Headers: ${analysis.headers.join(' | ')}`);
      }

      if (analysis.sections.length) {
        console.log(`\nSections found (${analysis.sections.length}):`);
        for (const sec of analysis.sections) {
          console.log(`  • ${sec}`);
        }
      }

      if (analysis.lineItems.length) {
        console.log(`\nLine items (${analysis.lineItems.length}):`);
        let lastSection = null;
        for (const item of analysis.lineItems) {
          if (item.section !== lastSection) {
            console.log(`  [${item.section || 'No section'}]`);
            lastSection = item.section;
          }
          console.log(`    - ${item.description}  |  ${item.rowData.slice(1, 6).filter(Boolean).join(' | ')}`);
        }
      }
    }

    // Also dump raw CSV of first tab for full fidelity
    if (s.tabData && s.tabData[0] && s.tabData[0].rows) {
      console.log(`\n[RAW CSV - first tab "${s.tabData[0].tab}"]`);
      const rows = s.tabData[0].rows;
      for (let i = 0; i < Math.min(150, rows.length); i++) {
        const row = rows[i];
        if (row && row.some(c => c && c.trim())) {
          console.log(row.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(','));
        }
      }
    }
  }

  // Save JSON output
  const fs = require('fs');
  const outPath = '/tmp/skyeline-drive-estimates.json';
  fs.writeFileSync(outPath, JSON.stringify(OUTPUT, null, 2));
  console.log(`\n\nFull JSON saved to: ${outPath}`);
}

main().catch(e => {
  console.error('\nFATAL:', e.message || e);
  process.exit(1);
});
