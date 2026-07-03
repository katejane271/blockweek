# Blockweek

A drag-and-drop weekly time-blocking app. Grab a block and move it to reschedule
— no manual date/time editing. Runs entirely in the browser; data is saved to
your browser's local storage.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel (free)

1. Push this folder to a new GitHub repo.
2. Go to https://vercel.com, sign in with your GitHub account.
3. Click "Add New Project", select this repo, leave all settings as default
   (Vercel auto-detects Vite), and click Deploy.
4. You'll get a URL like `blockweek-yourname.vercel.app` — that's your app,
   live and free.

## Add to iPhone home screen

1. Open your Vercel URL in Safari on your iPhone.
2. Tap the Share icon, then "Add to Home Screen".
3. It now opens full-screen like a native app.

## Note on syncing across devices

This version stores data in each browser's local storage, so your iPhone, Mac,
and Linux machine will each keep their own separate set of blocks (opening the
same URL doesn't share data between devices). If you want true syncing later,
the next step would be adding a small backend (e.g. Vercel KV or Supabase) —
happy to help with that when you're ready.
