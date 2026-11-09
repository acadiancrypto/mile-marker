# Setting up Mile Marker

This takes about 20 minutes, once. After that you just use the app.

You'll do three things:

1. Put the app online for free with **GitHub Pages**, so your phone and PC can install it.
2. Create a free **Google Cloud** sign-in key, so the app is allowed to save files in your Google Drive.
3. **Install** the app on your phone and PC and connect Drive.

No credit card is needed for any of it.

---

## Part 1: Put the app on GitHub Pages

1. Go to <https://github.com/signup> and create a free account. Remember your username. Your app address will be `https://<username>.github.io/mile-marker/`.
2. Top right, click **+** → **New repository**.
   - **Repository name:** `mile-marker`
   - Choose **Public**. GitHub Pages is free for public repositories. Your expenses are **not** stored here. Only the app's code is, and your data stays on your devices and in your Drive.
   - Click **Create repository**.
3. Upload the app. The easiest way is to tell Claude: *"push Mile Marker to my GitHub repo"*. Claude will run the commands with you. To do it yourself instead, in a terminal in the `mile-marker` folder run:
   ```bash
   git remote add origin https://github.com/<username>/mile-marker.git
   ```
   ```bash
   git push -u origin main
   ```
4. In the repository on GitHub, go to **Settings** → **Pages** (left menu).
   - **Source:** Deploy from a branch
   - **Branch:** `main`, folder `/ (root)`, then click **Save**.
5. Wait a minute, then open `https://<username>.github.io/mile-marker/`. You should see Mile Marker. The badge says **Connect Drive**, and Settings says **Not set up**. That's expected until Part 2 is done.

---

## Part 2: Create the Google sign-in key

1. Go to <https://console.cloud.google.com/> and sign in with the Google account whose Drive you want to use.
2. **Create a project:** click the project picker at the top → **New project** → name it `Mile Marker` → **Create**. Make sure it's selected at the top afterwards.
3. **Turn on the Drive API:** open the menu ☰ → **APIs & Services** → **Library**. Search for **Google Drive API**, open it, and click **Enable**.
4. **Consent screen** (the page Google shows when you connect): **APIs & Services** → **OAuth consent screen**. Google may call this section **Google Auth Platform**.
   - **App name:** `Mile Marker`. **User support email:** your email.
   - **Audience / User type:** **External**.
   - **Contact email:** your email. Agree to the policy, then click **Create** or **Save**.
   - Under **Data access** (or **Scopes**), click **Add or remove scopes**. Search for `drive.file` and tick **…/auth/drive.file** ("See, edit, create and delete only the specific Google Drive files you use with this app"). Click **Update**, then **Save**.
   - Under **Audience**, click **Publish app** → **Confirm**, so the status says **In production**. Google doesn't need to review it, because `drive.file` only lets the app see files it creates itself. If you leave it in **Testing**, Google makes you reconnect every 7 days.
5. **Create the key:** **APIs & Services** → **Credentials** (or **Clients**) → **Create credentials** → **OAuth client ID**.
   - **Application type:** **Web application**. **Name:** `Mile Marker web`.
   - **Authorized JavaScript origins:** click **Add URI** twice and enter:
     - `https://<username>.github.io`
     - `http://localhost:8080`
   - Leave **Authorized redirect URIs** empty. Click **Create**.
   - Copy the **Client ID**. It looks like `1234567890-abc123.apps.googleusercontent.com`. This isn't a password and is safe to put in the app.
6. Open `js/config.js` in the `mile-marker` folder and paste it between the quotes:
   ```js
   export const GOOGLE_CLIENT_ID = "1234567890-abc123.apps.googleusercontent.com";
   ```
   Also change `APP_VERSION` (for example `"1.0.1"`). Do this every time the app changes, so installed copies update.
7. Upload the change. Tell Claude *"push the Mile Marker update"*, or run:
   ```bash
   git commit -am "Add Google client ID"
   ```
   ```bash
   git push
   ```

---

## Part 3: Install and connect

**Android phone (Chrome):**
1. Open `https://<username>.github.io/mile-marker/` in Chrome.
2. Tap **Install** in the app's header, or Chrome's **⋮** → **Add to Home screen** / **Install app**.
3. Open Mile Marker from your home screen. Tap **Connect Google Drive**, pick your account, and tick the box that lets it use Drive files. Tap **Continue**.

**Windows PC (Chrome or Edge):**
1. Open the same address.
2. Click **Install** in the app's header, or the install icon at the right end of the address bar.
3. Open Mile Marker from the Start menu and click **Connect Google Drive**.

A **Mile Marker** folder appears in your Google Drive with `Receipts`, `Records` and a yearly spreadsheet (`Mile Marker 2026.csv`).

---

## Everyday use

- **No signal?** Log expenses and take receipt photos as usual. The badge shows **Offline · 2 waiting**, and they sync when you're back online.
- **"Tap to sync"** means Google's one-hour sign-in ran out while the app was closed. Tap the badge, or just save your next expense, and it syncs. You usually won't see a Google screen.
- **"Reconnect Drive"** means Google wants you to sign in again. Tap it and pick your account.
- **Deleted an expense by mistake?** Its receipt is in Google Drive's **Trash** for 30 days.
- **Phone running low on space?** Open **Settings** → **Free up space on this device**. Receipts already in Drive are removed from the phone only.
- **For the IRS:** everything is in the **Mile Marker** folder in Drive. Receipts are named by date, vendor and amount, plus there's a spreadsheet for each year.
