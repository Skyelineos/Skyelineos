import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addDoc, collection, doc, limit, onSnapshot, orderBy, query,
  serverTimestamp, type Timestamp,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Link } from 'wouter';
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Plus, Send, ShieldCheck } from 'lucide-react';

type GoalStatus = 'planned' | 'queued' | 'running' | 'waiting_external' |
  'needs_owner' | 'blocked' | 'stalled' | 'verified_done' | 'canceled';

type Goal = {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  agent?: string;
  nextAction?: string;
  blocker?: string;
  priority?: 'p0' | 'p1' | 'p2';
  milestonesCompleted?: number;
  milestonesTotal?: number;
  runId?: string;
  heartbeatAt?: Timestamp | null;
  leaseExpiresAt?: Timestamp | null;
  nextCheckAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  evidenceUrl?: string;
};

type ActivityEvent = {
  id: string;
  title: string;
  detail?: string;
  goalId?: string;
  source?: string;
  evidenceUrl?: string;
  createdAt?: Timestamp | null;
};

type BridgeHealth = { status?: 'connected' | 'degraded'; message?: string; updatedAt?: Timestamp | null };

type InboxMessage = {
  id: string;
  body: string;
  goalId?: string;
  sender: 'owner' | 'agent';
  agentName?: string;
  deliveryState?: 'awaiting_bridge' | 'queued_to_muse' | 'received' | 'processing' | 'answered' | 'blocked';
  deliveryMessage?: string;
  createdAt?: Timestamp | null;
};

const maxMessageLength = 3000;
const heartbeatWindow = 10 * 60 * 1000;
const statuses: Record<GoalStatus, { text: string; className: string }> = {
  planned: { text: 'Planned', className: 'bg-slate-100 text-slate-700' },
  queued: { text: 'Queued', className: 'bg-blue-50 text-blue-700' },
  running: { text: 'Working', className: 'bg-emerald-50 text-emerald-800' },
  waiting_external: { text: 'Waiting on response', className: 'bg-slate-100 text-slate-700' },
  needs_owner: { text: 'Needs you', className: 'bg-amber-50 text-amber-800' },
  blocked: { text: 'Blocked', className: 'bg-rose-50 text-rose-800' },
  stalled: { text: 'Stalled', className: 'bg-rose-50 text-rose-800' },
  verified_done: { text: 'Verified complete', className: 'bg-emerald-50 text-emerald-800' },
  canceled: { text: 'Canceled', className: 'bg-slate-100 text-brand-dark-gray-blue' },
};

function dateOf(timestamp?: Timestamp | null): Date | null {
  return timestamp && typeof timestamp.toDate === 'function' ? timestamp.toDate() : null;
}

function timeOf(timestamp?: Timestamp | null): string {
  const date = dateOf(timestamp);
  return date ? new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date) : 'Not recorded';
}

// Do not show "Working" unless an actual run is reporting a fresh heartbeat and valid lease.
function effectiveStatus(goal: Goal, now: number): GoalStatus {
  if (goal.status !== 'running') return statuses[goal.status] ? goal.status : 'planned';
  const beat = dateOf(goal.heartbeatAt)?.getTime();
  const lease = dateOf(goal.leaseExpiresAt)?.getTime();
  if (!goal.runId || !beat || !lease || beat > now + 60000 || now - beat > heartbeatWindow || lease <= now) {
    return 'stalled';
  }
  return 'running';
}

function GoalCard({ goal, now, active, onClick, onVerify, disabled }: {
  goal: Goal; now: number; active: boolean; onClick: () => void; onVerify: () => void; disabled: boolean;
}) {
  const status = effectiveStatus(goal, now);
  const meta = statuses[status];
  const total = Number.isFinite(goal.milestonesTotal) ? Math.max(0, goal.milestonesTotal || 0) : 0;
  const finished = Math.min(total, Math.max(0, goal.milestonesCompleted || 0));
  const evidenceSafe = goal.evidenceUrl && /^https:\/\/[^ ]+$/i.test(goal.evidenceUrl);

  return (
    <article className={'rounded-xl border bg-white p-4 ' + (active ? 'border-brand-gold ring-1 ring-brand-gold' : 'border-gray-200')}>
      <button type="button" className="w-full text-left" onClick={onClick} aria-label={'Select goal ' + goal.title}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-gray-500">{(goal.priority || 'p2').toUpperCase()}</span>
          <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + meta.className}>{meta.text}</span>
        </div>
        <h3 className="mt-2 text-base font-semibold text-brand-black">{goal.title}</h3>
        {goal.description && <p className="mt-1 text-sm text-brand-dark-gray-blue">{goal.description}</p>}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Verified milestones</span>
            <span>{total > 0 ? finished + ' of ' + total : 'Not measured'}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={finished}>
            <div className="h-full bg-brand-gold" style={{ width: (total ? 100 * finished / total : 0) + '%' }} />
          </div>
        </div>
        <div className="mt-3 grid gap-1 text-xs text-brand-dark-gray-blue">
          <span><strong>Assigned:</strong> {goal.agent || 'Not assigned'}</span>
          <span><strong>Next action:</strong> {goal.nextAction || 'Not recorded'}</span>
          <span><strong>Last update:</strong> {timeOf(goal.updatedAt)} · <strong>Next check:</strong> {timeOf(goal.nextCheckAt)}</span>
          {status === 'stalled' && <span className="font-semibold text-rose-700">No current run heartbeat. Execution is not confirmed.</span>}
          {goal.blocker && <span className="font-medium text-rose-700">Blocker: {goal.blocker}</span>}
        </div>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {evidenceSafe && <a className="inline-block text-xs font-medium text-blue-700 underline" href={goal.evidenceUrl} target="_blank" rel="noreferrer">View evidence</a>}
        {evidenceSafe && ['waiting_external', 'needs_owner'].includes(status) && <button disabled={disabled} onClick={onVerify} type="button" className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-800 disabled:opacity-50">Verify complete</button>}
      </div>
    </article>
  );
}

export default function AiOperations() {
  const { user, firebaseUser } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string>('all');
  const [tab, setTab] = useState<'goals' | 'inbox' | 'activity'>('goals');
  const [newGoal, setNewGoal] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const email = (firebaseUser?.email || user?.email || '').toLowerCase();
  const isOwner = user?.role === 'admin' &&
    (email === 'tyler@skyelinehomes.com' || email === 'info@skyelinehomes.com');

  useEffect(() => {
    if (!isOwner) return;
    const stopGoals = onSnapshot(
      query(collection(db, 'ownerGoals'), orderBy('updatedAt', 'desc'), limit(100)),
      snapshot => { setGoals(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Goal))); },
      err => setError('Goal sync unavailable: ' + err.message)
    );
    const stopMessages = onSnapshot(
      query(collection(db, 'ownerAgentMessages'), orderBy('createdAt', 'desc'), limit(100)),
      snapshot => { setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InboxMessage)).reverse()); },
      err => setError('Assistant inbox sync unavailable: ' + err.message)
    );
    const stopEvents = onSnapshot(
      query(collection(db, 'ownerGoalEvents'), orderBy('createdAt', 'desc'), limit(100)),
      snapshot => { setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityEvent))); },
      err => setError('Activity history sync unavailable: ' + err.message)
    );
    const stopBridge = onSnapshot(doc(db, 'ownerAiBridge', 'health'),
      snap => setBridge(snap.exists() ? (snap.data() as BridgeHealth) : null),
      err => setError('Agent bridge health unavailable: ' + err.message));
    return () => { stopGoals(); stopMessages(); stopEvents(); stopBridge(); };
  }, [isOwner]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => ({
    open: goals.filter(g => !['verified_done', 'canceled'].includes(effectiveStatus(g, now))).length,
    active: goals.filter(g => effectiveStatus(g, now) === 'running').length,
    needYou: goals.filter(g => effectiveStatus(g, now) === 'needs_owner').length,
    stuck: goals.filter(g => ['blocked', 'stalled'].includes(effectiveStatus(g, now))).length,
  }), [goals, now]);
  const visibleMessages = selectedGoal === 'all' ? messages : messages.filter(m => m.goalId === selectedGoal);
  const lastBridgeCheck = dateOf(bridge?.updatedAt)?.getTime() || 0;
  const bridgeOnline = bridge?.status === 'connected' && lastBridgeCheck > now - 40 * 60 * 1000;

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    const title = newGoal.trim();
    if (!isOwner || !firebaseUser || !title || saving) return;
    setSaving(true); setError(null);
    try {
      await addDoc(collection(db, 'ownerGoals'), {
        title, status: 'planned', priority: 'p2', agent: 'Unassigned',
        nextAction: 'Assign agent and follow-up checkpoint',
        createdByUid: firebaseUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setNewGoal('');
    } catch (err) {
      setError('Goal was not saved. ' + (err instanceof Error ? err.message : 'Please retry.'));
    } finally { setSaving(false); }
  }

  async function verifyGoal(goal: Goal) {
    if (!isOwner || saving || !window.confirm('I have checked the source evidence and confirm this goal is complete. Continue?')) return;
    setSaving(true); setError(null);
    try {
      await httpsCallable(functions, 'aiOperationsVerifyGoal')({ goalId: goal.id });
    } catch (err) {
      setError('Could not verify goal. ' + (err instanceof Error ? err.message : 'Please retry.'));
    } finally { setSaving(false); }
  }

  async function sendRequest(event: FormEvent) {
    event.preventDefault();
    const body = newMessage.trim();
    if (!isOwner || !firebaseUser || !body || body.length > maxMessageLength || saving) return;
    setSaving(true); setError(null);
    try {
      await addDoc(collection(db, 'ownerAgentMessages'), {
        body, goalId: selectedGoal === 'all' ? null : selectedGoal, sender: 'owner',
        createdByUid: firebaseUser.uid, deliveryState: 'awaiting_bridge',
        createdAt: serverTimestamp(),
      });
      setNewMessage('');
    } catch (err) {
      setError('Request was not saved. ' + (err instanceof Error ? err.message : 'Please retry.'));
    } finally { setSaving(false); }
  }

  if (!isOwner) {
    return <AppLayout><div className="rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold">AI Operations</h1>
      <p className="mt-2 text-sm text-brand-dark-gray-blue">This private owner workspace is restricted to an approved admin account.</p>
    </div></AppLayout>;
  }

  return <AppLayout>
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Bot size={22} className="text-brand-gold" /><h1 className="text-3xl font-semibold font-heading text-brand-black">AI Operations</h1></div>
          <p className="mt-1 text-sm text-brand-dark-gray-blue">Your goals, agent assignments and private assistant inbox in one place.</p>
        </div>
        <Link href="/financials" className="rounded-lg border border-brand-light-gray-blue bg-white px-3 py-2 text-sm font-medium text-slate-700">Financial dashboard</Link>
      </header>

      <div className={'flex items-start gap-2 rounded-lg border p-3 text-sm ' + (bridgeOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')} role="status">
        {bridgeOnline ? <ShieldCheck className="mt-0.5 shrink-0" size={18} /> : <AlertTriangle className="mt-0.5 shrink-0" size={18} />}
        <p><strong>{bridgeOnline ? 'Muse assignment queue connected.' : 'Agent delivery is not verified.'}</strong> {bridgeOnline ? 'Requests go to the Muse assignment queue. Check individual messages for pickup and replies; this does not directly open a ChatGPT conversation.' : 'Requests are stored safely, but delivery cannot be guaranteed until the bridge is working. ' + (bridge?.message || '')} <a className="underline" href="https://docs.google.com/spreadsheets/d/1TOQe8c0y0_5eIJ7Y1ln6ZJTHc2NAriNjTKa7rk6Od2E/edit" target="_blank" rel="noreferrer">Shared assignment queue</a></p>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Open goals', value: counts.open, icon: Activity },
          { label: 'Verified working', value: counts.active, icon: Bot },
          { label: 'Needs you', value: counts.needYou, icon: Clock3 },
          { label: 'Blocked / stalled', value: counts.stuck, icon: AlertTriangle },
        ].map(stat => <div key={stat.label} className="rounded-xl border border-brand-light-gray-blue bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><stat.icon size={15}/>{stat.label}</div>
          <p className="mt-2 text-2xl font-semibold text-brand-black">{stat.value}</p>
        </div>)}
      </div>

      <div className="flex gap-2 border-b border-brand-light-gray-blue">
        <button onClick={() => setTab('goals')} className={'px-3 py-2 text-sm font-medium ' + (tab === 'goals' ? 'border-b-2 border-[#A9997E] text-brand-black' : 'text-slate-500')}>Active goals</button>
        <button onClick={() => setTab('inbox')} className={'px-3 py-2 text-sm font-medium ' + (tab === 'inbox' ? 'border-b-2 border-[#A9997E] text-brand-black' : 'text-slate-500')}>Assistant inbox</button>
        <button onClick={() => setTab('activity')} className={'px-3 py-2 text-sm font-medium ' + (tab === 'activity' ? 'border-b-2 border-[#A9997E] text-brand-black' : 'text-slate-500')}>Activity history</button>
      </div>

      {tab === 'goals' ? <>
        <form onSubmit={createGoal} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="new-ai-goal" className="sr-only">New goal</label>
          <input id="new-ai-goal" maxLength={160} value={newGoal} onChange={e => setNewGoal(e.target.value)}
            placeholder="Capture a new goal (saved as Planned)"
            className="min-w-0 flex-1 rounded-lg border border-brand-light-gray-blue bg-white px-3 py-2 text-sm" />
          <button disabled={saving || !newGoal.trim()} type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Plus size={16}/>Add goal</button>
        </form>
        {goals.length ? <div className="grid gap-3 lg:grid-cols-2">
          {goals.map(goal => <GoalCard key={goal.id} goal={goal} now={now} active={goal.id === selectedGoal} disabled={saving} onVerify={() => verifyGoal(goal)} onClick={() => { setSelectedGoal(goal.id); setTab('inbox'); }}/>)}
        </div> : <div className="rounded-xl border border-dashed border-brand-light-gray-blue bg-white px-6 py-12 text-center">
          <TargetIcon/><h2 className="mt-3 font-semibold text-brand-black">No synced goals yet</h2>
          <p className="mt-1 text-sm text-brand-dark-gray-blue">Existing Muse and GitHub work will appear after the task bridge is connected. Add a goal above to save it now.</p>
        </div>}
      </> : tab === 'inbox' ? <div className="rounded-xl border border-brand-light-gray-blue bg-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold text-brand-black">Assistant inbox</h2><p className="text-xs text-slate-500">Private, timestamped requests. Agent delivery and pickup status are shown per message.</p></div>
          <label className="text-xs text-brand-dark-gray-blue">Related goal <select className="ml-2 rounded-md border border-brand-light-gray-blue p-2 text-sm" value={selectedGoal} onChange={e => setSelectedGoal(e.target.value)}>
            <option value="all">General</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select></label>
        </div>
        <div className="max-h-[480px] min-h-[160px] space-y-3 overflow-auto rounded-lg bg-brand-cream p-3">
          {visibleMessages.length ? visibleMessages.map(msg => <div key={msg.id} className={'rounded-lg border p-3 text-sm ' + (msg.sender === 'owner' ? 'border-brand-light-gray-blue bg-white' : 'border-blue-100 bg-blue-50')}>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs font-medium text-slate-500">
              <span>{msg.sender === 'owner' ? 'You' : msg.agentName || 'Agent'} · {timeOf(msg.createdAt)}</span>
              {msg.sender === 'owner' && <span>{msg.deliveryState === 'awaiting_bridge' || !msg.deliveryState ? 'Saved — not dispatched' : msg.deliveryState === 'queued_to_muse' ? 'Queued with Muse' : msg.deliveryState === 'processing' ? 'Muse acknowledged' : msg.deliveryState === 'answered' ? 'Response received' : msg.deliveryState === 'blocked' ? 'Blocked — action needed' : msg.deliveryState}</span>}
            </div>
            <p className="whitespace-pre-wrap break-words text-brand-black">{msg.body}</p>
            {msg.deliveryMessage && <p className="mt-1 text-xs text-slate-500">{msg.deliveryMessage}</p>}
          </div>) : <p className="py-12 text-center text-sm text-slate-500">No requests saved in this conversation yet.</p>}
        </div>
        <form onSubmit={sendRequest} className="mt-4 space-y-2">
          <label htmlFor="ai-request" className="block text-xs font-medium text-slate-700">Send a request to the assistant queue</label>
          <textarea id="ai-request" rows={3} maxLength={maxMessageLength} value={newMessage} onChange={e => setNewMessage(e.target.value)}
            placeholder="Describe what needs handling. Submission saves the request; delivery is confirmed separately."
            className="w-full rounded-lg border border-brand-light-gray-blue p-3 text-sm" />
          <div className="flex justify-between gap-2">
            <span className="text-xs text-slate-500">{newMessage.length} / {maxMessageLength} characters</span>
            <button type="submit" disabled={saving || !newMessage.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Send size={15}/>Submit request</button>
          </div>
        </form>
      </div> : <section className="rounded-xl border border-brand-light-gray-blue bg-white p-4 sm:p-6">
        <h2 className="font-semibold text-brand-black">Verified activity history</h2>
        <p className="mt-1 text-sm text-slate-500">Read-only events written by the trusted agent integration. An empty list does not mean agents are running.</p>
        <div className="mt-4 space-y-3">
          {events.length ? events.map(ev => <div key={ev.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm text-brand-black">{ev.title}</strong><span className="text-xs text-slate-500">{timeOf(ev.createdAt)}</span></div>
            {ev.detail && <p className="mt-1 text-sm text-brand-dark-gray-blue">{ev.detail}</p>}
            {ev.source && <p className="mt-1 text-xs text-slate-500">Source: {ev.source}</p>}
            {ev.evidenceUrl && /^https:\/\/[^ ]+$/i.test(ev.evidenceUrl) && <a href={ev.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-700 underline">View evidence</a>}
          </div>) : <p className="rounded-lg bg-brand-cream p-8 text-center text-sm text-slate-500">No agent events have been verified and synced yet.</p>}
        </div>
      </section>}

      <footer className="flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-slate-500">
        <ShieldCheck size={15}/> Restricted to verified owner-admin accounts. Agent execution is never inferred from a chat reply.
        <a className="ml-auto underline" href="https://github.com/Skyelineos/Skyelineos/issues/118" target="_blank" rel="noreferrer">Implementation tracker</a>
      </footer>
    </div>
  </AppLayout>;
}

function TargetIcon() {
  return <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F3EFE7]"><CheckCircle2 className="text-brand-gold" size={22}/></div>;
}
