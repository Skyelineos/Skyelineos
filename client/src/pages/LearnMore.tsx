import { useState } from 'react';

// Public, no-auth lead-capture page for the Crestview Solace model-home QR sign.
// Submits to POST /api/leads/public-intake, which writes into `clients` so the
// lead lands in Sales/CRM. Branded + mobile-first (built for phone scans).

const GOLD = '#C9A96E';
const BLACK = '#141414';

const CITIES = ['St. George', 'Washington', 'Hurricane', 'Ivins', 'Santa Clara', 'Cedar City', 'Enterprise', 'Other'];
const INTERESTS = [
  'Building a Custom Home', 'Learning More About Crestview Solace', 'Product & Finish Information',
  'Design Services', 'Remodel or Addition', 'Investment or Spec Home Opportunities', 'Future Skyeline Homes Projects',
];
const TIMELINES = ['Within 3 Months', 'Within 6 Months', 'Within 12 Months', '1–2 Years', 'Just Gathering Information'];
const BUDGETS = ['Under $1 Million', '$1 Million – $1.5 Million', '$1.5 Million – $2 Million', '$2 Million+'];
const LOT = ['Yes', 'No', 'Currently Looking'];
const HELP = [
  'Schedule a Consultation', 'Receive Pricing Information', 'Receive Floor Plan Ideas',
  'Receive Crestview Solace Product & Vendor Information', 'Tour Another Skyeline Homes Project',
  'Speak With a Builder', 'Join Our Email List',
];

interface FormState {
  fullName: string; phone: string; email: string; preferredContact: string; city: string;
  interests: string[]; timeline: string; budgetRange: string; ownsLot: string;
  projectVision: string; helpWith: string[]; consent: boolean; website: string;
}

const EMPTY: FormState = {
  fullName: '', phone: '', email: '', preferredContact: '', city: '',
  interests: [], timeline: '', budgetRange: '', ownsLot: '',
  projectVision: '', helpWith: [], consent: false, website: '',
};

export default function LearnMore() {
  const [f, setF] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // The same branded form backs many lead-gen avenues. Each entry point (a QR
  // sign at the model home, an ad landing-page link, a website button) carries
  // its own `?source=` + `?campaign=` so every lead is labeled with where it
  // came from. Defaults to the Crestview model-home open house when unset.
  //   /learn-more                               → event · Crestview Solace · Build #27
  //   /learn-more?source=ad_campaign&campaign=Meta%20Spring%20Reno
  //   /learn-more?source=website
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const source = params.get('source') || 'event';
  const campaign = params.get('campaign') || 'Crestview Solace · Build #27';

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }));
  const toggle = (k: 'interests' | 'helpWith', v: string) =>
    setF(prev => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter(x => x !== v) : [...prev[k], v] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.fullName.trim()) return setError('Please enter your name.');
    if (!f.email.trim() && !f.phone.trim()) return setError('Please enter an email or phone number.');
    if (!f.consent) return setError('Please agree to be contacted so we can reach you.');

    setSubmitting(true);
    try {
      const res = await fetch('/api/leads/public-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, source, sourceDetail: campaign }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ backgroundColor: '#F8F7F2' }} className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-5">
          <img src="/logos/logo-dark-cropped.png" alt="Skyeline Homes" className="h-20 mx-auto object-contain" />
          <h1 className="text-2xl font-bold" style={{ color: BLACK }}>Thank You for Visiting Crestview Solace</h1>
          <p className="text-gray-600 leading-relaxed">
            We appreciate your interest in Skyeline Homes. A member of our team will review your
            information and contact you soon. If you requested product or vendor information from
            Crestview Solace, we’ll provide those details as quickly as possible.
          </p>
          <p className="text-sm tracking-wide" style={{ color: GOLD }}>
            Building Extraordinary Homes Through Extraordinary Experiences
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#F8F7F2' }} className="min-h-screen py-8 px-4">
      <form onSubmit={submit} className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src="/logos/logo-dark-cropped.png" alt="Skyeline Homes" className="h-20 mx-auto object-contain" />
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: GOLD, letterSpacing: '0.18em' }}>
            Crestview Solace · Build #27
          </p>
          <h1 className="text-2xl font-bold" style={{ color: BLACK }}>Learn More About This Home</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Interested in building a custom home, the products and finishes in this residence, or
            speaking with our team? Share your info and a member of our team will reach out shortly.
          </p>
        </div>

        <Card title="Your Contact Info">
          <Field label="Full Name" required>
            <input className={inputCls} value={f.fullName} onChange={e => set('fullName', e.target.value)} required />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone" required>
              <input type="tel" className={inputCls} value={f.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Email" required>
              <input type="email" className={inputCls} value={f.email} onChange={e => set('email', e.target.value)} />
            </Field>
          </div>
          <Field label="Preferred Method of Contact">
            <Radios options={['Phone Call', 'Text Message', 'Email']} value={f.preferredContact} onChange={v => set('preferredContact', v)} />
          </Field>
          <Field label="City or Area You Plan to Build In">
            <select className={inputCls} value={f.city} onChange={e => set('city', e.target.value)}>
              <option value="">Select…</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </Card>

        <Card title="What Are You Interested In?">
          <Checks options={INTERESTS} values={f.interests} onToggle={v => toggle('interests', v)} />
        </Card>

        <Card title="Your Project">
          <Field label="Are You Planning to Build?">
            <Radios options={TIMELINES} value={f.timeline} onChange={v => set('timeline', v)} />
          </Field>
          <Field label="Estimated Project Budget">
            <Radios options={BUDGETS} value={f.budgetRange} onChange={v => set('budgetRange', v)} />
          </Field>
          <Field label="Do You Already Own a Lot?">
            <Radios options={LOT} value={f.ownsLot} onChange={v => set('ownsLot', v)} />
          </Field>
          <Field label="Tell Us About Your Project">
            <textarea
              className={`${inputCls} min-h-[90px]`}
              placeholder="Your vision, desired square footage, style preferences, location, and anything else you’d like us to know."
              value={f.projectVision}
              onChange={e => set('projectVision', e.target.value)}
            />
          </Field>
        </Card>

        <Card title="How Can We Help?">
          <Checks options={HELP} values={f.helpWith} onToggle={v => toggle('helpWith', v)} />
        </Card>

        {/* Honeypot — hidden from real users; bots fill it and get dropped. */}
        <input
          type="text" tabIndex={-1} autoComplete="off" value={f.website}
          onChange={e => set('website', e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          aria-hidden="true"
        />

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={f.consent} onChange={e => set('consent', e.target.checked)} />
          <span>
            I agree to receive communications from Skyeline Homes regarding custom home building
            opportunities, project information, and related services.
          </span>
        </label>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: BLACK }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>

        <p className="text-center text-xs" style={{ color: GOLD }}>Skyeline Homes · Mapleton, Utah</p>
      </form>
    </div>
  );
}

// ─── small presentational helpers ────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/40 bg-white';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#141414' }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

function Radios({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="radio" checked={value === o} onChange={() => onChange(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

function Checks({ options, values, onToggle }: { options: string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <label key={o} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={values.includes(o)} onChange={() => onToggle(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}
