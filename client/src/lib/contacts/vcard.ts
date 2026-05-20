// vCard parser tolerant enough for Apple Contacts exports (vCard 3.0 / 4.0).
// Handles: line folding, Apple's "itemN." property grouping, vCard 2.1 bare
// TYPE params (e.g. "TEL;CELL:"), multiple TEL/EMAIL entries (prefers CELL),
// structured N and ADR fields, and standard backslash escapes.

export interface ParsedVCard {
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  company?: string;
  jobAddress?: string;
  city?: string;
  notes?: string;
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

interface ParsedLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): ParsedLine | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const parts = head.split(';');
  let name = parts[0];
  // Strip Apple's "itemN." grouping prefix
  const dot = name.indexOf('.');
  if (dot >= 0) name = name.slice(dot + 1);
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf('=');
    if (eq < 0) {
      // bare param (vCard 2.1) — treat as TYPE
      params.TYPE = params.TYPE ? `${params.TYPE},${p}` : p;
    } else {
      const key = p.slice(0, eq).toUpperCase();
      const val = p.slice(eq + 1);
      params[key] = params[key] ? `${params[key]},${val}` : val;
    }
  }
  return { name: name.toUpperCase(), params, value };
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseVcards(text: string): ParsedVCard[] {
  const lines = unfold(text);
  const cards: ParsedVCard[] = [];
  let current: ParsedVCard | null = null;
  let phoneCandidates: { value: string; isCell: boolean; isPref: boolean }[] = [];

  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) {
      current = { firstName: '', lastName: '', fullName: '' };
      phoneCandidates = [];
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (current) {
        if (!current.phone && phoneCandidates.length > 0) {
          const pref = phoneCandidates.find(p => p.isPref && p.isCell)
            || phoneCandidates.find(p => p.isCell)
            || phoneCandidates.find(p => p.isPref)
            || phoneCandidates[0];
          current.phone = pref.value;
        }
        if (!current.fullName) {
          current.fullName = `${current.firstName} ${current.lastName}`.trim();
        }
        if (current.fullName || current.email || current.phone) {
          cards.push(current);
        }
      }
      current = null;
      phoneCandidates = [];
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    const decoded = unescape(value).trim();
    if (!decoded) continue;

    switch (name) {
      case 'FN': {
        current.fullName = decoded;
        if (!current.firstName && !current.lastName) {
          const parts = decoded.split(/\s+/);
          current.firstName = parts[0] || '';
          current.lastName = parts.slice(1).join(' ');
        }
        break;
      }
      case 'N': {
        // N: LastName;FirstName;MiddleName;Prefix;Suffix
        const parts = decoded.split(';');
        if (parts[0]) current.lastName = parts[0];
        if (parts[1]) current.firstName = parts[1];
        break;
      }
      case 'EMAIL': {
        if (!current.email) current.email = decoded;
        break;
      }
      case 'TEL': {
        const type = (params.TYPE || '').toUpperCase();
        const isCell = /CELL|MOBILE|IPHONE/.test(type);
        const isPref = /PREF/.test(type) || params.PREF === '1';
        phoneCandidates.push({ value: decoded, isCell, isPref });
        break;
      }
      case 'ORG': {
        current.company = decoded.split(';')[0];
        break;
      }
      case 'ADR': {
        // ;;Street;City;State;Postal;Country
        const parts = decoded.split(';');
        const street = parts[2] || '';
        const city = parts[3] || '';
        const state = parts[4] || '';
        const postal = parts[5] || '';
        const cityState = [city, state].filter(Boolean).join(', ');
        const tail = [cityState, postal].filter(Boolean).join(' ');
        const formatted = [street, tail].filter(Boolean).join(', ').trim();
        if (formatted && !current.jobAddress) current.jobAddress = formatted;
        if (city && !current.city) current.city = city;
        break;
      }
      case 'NOTE': {
        if (!current.notes) current.notes = decoded;
        break;
      }
    }
  }
  return cards;
}
