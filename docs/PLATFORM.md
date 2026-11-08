# Platform: web app now, Android later

**Recommendation: build and test as a mobile-first web app (PWA) on Windows now. Decide on a native
Android app when the gym tracker starts, not before.**

## Why not start native

- Everything built so far (diary, supplements, targets, Day Summary) is forms, lists and charts.
  A mobile-first web app does all of that well, and one codebase runs on Windows, Android and
  iPhone.
- The expensive part of this product is the nutrition logic and data, not the screen toolkit. That
  logic lives in `src/lib` (pure TypeScript) and `src/db`, not in components, so it carries over to
  any future client.
- Native-only work (Android Studio, emulators, Play Store setup, a second UI) would slow down
  learning whether the product is right.

## How to test now, on Windows

1. Install Node 22+ and Docker Desktop (or a native Postgres 16). Follow the README quick start.
2. **Phone layout on the PC:** open `http://localhost:3000` in Chrome, press `F12`, then the device
   toolbar (`Ctrl+Shift+M`), and pick a phone. The app is designed for 360 to 414 px wide.
3. **A real phone on the same Wi-Fi:** use the production build, which was verified to load and run
   by LAN address:

   ```bash
   npm run build
   SINGLE_USER_MODE=true npm start -- -H 0.0.0.0     # PowerShell: $env:SINGLE_USER_MODE="true"; npm start -- -H 0.0.0.0
   ```

   Then open `http://<your-PC-address>:3000` on the phone (`ipconfig` shows the address) and allow
   Node through Windows Firewall when asked. `npm run dev` by LAN address is configured per Next's
   docs but was not verified (see `next.config.ts`).

## What a web app cannot do yet

| | Today |
| --- | --- |
| Install to the home screen as an app | Chrome on Android needs **HTTPS** to offer "Install app". Over plain `http://192.168...` it works as a normal web page. Hosting it (see Hosting in DECISIONS) fixes this, but **add login first**: today the app has none and refuses to run in production without `SINGLE_USER_MODE=true`. |
| Work offline | No. The diary is rendered on the server. A service worker and local storage would be needed. |
| Barcode scanning | Possible on Android Chrome but less capable than native. Planned in Phase 4. |
| Health Connect, wearables, background timers | Not available to a web app. |

## When to go native

The gym tracker is where a web app starts to hurt: logging sets in a basement gym with no signal,
a rest timer that keeps running with the screen off, and syncing steps or heart rate from a watch
(Android Health Connect). Those argue for an offline-first native client.

Options, cheapest first:

1. **Publish the PWA to Google Play** as a Trusted Web Activity (Google's supported way to wrap a
   PWA; tools like Bubblewrap or PWABuilder generate it). Reuses everything, still online-only, still
   needs hosting and login.
2. **React Native with Expo** for the UI, reusing `src/lib` and talking to a JSON API. This is the
   serious native route. It needs that API, which does not exist yet: today screens call the
   database directly through server actions.
3. **Kotlin / Jetpack Compose.** Best Android fit, but nothing is shared with the web app and it
   targets Android only.

**Keeping the option open costs little:** keep logic out of components (already true), and when a
native client is wanted, add JSON route handlers over `src/db/queries.ts` and `src/db/mutations.ts`
rather than rewriting them.
