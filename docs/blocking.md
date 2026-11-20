# Blocking

## Rules
- A rule is a website (domain, optionally with a path: `youtube.com/shorts`), either **always
  blocked** or with a **daily time limit**. Subdomains match (`youtube.com` covers `m.youtube.com`);
  paths match by segment (`/shorts` matches `/shorts/abc`, not `/shortsfoo`). `www.`, scheme, port,
  query and fragment are ignored; internationalized domains are normalized (Punycode).
- **Groups** share one limit and one switch: the time of all members is added up.
- A target can be a single rule and a group member at the same time; whichever limit runs out first
  blocks.
- Only `http` / `https` pages are checked. Browser pages (`about:`, `chrome://`), extension pages
  and local files are never blocked.
- Blocking is active once setup is complete, stays active in unlocked mode, and is suspended during
  a pause.

## Engine (`core/blocking/blockingController.ts`)
Android runs a one-second loop. A browser extension's background script is suspended when idle, so
the engine is **event-driven**. Every `sync()`:
1. Advances the usage period (`ResetSchedule.advance`, monotonic – see below).
2. Counts the time since the previous sync for what was being counted then (the persisted
   "segment"; at most 2 minutes per step, so time while the computer slept isn't counted).
3. Blocks every open tab whose page is blocked now.
4. Determines the **counted pages** (see below) and starts a new segment for the limits they use.
5. Shows / hides countdowns and warnings and returns when the next check is due.

`sync()` runs on: tab switched, page loaded or URL changed, tab audible / muted changed, tab closed, window
focus changed, idle state changed, rules / settings changed, a page's visibility changed, a 30 s
alarm, a timer + alarm at the moment a limit runs out, the countdown reaching zero in the page, and
when the popup opens.

`webNavigation.onBeforeNavigate` additionally checks a top-level navigation **before** the page
loads (`checkNavigation`), so a blocked site is replaced without flashing.

## Counted pages (Android: foreground app + split screen + picture-in-picture)
`core/blocking/countedPages.ts` decides which pages count right now:
- **In front:** the active tab of the **focused** browser window, plus other tabs of that window whose
  page reports `document.visibilityState === 'visible'` – tabs shown side by side in a **split
  view** (e.g. Zen). Only while the user is active (input within the last 5 minutes, `idle` API).
- **Media:** any tab **playing sound** (the browser's speaker indicator, not muted) or showing a
  video in **picture-in-picture** – also in background tabs, other windows and while another
  program is in front, and also while the user is idle. Muted autoplay previews in background tabs
  don't count. Picture-in-picture is only known where the browser tells the page (Chrome); Firefox's
  own picture-in-picture counts through its sound.
- **Nothing** counts while the screen is locked.

Everything counted is added in one step, so a group shown twice counts once (like Android); a
blocked page beside an allowed one is blocked.

Visibility and picture-in-picture come from the page script (`page.content.ts`), which needs access
to websites. Without it only the active tab and tabs playing sound count.

## Usage period
- The daily reset time is configurable (default midnight). Changing it needs the guardian code and
  takes effect after the next reset.
- Periods only advance monotonically: setting the clock back never grants a fresh quota; setting it
  forward or changing the time zone doesn't either (a period can't end before most of its length
  really passed).
- The monotonic start of a period is backdated to the period's start when tracking begins mid-period
  (first install, browser closed at the reset time). The Android app uses "now", which delays the
  next reset by however late tracking began – a bug there.

## Block page (`entrypoints/blocked/`)
The tab is redirected to `blocked.html?url=…&reason=…&subject=…&resetAt=…`, showing the site, the
reason (always blocked / limit used up and when it's available again), the group if any, and
**Close tab** / **Go to Lares** (opens the popup, or the UI in a tab where that isn't allowed).

Chrome can't show extension pages in incognito tabs ("spanning" mode); there a blocked tab is closed
instead.

## Countdown and warnings
- **Countdown** (switchable, default on): a pill in the top-right corner of each visible page during
  the last 5 minutes of a limit. It counts down on its own and asks for a check when it reaches
  zero, so the page is blocked on time even while the background script sleeps. Clicks pass through
  it, and it slides out of the way (left or down, whichever is the smaller move) when the cursor
  comes within 24 px, so the page underneath stays visible. Needs access to websites.
- **Warnings** (opt-in): browser notifications 5 and / or 1 minute before a limit runs out – one per
  limit, removed when the page is no longer visible.

## Templates
YouTube, Instagram, TikTok, Snapchat, Facebook, X, Reddit, LinkedIn, Threads, Pinterest, Twitch,
Tumblr, Bluesky – the website parts of the Android templates, optionally added as a group. Shown
with letter icons in the brand color (no logos, no favicon fetching).

## Known limits
- Other browsers, other browser profiles and (unless allowed) private windows aren't covered.
- Disabling or removing the extension stops blocking – see [Unlock & security](unlock-and-security.md).
- Muted video in Firefox's own picture-in-picture doesn't count (Firefox doesn't tell the page).
- A page that is visible but in an unfocused window doesn't count.
