# Mobile testing (iPhone + Pixel 10)

How to test the site locally on phones before a release.

## Start the server

From the repo root:

```bash
./start.sh          # dev server with hot reload
./start.sh --prod   # production build served statically (closer to the live site)
```

The script prints two addresses:

```
Local:   http://localhost:3000
Network: http://<your-mac-ip>:3000  (phones on the same Wi-Fi)
```

**If a phone can't load the Network address:**

- **VPN:** a VPN on the Mac can block phones from connecting. Turn it off, or allow local network traffic in its settings.
- **macOS firewall:** the first time, macOS may ask whether `node` can accept incoming connections. Click Allow.
- **Same network:** the phone must be on the same Wi-Fi as the Mac, not on mobile data.

## Stage 1: Emulators (fast, no cable)

| | Setup | URL |
|---|---|---|
| **iOS Simulator** | Xcode → Open Developer Tool → Simulator, pick a recent iPhone | `http://localhost:3000` works as is |
| **Android Emulator** | Android Studio → Device Manager → Pixel 10 profile (or the closest Pixel) | `http://10.0.2.2:3000`, or run `adb reverse tcp:3000 tcp:3000` and use `localhost:3000` |

Use these for layout and scrolling checks while you work. They don't copy real touch, real performance or real Safari toolbar behaviour well.

## Stage 2: Real devices with a debugger attached

### Pixel 10 (easiest)

1. On the phone, turn on Developer options (tap Build number 7 times), then turn on **USB debugging**.
2. Plug it in and run `adb reverse tcp:3000 tcp:3000`.
3. Open `http://localhost:3000` in Chrome on the phone. Using `localhost` avoids Wi-Fi, VPN and Firebase domain problems.
4. On the Mac, open `chrome://inspect` in Chrome to get console, network and element inspection for the phone.

### iPhone

1. On the phone: Settings → Apps → Safari → Advanced → turn on **Web Inspector**.
2. On the Mac: Safari → Settings → Advanced → turn on **Show features for web developers**.
3. Connect with a cable (once; after that it works over Wi-Fi), then open the Network address in Safari on the phone.
4. On the Mac: Safari → Develop → *[your iPhone]* → the page, for full dev tools.

iOS has no equivalent of `adb reverse`, so the iPhone has to use the Network address or a tunnel (Stage 3).

## Stage 3: HTTPS and cellular (optional, closest to production)

```bash
./start.sh --prod
cloudflared tunnel --url http://localhost:3000   # brew install cloudflared
```

This gives a temporary public `https://….trycloudflare.com` address you can open on either phone, including over mobile data. It's the best check before a release because it uses real HTTPS, the production build and a real network.

If you tunnel the **dev** server instead, start it with `WDS_SOCKET_PORT=0 ./start.sh` so hot reload goes through the tunnel's port.

## Firebase caveat

Ratings depend on Firebase anonymous sign-in. If ratings fail when you open the site by LAN address or tunnel address but work on `localhost`, check two things:

- **Firebase Console → Authentication → Settings → Authorized domains:** add the LAN address or tunnel host.
- **Google Cloud Console → Credentials → Browser API key:** if the key only accepts certain websites, add those addresses.

## What to test on each device

- [ ] **Sticky calendar:** stays at the top while scrolling, including when Safari's address bar shrinks and grows.
- [ ] **Jumping to a date:** tapping a day scrolls so the movie title sits just below the calendar, not hidden behind it. Check with the calendar both expanded and collapsed.
- [ ] **Collapsing the calendar:** it animates, and later date jumps still land in the right place.
- [ ] **Deep link:** opening `/#movie-15` directly selects day 15 and scrolls there.
- [ ] **Rating:** tapping a drop fills the drops immediately and the average updates. After a reload, the rating is still there.
- [ ] **Rating with no connection:** turn on airplane mode and tap a rating; it should revert. This exercises the rollback in the reducer.
- [ ] **Tap targets:** the blood drops are only about 22×30px, below the recommended 44px. Note whether they're fiddly with a thumb.
- [ ] **Sideways scrolling:** the page should never scroll sideways, in portrait or landscape. Check the sidebar kicker text and the "Directed by" line.
- [ ] **Notch and Dynamic Island:** nothing important is hidden in landscape.
- [ ] **Reduced motion:** with it turned on in accessibility settings, the eye in the title stops animating.
- [ ] **Private browsing:** Safari Private and Chrome Incognito still sign in and allow rating.
- [ ] **Fonts:** Bebas Neue and Inter load; on a slow network, check for a jarring swap.

## Device matrix

| Device | Browser | Priority |
|---|---|---|
| iPhone | Safari | High (most visitors; every iOS browser uses Safari's engine) |
| Pixel 10 | Chrome | High |
| iPhone | Chrome | Low (same engine as Safari, different toolbar) |
| Pixel 10 | Firefox | Optional |

## Later: automate it

Playwright could automate the calendar, deep-link, rating and sideways-scrolling checks in its iPhone and Pixel modes as a quick check on every push. It doesn't replace testing on the real phones.
