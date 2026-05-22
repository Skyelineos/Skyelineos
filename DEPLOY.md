# Skyelineos — Firebase Deployment Guide
### Skyeline Homes · skyelineos

This is a full-stack app: React frontend (Firebase Hosting) + Express API (Firebase Cloud Functions) + Firestore database.

---

## STEP 1 — Install Node.js (one time)

In your terminal run:
```
brew install node
```
Then verify:
```
node --version   # should show v18 or v20
npm --version
```

---

## STEP 2 — Install Firebase CLI (one time)

```
npm install -g firebase-tools
firebase login
```
This opens a browser. Sign in with the Google account that owns the `skyelineos` project.

---

## STEP 3 — Get Your Firebase Config

1. Go to https://console.firebase.google.com
2. Open project **skyelineos**
3. Click the gear icon → **Project Settings**
4. Scroll to **Your apps** → click your web app
5. Copy the `firebaseConfig` values

---

## STEP 4 — Set Up Environment File

In your terminal, from the project folder:
```
cd ~/Downloads/skyelineos-clean
cp .env.local.example .env
```
Open `.env` and fill in each `VITE_FIREBASE_*` line with the values from Step 3.

---

## STEP 5 — Install Dependencies

```
cd ~/Downloads/skyelineos-clean
npm install
cd functions && npm install && cd ..
```

---

## STEP 6 — Build the App

```
cd ~/Downloads/skyelineos-clean
npm run build
```
This produces `dist/public/` (the frontend) and compiles the Cloud Functions.

---

## STEP 7 — Deploy to Firebase

```
firebase deploy --project skyelineos
```
This deploys:
- **Hosting** → your React frontend (live URL: https://skyelineos.web.app)
- **Cloud Functions** → the API at `/api/*`
- **Firestore rules** → security rules
- **Storage rules**

---

## STEP 8 — Create Your Admin Account

1. Go to https://console.firebase.google.com → skyelineos → **Authentication** → **Users**
2. Click **Add User** → enter `info@skyelinehomes.com` and a strong password
3. Copy the service account key:
   - Firebase Console → Project Settings → **Service Accounts** → **Generate new private key**
   - Save the JSON file as `serviceAccountKey.json` in the project folder
4. Run the setup script:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
   ADMIN_EMAIL=info@skyelinehomes.com \
   ADMIN_NAME="Tyler Rhoton" \
   node scripts/setup-admin.js
   ```
5. **Delete `serviceAccountKey.json`** immediately after — it's a master key to your database.

---

## STEP 9 — Sign In

Visit https://skyelineos.web.app → sign in with `info@skyelinehomes.com`.

You'll land on the **Admin/GC Portal** (full access to all modules).

---

## Adding Other Users

To add a client, designer, or sub:
1. Create their Firebase Auth account in the console (or send them the app link + invite them to sign up)
2. Go to Firebase Console → Firestore → `users` collection → their document
3. Set `role` to one of: `admin`, `gc`, `client`, `designer`, `sub`

Or use the **Admin Portal** inside the app → User Management → Create User.

---

## Module Status After Deploy

| Module | Status | What works |
|--------|--------|------------|
| GC Dashboard | ✅ | Real-time stats, active jobs, cashflow |
| Projects | ✅ | Create/edit/view all jobs |
| Schedule / Gantt | ✅ | Full Gantt chart with phases and tasks |
| Contacts / CRM | ✅ | Clients, subs, employees |
| Finance / Accounting | ✅ | Budget tracking, cashflow, invoices |
| Messaging | ✅ | Real-time threads across all roles |
| Documents | ✅ | Upload and view project docs |
| Estimates | ✅ | Line-item estimates per project |
| Bids | ✅ | Invite subs, collect bids, compare |
| Client Portal | ✅ | Clients see their job progress |
| Subcontractor Portal | ✅ | Subs see assigned work + submit bids |
| Designer Portal | ✅ | Upload finish selections, client approves |
| Admin Portal | ✅ | User management, permissions |
| Safety Forms | 🔧 | UI built — wire to Firestore next session |
| Timesheets | 🔧 | UI built — wire to Firestore next session |
| Design Board | 🔧 | UI built — wire to Firestore next session |
| Social Media | 🔧 | Planned for Module 5 |

---

## Troubleshooting

**"Firebase token exchange failed"** → Make sure `.env` has the correct `VITE_FIREBASE_API_KEY` and that Authentication is enabled in the Firebase console.

**"Permission denied" on Firestore** → Your user doc in `users/{uid}` might not have the right role. Check Firestore → users collection in Firebase Console.

**Build fails on Vite** → Run `npm install` again. If it mentions Replit packages, those only load on Replit — the build will skip them automatically.

**Cloud Functions fail** → Check `firebase functions:log --project skyelineos` for error output.
