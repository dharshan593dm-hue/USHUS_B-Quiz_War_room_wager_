# War Room Wager

A live, multi-device points-wagering quiz round for college quiz competitions.
Host runs the dashboard on a projector/laptop; teams join on their own phones using a 6-digit code.

## How it works

1. **Lobby** — Host clicks *Join as Host*, enters the host PIN → gets a 6-digit code. Teams enter a name + the code to join. Host sees the live roster.
2. **Wager window (20s)** — Host clicks *Start Quiz*. The broad topic appears for everyone; the question stays hidden. Teams have 20 seconds to wager 1–10 points (two rows: 1–5, 6–10). Each number can only be used once per team for the whole game — used numbers show struck-through. If time runs out, the server auto-locks each team's lowest unused number.
3. **Answer window (90s)** — Host clicks *Broadcast Question*. The full question text appears to teams, and a 90-second timer starts. Teams type and submit a written answer. If time runs out, unanswered teams get `[No Answer Submitted]` automatically. Teams never see other teams' answers or the correct answer — and there's no "leave team" option once joined, keeping things simple for participants.
4. **Live host view (no per-question judging)** — While a question is live, the host dashboard just shows each team's wager and their typed answer as it comes in — purely for reference. The host does **not** need to mark anything correct/wrong question-by-question; they simply click *Next Question* to move on once ready.
5. **End-of-round review** — After all 10 questions, the game moves to a **Review** screen: the host sees every team, every question, their wager, their typed answer, and the benchmark answer side-by-side, and marks each one Correct/Wrong at their own pace. Scores are computed live as marks are given.
6. **Final standings** — Host clicks *Show Final Standings* to reveal the leaderboard to all teams.
7. **Pause/Resume/End** — Host can pause at any point (freezes timers and shows an overlay to teams), resume, or end the quiz early.

10 'hidden story' business questions are preloaded in `server.js` (edit the `QUESTIONS` array to change them).

## Full-screen lock (host button next to Pause)

- Host clicks **Lock Full Screen** (next to Pause / Start Quiz). Every team gets a blocking screen with an **Enter Full Screen** button (browsers require one tap per device).
- If a team switches tab/window or leaves full screen, the host gets an on-screen alert + beep naming the team, and the event is logged in the *Screen-Lock Monitor* panel and as a ⚠ badge on that team.
- Teams cannot dismiss the lock themselves. Host clicks **Release Full Screen** to let everyone out (also released automatically when the quiz ends).
- Limits: browsers cannot be forced into full screen without a tap, and cannot fully disable Esc (Chrome/Edge desktop need Esc held ~2s). iPhone Safari has no full-screen API, so those devices run in monitor-only focus mode.

## Host PIN, reconnect and safety

- **Host PIN:** set the `HOST_PIN` environment variable on Render. If it is not set, the built-in default PIN is used.
- **Reconnect:** the host browser keeps a private token. After a refresh or a dropped connection the host console comes back with the same game, teams, timer and code. Logging in again with the PIN also resumes the game in progress (it never wipes it).
- **New game:** use *Start a new game* at the bottom of the host console (asks for confirmation; the old game is saved to a backup file first).
- **Host-only actions:** every host control is rejected unless the browser has logged in with the PIN. Five wrong PINs lock that device out for a minute.
- **Wagers:** if a team has not wagered when the 20s ends, or when the host broadcasts early, its lowest unused number is locked automatically (shown as "auto" on the host screen and in the report).
- **Next Question** ignores double-clicks and cannot be used before the question is broadcast.
- **Connection banner:** shown to teams and host while the connection is down.
- **Saved state:** the game is saved to `data/game.json` (change the folder with `DATA_DIR`). After a restart the game comes back paused; the host presses *Resume*. On Render's free plan the disk is wiped on redeploy/spin-down; attach a persistent disk and set `DATA_DIR` to its mount path to keep it.

## Excel report

After the review, the host console has **Download Excel Report** (also on the final standings screen). Sheets: Leaderboard (live formulas), All Answers (wager, who set it, wager time, answer, answer time, result, points; edit *Result* and the leaderboard recalculates), Wagers Grid, Time Grid, Screen-Lock Log, Answer Key. Times are seconds from broadcast to submit, paused time excluded.

## Run locally

```bash
npm install
npm start
```

Visit `http://localhost:3000`. Open a second tab/incognito window to test host + team simultaneously.

## Deploy — GitHub + Render

### 1. Push to GitHub

```bash
cd war-room-wager
git init
git add .
git commit -m "War Room Wager quiz app"
git branch -M main
git remote add origin https://github.com/<your-username>/war-room-wager.git
git push -u origin main
```

(Create the empty repo on GitHub first, e.g. at `github.com/new`, then run the commands above.)

### 2. Deploy on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub account and select the `war-room-wager` repo.
3. Configure:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine for a demo/event.
4. Click **Create Web Service**. Render will build and deploy automatically.
5. Once live, you'll get a URL like `https://war-room-wager.onrender.com` — that's your quiz link.

Every time you push to `main`, Render redeploys automatically.

### Notes

- This app keeps game state **in memory on the server** — one live game at a time, which is exactly what you need for a single-event competition. If the server restarts (e.g. Render's free tier spins down after inactivity), any in-progress game resets — start a fresh game right before the round begins.
- No database, no sign-in required for teams — they just need the link and the code.
- To change the number of questions, the timer lengths, or the question bank, edit the `QUESTIONS`, `WAGER_SECONDS`, and `ANSWER_SECONDS` constants at the top of `server.js`.
