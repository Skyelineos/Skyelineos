// Quick parser sanity test for client/src/lib/contacts/vcard.ts.
// Loads the TS source, transpiles it inline with esbuild, and exercises
// real-world vCard shapes that Mac Contacts and iPhone Contacts export.

import { build } from 'esbuild';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const src = readFileSync('client/src/lib/contacts/vcard.ts', 'utf-8');
const result = await build({
  stdin: { contents: src, loader: 'ts' },
  format: 'esm', bundle: false, write: false, target: 'node20',
});
const outPath = join(tmpdir(), `vcard-${Date.now()}.mjs`);
writeFileSync(outPath, result.outputFiles[0].text);
const { parseVcards } = await import(outPath);
unlinkSync(outPath);

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

// ── Test 1: Single Mac Contacts vCard 3.0 ────────────────────────────
const macSingle = `BEGIN:VCARD
VERSION:3.0
N:Gardanier;Steve;;;
FN:Steve Gardanier
ORG:Gardanier Residence;
EMAIL;type=INTERNET;type=HOME;type=pref:steve@example.com
TEL;type=CELL;type=VOICE;type=pref:+1 801-555-0123
item1.ADR;type=HOME;type=pref:;;1234 Maple St;American Fork;UT;84003;USA
item1.X-ABADR:us
NOTE:Loves modern farmhouses
END:VCARD
`;
const r1 = parseVcards(macSingle);
console.log('\nMac Contacts single export:');
check('parsed 1 card', r1.length === 1, `got ${r1.length}`);
check('full name', r1[0]?.fullName === 'Steve Gardanier', r1[0]?.fullName);
check('first name', r1[0]?.firstName === 'Steve', r1[0]?.firstName);
check('last name', r1[0]?.lastName === 'Gardanier', r1[0]?.lastName);
check('email', r1[0]?.email === 'steve@example.com', r1[0]?.email);
check('phone (CELL preferred)', r1[0]?.phone === '+1 801-555-0123', r1[0]?.phone);
check('company', r1[0]?.company === 'Gardanier Residence', r1[0]?.company);
check('address joined', r1[0]?.jobAddress?.includes('1234 Maple St') && r1[0]?.jobAddress?.includes('American Fork, UT'), r1[0]?.jobAddress);
check('city', r1[0]?.city === 'American Fork', r1[0]?.city);
check('notes', r1[0]?.notes === 'Loves modern farmhouses', r1[0]?.notes);

// ── Test 2: Multi-VCARD export with iPhone-style item grouping + line folding
const multi = `BEGIN:VCARD
VERSION:3.0
N:Doe;John;;;
FN:John Doe
TEL;TYPE=CELL:801-555-1111
EMAIL:john@example.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
TEL;TYPE=WORK:801-555-2222
TEL;TYPE=CELL;TYPE=pref:801-555-3333
END:VCARD
BEGIN:VCARD
VERSION:4.0
FN:Acme Plumbing
ORG:Acme Plumbing
EMAIL:contact@acme.com
END:VCARD
`;
const r2 = parseVcards(multi);
console.log('\nMulti-card export:');
check('parsed 3 cards', r2.length === 3, `got ${r2.length}`);
check('John has phone', r2[0]?.phone === '801-555-1111', r2[0]?.phone);
check('Jane prefers CELL+pref over WORK', r2[1]?.phone === '801-555-3333', r2[1]?.phone);
check('Acme name from FN only', r2[2]?.fullName === 'Acme Plumbing', r2[2]?.fullName);

// ── Test 3: vCard 2.1 with bare TYPE params + escaped commas/semicolons
const v21 = `BEGIN:VCARD
VERSION:2.1
N:O'Brien;Patrick
FN:Patrick O'Brien
TEL;CELL:555-9999
EMAIL;INTERNET:pat\\,obrien@test.com
NOTE:Line one\\nLine two\\; with semicolon
END:VCARD
`;
const r3 = parseVcards(v21);
console.log('\nvCard 2.1 with bare params + escapes:');
check('parsed 1 card', r3.length === 1, `got ${r3.length}`);
check('bare CELL → phone', r3[0]?.phone === '555-9999', r3[0]?.phone);
check('escaped comma decoded', r3[0]?.email === 'pat,obrien@test.com', r3[0]?.email);
check('escaped semicolon + \\n in note', r3[0]?.notes?.includes('Line one\nLine two; with semicolon'), r3[0]?.notes);

// ── Test 4: Empty / malformed input
console.log('\nEmpty / malformed input:');
check('empty string → 0 cards', parseVcards('').length === 0);
check('garbage → 0 cards', parseVcards('not a vcard\nrandom text').length === 0);
check('card with no useful data → skipped', parseVcards('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD').length === 0);

console.log(`\n${failures === 0 ? '✅ all parser tests passed' : `❌ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
