# To Do

A to-do list you can open on your desktop and your phone. Tasks live in a Google
Sheet. There is no database, no server to run, no build step, and nothing to
install.

Seven files, all of them plain text or images:

| File | What it is |
| --- | --- |
| `index.html` | The whole app — markup, styles, and script in one file |
| `manifest.json` | Lets your phone install it to the home screen |
| `sw.js` | Lets it open without a connection |
| `icon-192.png`, `icon-512.png` | The home screen icon |
| `Code.gs` | The backend. It lives in the repo, but it *runs* in Google — you paste it into the Apps Script editor |
| `README.md` | This file. GitHub shows it on your repository's front page |

---

## What it does

Add, edit, complete, and delete tasks, with everything saving as you go. Beyond
that:

**Links are clickable.** Type a URL anywhere in a task and just that part becomes
a link. The rest of the text stays text.

**Reordering.** Tap **Reorder**. Each row's pencil and cross turn into up and down
arrows. A tap moves a task one step; holding an arrow for half a second sends it
all the way to the top or bottom. Tap **Done** and the new order is saved.

The arrows only rearrange the list on screen. The finished order goes to the
server once, when you tap Done. Sending every tap would mean waiting for a round
trip — and a full redraw under your finger — on every single move.

**Archiving.** Completed tasks stay in the list, struck through, until you tap
**Archive done**. They then move to a separate archive screen you can search.
From there you can restore a task to the list or delete it for good.

**Undo instead of "are you sure".** Deleting and archiving happen immediately,
and a bar appears offering Undo for a few seconds. Nothing is actually sent to
the server during that window, so undo isn't a second edit that puts things back
— the change simply never happened, and a deleted task returns to exactly where
it was. If you close the tab during the window, the change is delivered anyway.

**Everything reachable.** The page itself never scrolls; only the task list does.
The input and the menu stay at the bottom of the screen no matter how long your
list gets.

---

## How the pieces fit together

```
  your phone / laptop
        │
        │  GitHub Pages serves the page (HTML, CSS, JS)
        ▼
  index.html ──── fetch ────► Apps Script web app ────► Google Sheet
                                   (Code.gs)              (your tasks)
```

GitHub Pages only ever hands you the page. It never sees your tasks. Every task
you add travels from the page to your Apps Script web app, which writes it into
your Sheet. Reading works the same way in reverse.

Three details are worth knowing, because they explain choices in the code:

**Requests are plain form fields, not JSON.** A browser will only send a request
to another website without asking permission first if the request looks ordinary.
Form-encoded data qualifies; a JSON body with custom headers does not, and would
trigger a permission check that Apps Script has no way to answer. Replies come
back as JSON, because that part is unrestricted.

**Apps Script answers with a redirect.** Your request does not get a direct reply.
Apps Script sends back "the answer is over there", pointing at a
`googleusercontent.com` address. `fetch` follows that automatically. This is why
the code never sets `mode: 'no-cors'` — that setting stops `fetch` following the
redirect and you get an empty response you cannot read.

**The server returns the whole list after every change.** That keeps the page's
code short and means any device that touches the server gets the current truth
back. Archived tasks are the exception: they are fetched only when you open the
archive screen, so a year of finished tasks doesn't ride along with every
checkbox you tick.

---

## Part 1 — The Sheet and the backend

**1. Make a spreadsheet.** Go to [sheets.new](https://sheets.new). Name it
something like `To Do Data`. Leave it empty — the script builds its own tab and
column headers the first time it runs.

**2. Open the script editor.** In that spreadsheet: **Extensions → Apps Script**.

This matters. Creating the script from inside the Sheet attaches the two
together, which is why `Code.gs` contains no spreadsheet ID or URL, and why
nothing in your public repo points at your data.

**3. Paste the code.** Select everything in the editor (there will be an empty
`myFunction` there) and delete it. Paste the entire contents of `Code.gs`. Click
the save icon.

**4. Deploy it.** Click **Deploy → New deployment**. Click the gear icon next to
"Select type" and choose **Web app**. Then set:

| Field | Value |
| --- | --- |
| Description | anything, e.g. `v1` |
| Execute as | **Me (your@email)** |
| Who has access | **Anyone** |

Both of those must be exactly right. *Execute as: Me* is what gives the script
permission to touch your Sheet. *Who has access: Anyone* is required because your
web page arrives as an anonymous visitor — if you pick "Anyone with a Google
account" the page gets a login screen instead of your tasks and nothing works.

Click **Deploy**.

**5. Approve the permissions.** The first deployment triggers an authorization
flow:

- **Authorize access** → pick your Google account.
- You will see a full page warning that **Google hasn't verified this app**. This
  is expected. It appears for every personal Apps Script project; verification is
  a review process meant for apps distributed to the public. The continue link is
  hidden: click **Advanced**, then **Go to [your project name] (unsafe)** at the
  bottom.
- Review and click **Allow**.

The permission it asks for is access to your spreadsheets — it needs that to read
and write your task rows. It does not ask for your email, Drive, or anything
else. (Google's exact wording on this screen changes from time to time; if it
asks for noticeably more than spreadsheet access, stop and check you pasted the
right code.)

**6. Copy the URL.** You get a **Web app URL** ending in `/exec`. Copy it
somewhere you can get at it from both your computer and your phone.

**7. Check it works.** Paste that URL straight into a browser tab. You should see:

```json
{"ok":true,"tasks":[]}
```

If you see that, your backend is finished and correct. Go and look at your
spreadsheet — a `Tasks` tab has appeared with the column headers already in it.

---

## Part 2 — The web page

**1. Put the files in a repo.** Create a new GitHub repository. Unzip the
project folder and add **all seven files** to the root — everything in the zip,
no exceptions.

`Code.gs` is in the repo so you have a copy of the backend alongside everything
else, but GitHub never runs it. The copy that actually runs is the one you pasted
into the Apps Script editor in Part 1. Nothing is exposed by keeping it here: it
contains no spreadsheet ID, no URL, and no credentials.

**2. Turn on Pages.** In the repository: **Settings → Pages**. Under "Build and
deployment", set Source to **Deploy from a branch**, branch to **main**, folder
to **/ (root)**, then **Save**.

Wait a minute or two, then reload that settings page. It will show your address:
`https://yourname.github.io/your-repo/`.

**3. Connect it.** Open that address. The page asks for your Apps Script URL.
Paste the `/exec` URL from Part 1 and click **Connect**.

Your browser remembers it from then on. You do this once per device, so you will
paste it again on your phone.

---

## Part 3 — Installing it

**On Android (Chrome):** open the page, then menu **⋮ → Add to Home screen** (or
"Install app").

**On iPhone (Safari):** open the page, tap the Share button, then **Add to Home
Screen**. Safari only offers this in Safari — not Chrome or Firefox on iOS.

**On desktop (Chrome or Edge):** an install icon appears at the right-hand end of
the address bar.

Installed, it opens in its own window with no browser chrome, and opens offline —
though offline you will see the page with an error, since your tasks live in the
Sheet and reaching them needs a connection.

---

## Where your tasks are stored

The `Tasks` tab, one row per task:

| Column | Contents |
| --- | --- |
| `id` | A unique string like `tm4k2j9xa8f3p`, generated by the page |
| `task` | The text |
| `completed` | `TRUE` or `FALSE` |
| `archived` | `TRUE` once you archive it; archived tasks are hidden from the main list |
| `created` | When you added it |
| `updated` | When you last changed it |

Row order in the sheet is the order on screen. New tasks are inserted at row 2,
which is why they appear at the top, and reordering rewrites those rows in place.

The `id` exists so that editing and deleting never depend on row numbers. If they
did, sorting the sheet or deleting a row from two devices at once would change
which task a request landed on.

You can safely edit the `task`, `completed`, and `archived` columns by hand in the
spreadsheet. Do not change the `id` column.

---

## About security

Your `/exec` URL is a working address that anyone holding it can use to read and
change your task list. On GitHub Pages your page's source is public, so if you
hard-coded the URL into `index.html`, it would be public too.

That is why the page asks you to type the URL instead. It is stored in your
browser, not in the repository, so your repo contains no working address at all.

Is that real security? Partly. The URL is roughly 70 unguessable characters and
there is no way to search for one, so nobody finds it by accident. But it is a
bearer secret: anyone you show it to, or who sees your screen while you paste it,
can use it. Two honest limits to keep in mind:

- The most anyone with the URL could do is read, add, edit, reorder, archive, and
  delete tasks. They cannot open your spreadsheet, see your Drive, or reach
  anything else in your account. `Code.gs` defines the entire set of things that
  URL can do.
- Google Sheets keeps full version history. **File → Version history → See version
  history** restores any earlier state in two clicks, so nothing here is
  destructible.

Adding a secret token to requests would not help, because the token would have to
live in the same place as the URL. Real protection means Google Sign-In and an
OAuth token on every request — a genuine improvement, and roughly twice the code.
For a personal to-do list it is not a trade worth making.

---

## Troubleshooting

**"Could not reach the server."**
Usually the URL. It must end in `/exec`, not `/dev`. The `/dev` URL only works
while you are logged into the account that owns the script, so it appears to work
on your laptop and fails on your phone. Tap **Change URL** at the bottom of the
page to re-enter it.

**"That URL did not return task data."**
The address answered with something other than JSON, almost always a Google login
page. Check the deployment's **Who has access** is set to **Anyone**, not "Anyone
with a Google account". Fix it under **Deploy → Manage deployments**.

**Pasting the URL into a browser shows a login page or an error.**
Same cause. Fix the access setting before touching the web page at all.

**I changed `Code.gs` and nothing happened.**
Saving is not deploying. Go to **Deploy → Manage deployments**, click the pencil
icon, set **Version** to **New version**, and click **Deploy**. Your URL stays the
same. This catches almost everyone at least once.

**I deployed again and got a different URL.**
You used **New deployment** instead of editing the existing one. Either paste the
new URL into the page, or delete the extra deployment and edit the original from
now on.

**The page is blank or GitHub Pages shows 404.**
Pages takes a minute or two on first publish. Check `index.html` is in the
repository root, not inside a folder, and that the filename is exactly
`index.html` in lower case.

**I edited the page but my browser shows the old version.**
Hard-refresh: **Ctrl+Shift+R**, or **Cmd+Shift+R** on a Mac. The service worker
here prefers the network so this should be rare, but GitHub's own caching can
still lag by a minute.

**My phone shows different tasks from my laptop.**
The list refreshes when you open or return to the app, not continuously. Switch
away and back, or tap **Refresh**. It deliberately skips that refresh while you
are mid-edit, mid-reorder, or holding an undo, so it cannot throw away work in
progress.

**I reordered tasks and the order didn't stick.**
The order is saved when you tap **Done**, not on each arrow tap. If you closed the
app while still in reorder mode, the moves were never sent.

**A long-press on an arrow pops up my phone's text menu instead.**
It shouldn't — the arrows suppress it. If it happens, tap the arrow repeatedly
instead; the result is the same.

**An archived task came back.**
Check you didn't tap Undo. If not, look at the `archived` column in the sheet:
`TRUE` means archived, anything else means live.

**Nothing works and the browser console says "CORS".**
Almost always the access setting again. Apps Script cannot answer a browser's
permission check, so the code avoids triggering one — if you have modified the
`api` function to send JSON or add headers, change it back.

---

## Changing it

Everything is in `index.html`. Some starting points:

- **The look.** The colour values are at the top of the `<style>` block in
  `:root`. Change `--ink` and `--paper` and the whole page follows.
- **The title.** It appears in `<title>`, the setup screen's `<h1>`, the
  `renderList` function, and `manifest.json`.
- **How long undo lasts.** `UNDO_MS` near the top of the script.
- **How long a long-press takes.** `HOLD_MS`. Half a second is the usual
  convention; much longer and people let go early and assume it's broken.
- **Where new tasks land.** `tasks.unshift(...)` in `add()` puts them on top, and
  `insertRowBefore(2)` in `Code.gs` does the same in the sheet. Change both to
  `push` and `appendRow` for the bottom.
- **Sorting.** Tasks appear in sheet order, which is the order you arranged. To
  push completed ones to the bottom, sort inside `renderList()` before the loop —
  but note this fights with manual reordering.

Changes to `index.html` go live a minute after you push. Changes to `Code.gs`
need a new deployment version — see the troubleshooting note above.

Remember `Code.gs` exists in two places: the copy in your repo and the copy in the
Apps Script editor. Only the Apps Script one runs. If you edit the backend, paste
the new version into both so they do not drift apart.
