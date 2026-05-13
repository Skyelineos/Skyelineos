import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc, addDoc, collection, getDocs, query, serverTimestamp } from "firebase/firestore";
import { useLocation } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { getDefaultRouteForRole } from "@/utils/roleRedirects";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Building2, Mail, Lock, Loader2, CheckCircle2, User, HardHat, UserCheck, Users, Palette, ChevronRight, ArrowLeft, MapPin, Wrench, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type AccountType = 'client' | 'sub' | 'team' | 'designer' | null;

const TEAM_PERMISSIONS = [
  { id: 'view_projects', label: 'View Projects' },
  { id: 'manage_schedule', label: 'Manage Schedule' },
  { id: 'manage_tasks', label: 'Manage Tasks' },
  { id: 'view_financials', label: 'View Financials' },
  { id: 'manage_documents', label: 'Manage Documents' },
  { id: 'messaging', label: 'Messaging' },
];

const SUB_TRADES = [
  'Concrete / Foundation',
  'Framing / Rough Carpentry',
  'Roofing',
  'Electrical',
  'Plumbing',
  'HVAC / Mechanical',
  'Insulation',
  'Drywall',
  'Flooring',
  'Tile',
  'Painting',
  'Cabinets / Millwork',
  'Countertops',
  'Windows & Doors',
  'Exterior Finishes / Siding',
  'Masonry / Stonework',
  'Landscaping / Site Work',
  'Cleaning / Final',
  'Other...',
];

export default function SignIn() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Registration modal state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regPermissions, setRegPermissions] = useState<string[]>([]);
  const [regTrade, setRegTrade] = useState("");
  const [regOtherTrade, setRegOtherTrade] = useState("");
  const [regProjectAddress, setRegProjectAddress] = useState("");
  const [regProjectCity, setRegProjectCity] = useState("");

  const { user, isAuthenticated, loading, authLoading } = useAuth();

  useEffect(() => {
    if (!loading && !authLoading && isAuthenticated && user) {
      // Honor ?next=<url> from the URL if present — this is set by
      // ProtectedRoute when a deep link required auth, so emailed bid-package
      // links land the sub right on the requested bid after sign-in.
      const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
      const next = params?.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      setLocation(safeNext || getDefaultRouteForRole(user.role as any));
    }
  }, [user, isAuthenticated, loading, authLoading, setLocation]);

  // Pre-fill the sign-in email from ?email=<addr> so subs landing via an
  // emailed bid invite don't have to re-type their address.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('email');
    if (prefill && !email) setEmail(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve ?invite=<token> on mount: pre-fill the registration email + name
  // so the visitor lands in the "Create account" flow with their info ready.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'portalInvites'),
          where('token', '==', token),
        ));
        if (snap.empty) return;
        const data = snap.docs[0].data() as any;
        if (data.status !== 'pending') return;
        setRegEmail(String(data.email || ''));
        setRegName(String(data.firstName || ''));
        // Open the registration drawer automatically.
        setRegisterOpen(true);
      } catch {/* best-effort */}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1a1814 0%, #2a2520 50%, #1a1814 100%)' }}>
        <Card className="w-full max-w-md border-0 shadow-2xl" style={{ background: 'rgba(250,250,246,0.98)' }}>
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#C9A96E' }} />
            <p className="text-sm font-sans" style={{ color: '#4A4540' }}>Redirecting to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEmailSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      let msg = "An error occurred during sign in.";
      let isAccessRevoked = false;
      if (e.code === "auth/user-not-found") {
        msg = "No account found with this email address.";
      } else if (e.code === "auth/user-disabled") {
        msg = "This account has been disabled. Please contact Skyeline Homes for assistance.";
        isAccessRevoked = true;
      } else if (e.code === "auth/wrong-password") {
        msg = "Incorrect password.";
      } else if (e.code === "auth/invalid-email") {
        msg = "Invalid email address.";
      } else if (e.code === "auth/too-many-requests") {
        msg = "Too many failed attempts. Please try again later.";
      } else if (e.code === "auth/invalid-credential") {
        msg = "Incorrect email or password. If you believe your access was removed, contact Skyeline Homes.";
        isAccessRevoked = false;
      } else if (e.message) {
        msg = e.message;
      }
      setError(msg);
      if (isAccessRevoked) {
        toast({ title: "Account access revoked", description: msg, variant: "destructive" });
      }
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const target = resetEmail.trim();
    if (!target) {
      toast({ title: 'Email required', description: 'Enter the email address tied to your account.', variant: 'destructive' });
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, target);
      toast({
        title: 'Reset link sent',
        description: `If an account exists for ${target}, a password reset email is on its way. Check your inbox (and spam folder).`,
      });
      setResetOpen(false);
      setResetEmail('');
    } catch (e: any) {
      // Most Firebase errors here surface the email — but we deliberately
      // show a generic message so the form can't be used to probe for
      // valid emails. Log the underlying error for debugging only.
      // eslint-disable-next-line no-console
      console.warn('Password reset error:', e?.code || e);
      toast({
        title: 'Reset link sent',
        description: `If an account exists for ${target}, a password reset email is on its way. Check your inbox (and spam folder).`,
      });
      setResetOpen(false);
      setResetEmail('');
    } finally {
      setResetSending(false);
    }
  };

  const openRegister = () => {
    setRegEmail(email);
    setRegPassword(password);
    setRegStep(1);
    setAccountType(null);
    setRegName("");
    setRegCompany("");
    setRegPermissions([]);
    setRegTrade("");
    setRegOtherTrade("");
    setRegProjectAddress("");
    setRegProjectCity("");
    setRegisterOpen(true);
  };

  const roleLabel = (type: AccountType) => {
    if (type === 'client') return 'client';
    if (type === 'sub') return 'sub';
    if (type === 'designer') return 'designer';
    // Team members start pending — an admin (Tyler) approves them from
    // the dashboard before they get full admin access.
    if (type === 'team') return 'pending_team';
    return 'client';
  };

  const handleRegisterSubmit = async () => {
    if (!accountType || !regName || !regEmail || !regPassword) return;
    if (regPassword !== regConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      const uid = cred.user.uid;
      const role = roleLabel(accountType);
      const isOtherTrade = accountType === 'sub' && regTrade === 'Other...';
      const finalTrade = isOtherTrade ? regOtherTrade.trim() : regTrade;

      // If sub selected "Other", create a pending trade request for Tyler to approve
      if (isOtherTrade && regOtherTrade.trim()) {
        await addDoc(collection(db, 'pendingTrades'), {
          tradeName: regOtherTrade.trim(),
          requestedBy: regName,
          requestedByEmail: regEmail,
          requestedByUid: uid,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }

      // For homeowners, try to find a matching client record by address
      let linkedClientId: string | null = null;
      if (accountType === 'client' && regProjectAddress.trim()) {
        const clientsSnap = await getDocs(query(collection(db, 'clients')));
        const normInput = regProjectAddress.trim().toLowerCase();
        const match = clientsSnap.docs.find(d => {
          const data = d.data();
          const clientAddr = [data.jobAddress, data.city].filter(Boolean).join(' ').toLowerCase();
          return clientAddr.includes(normInput.split(' ')[0]) && normInput.split(' ')[0].length > 2;
        });
        if (match) {
          linkedClientId = match.id;
          // Link the user UID to the client record
          await setDoc(doc(db, 'clients', match.id), { linkedUserId: uid }, { merge: true });
        }
      }

      // Contact linking: match an existing contact by email OR phone OR full
      // name (any one matches). If none match, create a new contact tagged
      // with the role they chose. Either way the user record gets linked.
      const contactRoleFor = (t: AccountType): string => (
        t === 'client' ? 'client'
        : t === 'sub' ? 'subcontractor'
        : t === 'designer' ? 'designer'
        : 'employee'
      );
      const contactRole = contactRoleFor(accountType);
      // Normalize phone to digits-only so "(208) 555-1234" matches "2085551234".
      const normalizePhone = (p: string) => String(p || '').replace(/\D/g, '');
      let linkedContactId: string | null = null;
      try {
        const emailLower = regEmail.trim().toLowerCase();
        const phoneDigits = normalizePhone(regPhone);
        const nameLower = regName.trim().toLowerCase();
        const contactsSnap = await getDocs(collection(db, 'contacts'));
        const matchingContact = contactsSnap.docs.find(d => {
          const data = d.data() as any;
          const e = String(data.email || '').trim().toLowerCase();
          if (e && e === emailLower) return true;
          const p = normalizePhone(data.phone);
          if (p && phoneDigits && p === phoneDigits) return true;
          const n = String(data.name || '').trim().toLowerCase();
          if (n && nameLower && n === nameLower) return true;
          return false;
        });
        if (matchingContact) {
          // Found an existing contact — link this user to it. Only fill in
          // fields that are blank so we don't overwrite GC-curated data.
          const existing = matchingContact.data() as any;
          const update: Record<string, any> = {
            linkedUserId: uid,
            hasPortalAccess: true,
            updatedAt: serverTimestamp(),
          };
          if (!existing.role) update.role = contactRole;
          if (!existing.name) update.name = regName;
          if (!existing.email) update.email = regEmail;
          if (!existing.phone && regPhone.trim()) update.phone = regPhone.trim();
          if (accountType === 'sub' && finalTrade) {
            const arr: string[] = Array.isArray(existing.trades) ? existing.trades : [];
            const legacy = String(existing.trade || '').trim();
            const merged = Array.from(new Set([
              ...arr,
              ...(legacy ? [legacy] : []),
              finalTrade,
            ].filter(Boolean)));
            update.trades = merged;
            update.trade = merged[0];
          }
          if (accountType === 'sub' && regCompany && !existing.company) {
            update.company = regCompany;
          }
          await setDoc(doc(db, 'contacts', matchingContact.id), update, { merge: true });
          linkedContactId = matchingContact.id;
        } else {
          // No direct contact match — but a CLIENT contact might have listed
          // this person as their spouse (inline spouseEmail). In that case,
          // create a new contact AND mirror the link both ways.
          let spouseOfContactId = '';
          const inlineSpouseMatch = contactsSnap.docs.find(d => {
            const data = d.data() as any;
            const e = String(data.spouseEmail || '').trim().toLowerCase();
            return e && e === emailLower;
          });
          if (inlineSpouseMatch) spouseOfContactId = inlineSpouseMatch.id;

          const newContactRef = await addDoc(collection(db, 'contacts'), {
            name: regName,
            email: regEmail,
            phone: regPhone.trim(),
            company: accountType === 'sub' ? (regCompany || '') : '',
            role: contactRole,
            trade: accountType === 'sub' && finalTrade ? finalTrade : '',
            trades: accountType === 'sub' && finalTrade ? [finalTrade] : [],
            isActive: true,
            hasPortalAccess: true,
            linkedUserId: uid,
            spouseContactId: spouseOfContactId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          linkedContactId = newContactRef.id;

          // Mirror the spouse link back onto the existing client's contact —
          // they had only inline spouse info before; now point to the real doc.
          if (spouseOfContactId) {
            try {
              await setDoc(doc(db, 'contacts', spouseOfContactId), {
                spouseContactId: newContactRef.id,
                updatedAt: serverTimestamp(),
              }, { merge: true });
            } catch {/* best-effort */}
          }
        }
      } catch (e: any) {
        // Surface but don't block signup — admin can fix later.
        // eslint-disable-next-line no-console
        console.error('Contact linking failed:', e?.message || e);
      }

      // Write user profile to Firestore
      await setDoc(doc(db, 'users', uid), {
        email: regEmail,
        name: regName,
        role,
        company: regCompany || null,
        linkedContactId,
        ...(accountType === 'sub' && finalTrade ? { trade: finalTrade, tradeIsCustom: isOtherTrade } : {}),
        ...(accountType === 'client' && regProjectAddress.trim() ? {
          projectAddress: regProjectAddress.trim(),
          projectCity: regProjectCity.trim() || null,
          linkedClientId,
        } : {}),
        active: accountType !== 'team',
        status: accountType === 'team' ? 'pending_approval' : 'active',
        requestedPermissions: accountType === 'team' ? regPermissions : [],
        createdAt: serverTimestamp(),
      });

      setRegisterOpen(false);

      const typeLabel = accountType === 'client' ? 'Home Owner' : accountType === 'sub' ? 'Subcontractor' : accountType === 'designer' ? 'Interior Designer' : 'Skyeline Homes Team Member';

      // Team members must wait for admin approval before they can access
      // anything, so we sign them out and show a clear waiting message.
      // Clients / subs / designers are auto-approved — leave them signed
      // in and let the auth-state effect route them straight into their
      // portal so onboarding is one continuous flow.
      if (accountType === 'team') {
        await signOut(auth);
        setEmail(regEmail);
        setPassword("");
        setSuccessMessage(`${typeLabel} account created! Your request is pending admin approval — you'll be able to sign in once Tyler approves your request.`);
        toast({
          title: 'Request submitted',
          description: 'A team admin will review your account shortly.',
          duration: 6000,
        });
      } else {
        const extraMsg = isOtherTrade
          ? ' Your trade has been submitted for review.'
          : linkedClientId
            ? ' Your project address was matched to an existing record.'
            : '';
        toast({
          title: `Welcome, ${regName.split(' ')[0] || typeLabel}!`,
          description: `Account created.${extraMsg} Taking you to your portal…`,
          duration: 4000,
        });
        // The useEffect that watches `isAuthenticated` will pick up the
        // new auth state and route to /<role>-portal automatically.
      }
    } catch (e: any) {
      let msg = "An error occurred.";
      if (e.code === "auth/email-already-in-use") msg = "An account with this email already exists.";
      else if (e.code === "auth/weak-password") msg = "Password should be at least 6 characters.";
      else if (e.code === "auth/invalid-email") msg = "Invalid email address.";
      else if (e.message) msg = e.message;
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePermission = (id: string) => {
    setRegPermissions(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const accountTypes = [
    {
      type: 'client' as AccountType,
      icon: UserCheck,
      title: 'Home Owner',
      description: 'Access your project status, selections, documents, and communicate with your build team.',
    },
    {
      type: 'sub' as AccountType,
      icon: HardHat,
      title: 'Subcontractor',
      description: 'View job assignments, submit timesheets, and manage your work with Skyeline Homes.',
    },
    {
      type: 'designer' as AccountType,
      icon: Palette,
      title: 'Interior Designer',
      description: 'Access design boards, material selections, and collaborate with the Skyeline Homes build team.',
    },
    {
      type: 'team' as AccountType,
      icon: Users,
      title: 'Skyeline Homes Team Member',
      description: 'Internal staff. Request the access you need — admin will review and approve.',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1a1814 0%, #2a2520 50%, #1a1814 100%)' }}>
      <Card className="w-full max-w-md border-0 shadow-2xl" style={{ background: 'rgba(250,250,246,0.98)' }}>
        <CardHeader className="text-center pb-6 pt-8">
          <div className="flex justify-center mb-2">
            <img
              src="/logos/logo-transparent-cropped.png"
              alt="Skyeline Homes"
              className="w-auto object-contain"
              style={{ height: '200px', maxWidth: '420px' }}
            />
          </div>
          <CardDescription className="text-xs font-sans font-medium tracking-widest uppercase" style={{ color: '#C9A96E', letterSpacing: '0.15em' }}>
            Project Management Portal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {successMessage && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">{successMessage}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="border-red-400 bg-red-50">
              <AlertDescription className="text-red-800 font-medium">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input id="email" type="email" placeholder="Enter your email" value={email}
                onChange={(e) => setEmail(e.target.value)} className="pl-10" disabled={isLoading} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input id="password" type="password" placeholder="Enter your password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="pl-10" disabled={isLoading} />
            </div>
          </div>

          <div className="flex items-center justify-end -mt-1">
            <button
              type="button"
              onClick={() => { setResetEmail(email); setResetOpen(true); }}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
              disabled={isLoading}
            >
              Forgot password?
            </button>
          </div>

          <div className="space-y-2">
            <Button onClick={handleEmailSignIn} className="w-full" disabled={isLoading || !email || !password}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign In
            </Button>
            <Button onClick={openRegister} variant="outline" className="w-full" disabled={isLoading}>
              Create Account
            </Button>
          </div>

        </CardContent>
      </Card>

      {/* Password reset modal — sends a Firebase Auth reset email so the
          user can pick a new password without needing admin intervention. */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email tied to your Skyeline OS account. We'll email you a link to set a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reset-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                className="pl-10"
                autoFocus
                disabled={resetSending}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetSending}>Cancel</Button>
            <Button onClick={handlePasswordReset} disabled={resetSending || !resetEmail.trim()}>
              {resetSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send reset link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registration Modal */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {regStep === 1 ? 'Create Your Account' : `${accountType === 'client' ? 'Home Owner' : accountType === 'sub' ? 'Subcontractor' : accountType === 'designer' ? 'Interior Designer' : 'Skyeline Homes Team Member'} Account`}
            </DialogTitle>
            <DialogDescription>
              {regStep === 1 ? 'Select your account type to get started.' : 'Fill in your details to complete registration.'}
            </DialogDescription>
          </DialogHeader>

          {regStep === 1 ? (
            <div className="space-y-3 pt-2">
              {accountTypes.map(({ type, icon: Icon, title, description }) => (
                <button
                  key={type}
                  onClick={() => { setAccountType(type); setRegStep(2); }}
                  className={cn(
                    "w-full flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50",
                    accountType === type ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  )}
                >
                  <div className="mt-0.5 p-2 rounded-md bg-blue-100">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 mt-1 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <button onClick={() => setRegStep(1)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Back
              </button>

              <div className="space-y-2">
                <Label>Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input placeholder="Your full name" value={regName}
                    onChange={e => setRegName(e.target.value)} className="pl-10" />
                </div>
              </div>

              {accountType === 'sub' && (
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input placeholder="Your company or trade name" value={regCompany}
                    onChange={e => setRegCompany(e.target.value)} />
                </div>
              )}

              {/* Subcontractor — trade selection */}
              {accountType === 'sub' && (
                <div className="space-y-2">
                  <Label>Your Trade *</Label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {SUB_TRADES.map(trade => (
                      <button
                        key={trade}
                        type="button"
                        onClick={() => { setRegTrade(trade); if (trade !== 'Other...') setRegOtherTrade(''); }}
                        className={cn(
                          "text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                          regTrade === trade
                            ? "border-amber-500 bg-amber-50 text-amber-800"
                            : "border-gray-200 text-gray-600 hover:border-gray-400"
                        )}
                      >
                        {trade === 'Other...' ? <span className="italic">{trade}</span> : trade}
                      </button>
                    ))}
                  </div>
                  {regTrade === 'Other...' && (
                    <div className="mt-2 space-y-1">
                      <Label className="text-xs text-gray-500">Describe your trade</Label>
                      <div className="relative">
                        <Wrench className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="e.g. Fireplace / Stone Mason"
                          value={regOtherTrade}
                          onChange={e => setRegOtherTrade(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <p className="text-xs text-amber-600">Tyler will review and add this trade to the system.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Home Owner — project address */}
              {accountType === 'client' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Project / Lot Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="123 Main St or Lot 4"
                        value={regProjectAddress}
                        onChange={e => setRegProjectAddress(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      placeholder="Draper, UT"
                      value={regProjectCity}
                      onChange={e => setRegProjectCity(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-gray-400">We'll use this to connect you with your project data in our system.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input type="email" placeholder="your@email.com" value={regEmail}
                    onChange={e => setRegEmail(e.target.value)} className="pl-10" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Phone <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input type="tel" placeholder="(208) 555-1234" value={regPhone}
                    onChange={e => setRegPhone(e.target.value)} className="pl-10" />
                </div>
                <p className="text-[11px] text-gray-400">
                  Helps us link you to an existing contact record if there is one.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input type="password" placeholder="At least 6 characters" value={regPassword}
                    onChange={e => setRegPassword(e.target.value)} className="pl-10" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input type="password" placeholder="Repeat password" value={regConfirm}
                    onChange={e => setRegConfirm(e.target.value)} className="pl-10" />
                </div>
              </div>

              {accountType === 'team' && (
                <div className="space-y-2">
                  <Label>Request Permissions</Label>
                  <p className="text-xs text-gray-500">Select what access you need. Admin will approve.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {TEAM_PERMISSIONS.map(p => (
                      <button key={p.id} onClick={() => togglePermission(p.id)}
                        className={cn(
                          "px-3 py-2 rounded-md border text-sm text-left transition-colors",
                          regPermissions.includes(p.id)
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        )}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleRegisterSubmit}
                className="w-full"
                disabled={
                  isLoading || !regName || !regEmail || !regPassword || !regConfirm ||
                  (accountType === 'sub' && !regTrade) ||
                  (accountType === 'sub' && regTrade === 'Other...' && !regOtherTrade.trim())
                }
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {accountType === 'team' ? 'Submit for Approval' : 'Create Account'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
