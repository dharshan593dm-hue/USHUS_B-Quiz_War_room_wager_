const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

let ExcelJS = null;
try { ExcelJS = require("exceljs"); } catch (e) { console.error("exceljs not installed - Excel report disabled"); }

// Never let a stray error take the event down.
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e && e.stack ? e.stack : e));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e && e.stack ? e.stack : e));

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 25000,
  maxHttpBufferSize: 1e5
});

const PORT = process.env.PORT || 3000;
const HOST_PIN = process.env.HOST_PIN || "USHUS2026";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const SAVE_FILE = path.join(DATA_DIR, "game.json");

app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Question bank (10 'hidden story' business questions)
// ---------------------------------------------------------------------------
const QUESTIONS = [
  {
    topic: "Logo replacement",
    question:
      "In a limited campaign timed to a global conservation moment, this company did something no major fashion label had done before: it manufactured only as many units of ten special product runs as there were individuals left in the wild of ten different endangered species — not a round marketing number, but the actual, scientifically estimated population count for each animal. One run, tied to a critically endangered bird found only on a single group of islands, totalled exactly 157 units; once that run sold out, it could never be remade by design, since the whole point was for scarcity to mirror extinction risk. The irony is that the animal which normally appears stitched onto the company's product is not endangered at all; it's one of the most widespread and populous animals on the planet, found across multiple continents in healthy numbers, which is precisely why swapping it out for genuinely at-risk species made the campaign so striking. Name the company.",
    answer: "Lacoste"
  },
  {
    topic: "Packaging redesign",
    question:
      "In the 1960s, the grandson of this beer company's founder, a senior executive there, was struck by a visit to a Caribbean island where empty bottles of his beer littered the beaches while building materials were scarce. Working with a Dutch architect, he created a glass bottle with a completely unconventional purpose: once emptied, the bottle itself could be laid on its side and stacked like a brick, interlocking with others of its kind, so that roughly 1,000 empty bottles could build the walls of a small hut. The bottles even had dimpled sides so that mortar could grip them like ordinary bricks. A test run of about 100,000 was made in 1963, but the idea never reached mass production; only a shed and a hut were ever built, on the family's estate in the Netherlands. Surviving bottles are now considered rare collector's items, but the concept is still cited today as an early, literal example of designing packaging for a second life as affordable housing. Name the company.",
    answer: "Heineken (the bottle was known as the WOBO, or “World Bottle”)"
  },
  {
    topic: "Success After Failure",
    question:
      "In the early 1900s, a famous car pioneer's second company collapsed. His first car company had already closed down. The investors behind the second one wanted finished cars delivered on a schedule, but he kept tinkering and racing instead, and they fell out with him. He walked away. The investors were left with a factory and a name they could no longer use, so they called in a precision-engineering expert to value the assets before selling them off. The expert recommended continuing instead. He said he could build a better car around an engine his own firm had designed, and the investors agreed. The company was renamed after the French explorer who had founded the city where it was based two hundred years earlier, and its first cars were completed within months. The pioneer went on to start a third company that became far more famous. Name the company that rose from the ashes of his second failure.",
    answer: "Cadillac (accept Cadillac only, not Ford)"
  },
  {
    topic: "Old Names, New Businesses",
    question:
      "This company's modern emblem has nothing whatsoever to do with the product category it has dominated for well over a century. The name and symbol instead trace back to a modest import shop in London's East End, run in the 1830s by the founder's father, who specialised in selling ornamental objects collected from beaches on the far side of the world — objects prized by Victorian collectors for their polish and rarity — sold alongside other curios imported from trade routes the family had connections to. Decades after his father's death, the son expanded the family trading business into oil, commissioning purpose-built tankers to carry kerosene through the Suez Canal, and chose to keep the family's old shop emblem rather than design something new, a decision made largely out of sentiment rather than strategy. Name the company.",
    answer: "Shell"
  },
  {
    topic: "Boycott and Pivot",
    question:
      "In 1943, this European entrepreneur started a mail-order business as a teenager, initially selling pens, wallets, and nylon stockings sourced cheaply and resold at a markup to customers across the countryside, using the postal service as his main distribution channel since he had no physical shop. When he began adding furniture to his catalogue years later, rival furniture retailers were so threatened that they pressured manufacturers to boycott supplying him directly, forcing him to design and source his own furniture from scratch. That workaround soon led to a lasting idea: when an employee removed the legs from a table so that it would fit into a car, it showed that furniture could be shipped flat and assembled by the customer, the format the company is famous for today. Name the company.",
    answer: "IKEA — an acronym of the founder's initials (Ingvar Kamprad), his family farm (Elmtaryd), and his home village (Agunnaryd)"
  },
  {
    topic: "Corporate social initiative",
    question:
      "This global consumer goods company, best known for everyday household and personal-care products, used its own cleaning-chemistry research to develop a small powder sachet, weighing only a few grams, that turns a bucket of about 10 litres of dirty, contaminated water into drinkable water in roughly half an hour, with no electricity needed. Developed in collaboration with a US public health agency and relaunched in 2004 as a not-for-profit programme, the sachets are sold at cost, with no profit taken, to aid organisations and humanitarian partners, and are used in emergency relief and in communities facing acute water contamination, rather than being sold as a mainstream retail product. Name the company.",
    answer: "Procter & Gamble (P&G) — the product is the PUR / P&G Purifier of Water sachet, part of its Children's Safe Drinking Water Program"
  },
  {
    topic: "Inventions in Hard Times",
    question:
      "During a period of severe rationing in the mid-1940s, shortly after the Second World War, when a key imported ingredient essential to a popular confection had become both scarce and prohibitively expensive across an entire country, a small-town pastry maker began experimenting with ways to stretch his dwindling supply of that ingredient by blending it with a cheap, locally abundant nut that grew in the hills near his shop. The resulting dense paste, originally sold in a loaf that could be sliced like bread, wasn't conceived as a luxury treat at all — it was a practical, cost-saving workaround for customers who could no longer afford the real thing in its pure, unblended form. After the pastry maker's death, his son took over the business and reformulated it into a smoother, more spreadable version, and it was later renamed, becoming the breakfast product recognised in households worldwide today. Name the brand.",
    answer: "Nutella (by Ferrero)"
  },
  {
    topic: "Luxury Brand Stories",
    question:
      "According to company lore passed down for decades, its most famous and most heavily waitlisted product — one that can carry a years-long waiting list and resell for several times its original price — wasn't conceived in a design studio or sketched by a professional illustrator at all, but drawn in rough form on the back of an airline sickness bag during a short flight between two European capitals, after a well-known actress and singer seated beside a senior company executive accidentally spilled the contents of her own overstuffed straw tote bag in front of him. Charmed by the mishap, he offered on the spot to design her something more practical, and the resulting bag, launched commercially soon afterwards, now carries her surname — even though she herself later remarked in interviews that she eventually stopped carrying it regularly because it had become too heavy and impractical for daily use. Name the company.",
    answer: "Hermès (the bag is the Birkin, named after Jane Birkin)"
  },
  {
    topic: "How a Brand Got Its Name",
    question:
      "This company's name was chosen not for any connection to its product, but for how the word sounded when spoken aloud; it was lifted from a minor supporting character in a sprawling 19th-century seafaring novel about an obsessive sea captain, after an earlier idea drawn from the same novel — the name of the ship itself — was dropped because of how it sounded. For more than a decade after it opened in the Pacific Northwest, the company didn't sell a single prepared drink to a walk-in customer — it sold only whole roasted beans, loose-leaf tea, spices and brewing equipment for people to prepare at home, resembling a specialty grocer more than a café, until an employee who had travelled through Italy and become fascinated by the espresso-bar culture there pushed the original founders to change the entire business model into one centred on serving prepared drinks. Name the company.",
    answer: "Starbucks (named after Starbuck, the first mate in Herman Melville's Moby-Dick)"
  },
  {
    topic: "Ownership restructuring",
    question:
      "In a restructuring completed in 2022, the founder of this outdoor apparel company, a lifelong rock climber who had built his company's reputation partly on radical environmental honesty, including a famous ad that directly urged his own customers to buy less from him, gave away the entirety of his multi-billion-dollar business, but not through a conventional sale, a charitable foundation donation, or an inheritance to his children. Instead, voting control and all future profit not reinvested into daily operations were restructured through a specially created legal trust and nonprofit arrangement designed so that money would flow, automatically and in perpetuity, toward fighting climate change and protecting undeveloped land, meaning that in a very literal, legally binding sense, the planet itself effectively became the company's only shareholder going forward. Name the company.",
    answer: "Patagonia"
  }
];

const WAGER_SECONDS = Number(process.env.WAGER_SECONDS) || 20;   // env override is for testing only
const ANSWER_SECONDS = Number(process.env.ANSWER_SECONDS) || 90;
const MAX_TEAM_NAME = 40;
const MAX_ANSWER_LEN = 1000;
const NO_ANSWER = "[No Answer Submitted]";

// ---------------------------------------------------------------------------
// Game state (single game/event at a time)
// ---------------------------------------------------------------------------
function freshGame() {
  return {
    code: null,
    hostToken: null,
    status: "idle",       // idle | lobby | active | paused | review | ended
    phase: "wagering",    // wagering | awaiting_broadcast | question | results
    currentIndex: -1,
    timer: { running: false, remaining: 0, total: 0, kind: null, handle: null },
    lockdown: false,
    violations: [],       // { teamId, teamName, type, at }
    teams: {}             // teamId -> { id, name, socketId, wagers, answers, results, wagerMeta, answerMeta, violationCount }
  };
}

let game = freshGame();

function newToken() { return crypto.randomBytes(18).toString("hex"); }
function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function usedPoints(team) { return Object.values(team.wagers || {}); }

function computeScore(team) {
  let score = 0;
  Object.keys(team.results || {}).forEach((idx) => {
    if (team.results[idx] === "correct" && typeof team.wagers[idx] === "number") score += team.wagers[idx];
  });
  return score;
}

function publicTeamList() {
  return Object.values(game.teams)
    .map((t) => ({
      id: t.id,
      name: t.name,
      score: computeScore(t),
      wagers: t.wagers,
      answers: t.answers,
      results: t.results,
      wagerMeta: t.wagerMeta || {},
      answerMeta: t.answerMeta || {},
      violationCount: t.violationCount || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function currentQuestion() { return QUESTIONS[game.currentIndex] || null; }

function timerPublic() {
  return { running: game.timer.running, remaining: game.timer.remaining, total: game.timer.total, kind: game.timer.kind };
}

function elapsedSeconds() { return Math.max(0, game.timer.total - game.timer.remaining); }

// ---------------------------------------------------------------------------
// Saved state (survives a server restart when the disk is kept)
// ---------------------------------------------------------------------------
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveGame(); }, 1000);
}
function saveGame() {
  try {
    if (game.status === "idle") return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = SAVE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(game, (k, v) => (k === "handle" ? undefined : v)));
    fs.renameSync(tmp, SAVE_FILE);
  } catch (e) { console.error("[save failed]", e.message); }
}
function archiveGame() {
  try {
    if (!game.code || Object.keys(game.teams).length === 0) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const f = path.join(DATA_DIR, "archive-" + game.code + "-" + Date.now() + ".json");
    fs.writeFileSync(f, JSON.stringify(game, (k, v) => (k === "handle" ? undefined : v)));
  } catch (e) { console.error("[archive failed]", e.message); }
}
function loadGame() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return;
    const g = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    if (!g || typeof g !== "object" || !g.code || !g.teams || typeof g.teams !== "object") return;
    const base = freshGame();
    game = Object.assign(base, g);
    game.timer = Object.assign(base.timer, g.timer || {}, { handle: null, running: false });
    game.violations = Array.isArray(g.violations) ? g.violations : [];
    Object.values(game.teams).forEach((t) => {
      t.socketId = null;
      t.wagers = t.wagers || {}; t.answers = t.answers || {}; t.results = t.results || {};
      t.wagerMeta = t.wagerMeta || {}; t.answerMeta = t.answerMeta || {};
    });
    if (game.status === "active") game.status = "paused"; // host presses Resume
    console.log("Restored saved game " + game.code + " (" + game.status + ")");
  } catch (e) { console.error("[restore failed]", e.message); }
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------
function broadcastHost() {
  const review = game.status === "review" || game.status === "ended";
  io.to("host").emit("host:state", {
    code: game.code,
    status: game.status,
    phase: game.phase,
    currentIndex: game.currentIndex,
    totalQuestions: QUESTIONS.length,
    question: currentQuestion(),
    allQuestions: review ? QUESTIONS : undefined,
    lockdown: game.lockdown,
    violations: game.violations.slice(-50),
    timer: timerPublic(),
    teams: publicTeamList()
  });
}

function broadcastTeams() {
  const q = currentQuestion();
  const showQuestionText = q && game.phase === "question";
  Object.values(game.teams).forEach((t) => {
    if (!t.socketId) return;
    io.to(t.socketId).emit("team:state", {
      status: game.status,
      lockdown: game.lockdown,
      phase: game.phase,
      currentIndex: game.currentIndex,
      totalQuestions: QUESTIONS.length,
      topic: q ? q.topic : null,
      question: showQuestionText ? q.question : null,
      timer: timerPublic(),
      me: { id: t.id, name: t.name, score: computeScore(t), wagers: t.wagers, answers: t.answers, results: t.results }
    });
  });
}

// Updates are batched (100 ms) so a burst - e.g. 30 teams answering in the same second - becomes one or two pushes.
let bcastTimer = null;
function doBroadcast() {
  try { broadcastHost(); } catch (e) { console.error("[broadcastHost]", e.message); }
  try { broadcastTeams(); } catch (e) { console.error("[broadcastTeams]", e.message); }
  scheduleSave();
}
function broadcastAll() {
  if (bcastTimer) return;
  bcastTimer = setTimeout(() => { bcastTimer = null; doBroadcast(); }, 100);
}

const VIOLATION_TYPES = ["tab_switch", "exited_fullscreen", "reconnected"];
function recordViolation(team, type) {
  const rec = { teamId: team.id, teamName: team.name, type, at: Date.now() };
  game.violations.push(rec);
  team.violationCount = (team.violationCount || 0) + 1;
  io.to("host").emit("host:alert", rec);
}

// ---------------------------------------------------------------------------
// Wagers / answers helpers
// ---------------------------------------------------------------------------
function autoLockTeam(t, sec) {
  const idx = String(game.currentIndex);
  if (t.wagers[idx] !== undefined) return;
  const used = usedPoints(t);
  for (let n = 1; n <= 10; n++) {
    if (used.indexOf(n) === -1) {
      t.wagers[idx] = n;
      t.wagerMeta = t.wagerMeta || {};
      t.wagerMeta[idx] = { source: "auto", sec };
      return;
    }
  }
}

function autoLockWagers() {
  const sec = game.timer.kind === "wager" ? elapsedSeconds() : game.timer.total;
  Object.values(game.teams).forEach((t) => autoLockTeam(t, sec));
}

function fillNoAnswers(sec) {
  const idx = String(game.currentIndex);
  Object.values(game.teams).forEach((t) => {
    if (t.answers[idx] === undefined) {
      t.answers[idx] = NO_ANSWER;
      t.answerMeta = t.answerMeta || {};
      t.answerMeta[idx] = { sec, auto: true };
    }
  });
}

// ---------------------------------------------------------------------------
// Timer engine (pausable)
// ---------------------------------------------------------------------------
function clearTimer() {
  if (game.timer.handle) clearInterval(game.timer.handle);
  game.timer.handle = null;
  game.timer.running = false;
}

function onWagerExpire() {
  autoLockWagers();
  game.phase = "awaiting_broadcast";
  broadcastAll();
}
function onAnswerExpire() {
  fillNoAnswers(game.timer.total);
  broadcastAll();
}

function startTimer(seconds, kind, keepTotal) {
  clearTimer();
  game.timer.remaining = seconds;
  if (!keepTotal) game.timer.total = seconds;
  game.timer.kind = kind;
  game.timer.running = true;
  game.timer.handle = setInterval(() => {
    try {
      if (game.status === "paused") return;
      game.timer.remaining -= 1;
      if (game.timer.remaining <= 0) {
        game.timer.remaining = 0;
        clearTimer();
        if (kind === "wager") onWagerExpire(); else onAnswerExpire();
      } else {
        io.emit("timer:tick", timerPublic());
      }
    } catch (e) { console.error("[timer]", e && e.stack ? e.stack : e); }
  }, 1000);
}

// After a server restart the interval is gone: restart it from the saved remaining time.
function ensureTimerRunning() {
  if (game.timer.handle) return;
  if (!game.timer.kind || game.timer.remaining <= 0) return;
  const ok = (game.timer.kind === "wager" && game.phase === "wagering") || (game.timer.kind === "answer" && game.phase === "question");
  if (ok && (game.status === "active" || game.status === "paused")) startTimer(game.timer.remaining, game.timer.kind, true);
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------
function beginWagerWindow() {
  game.phase = "wagering";
  startTimer(WAGER_SECONDS, "wager");
  broadcastAll();
}

function broadcastQuestionToTeams() {
  if (game.phase !== "awaiting_broadcast" && game.phase !== "wagering") return false;
  if (game.phase === "wagering") autoLockWagers(); // early broadcast: lock lowest available for anyone who has not wagered
  game.phase = "question";
  startTimer(ANSWER_SECONDS, "answer");
  broadcastAll();
  return true;
}

function nextQuestion() {
  if (game.phase === "question") fillNoAnswers(elapsedSeconds());
  const next = game.currentIndex + 1;
  if (next >= QUESTIONS.length) {
    game.status = "review";
    game.phase = "wagering";
    clearTimer();
    broadcastAll();
    return;
  }
  game.currentIndex = next;
  beginWagerWindow();
}

function newGame(keepToken) {
  const token = keepToken ? game.hostToken : null;
  clearTimer();
  game = freshGame();
  game.code = randomCode();
  game.status = "lobby";
  game.hostToken = token || newToken();
}

// ---------------------------------------------------------------------------
// Excel report
// ---------------------------------------------------------------------------
function violationLabel(type) {
  if (type === "tab_switch") return "Switched tabs / left the quiz window";
  if (type === "exited_fullscreen") return "Exited full screen";
  if (type === "reconnected") return "Reconnected (page refresh or connection drop)";
  return String(type);
}

function buildReport() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "War Room Wager";
  wb.created = new Date();

  const NAVY = "FF1B2328", AMBER = "FFFCE9B8", RED = "FFF6D2D2", GREY = "FFEEF1F2";
  const head = (row) => row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  const fill = (cell, argb) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };

  const teams = Object.values(game.teams).sort((a, b) => a.name.localeCompare(b.name));
  const nQ = QUESTIONS.length;

  const wsLead = wb.addWorksheet("Leaderboard");
  const wsAns = wb.addWorksheet("All Answers");
  const wsW = wb.addWorksheet("Wagers Grid");
  const wsT = wb.addWorksheet("Time Grid");
  const wsV = wb.addWorksheet("Screen-Lock Log");
  const wsK = wb.addWorksheet("Answer Key");

  // ---- All Answers (one row per team per question) ----
  wsAns.columns = [
    { header: "Team", key: "team", width: 24 },
    { header: "Q#", key: "q", width: 6 },
    { header: "Broad Topic", key: "topic", width: 28 },
    { header: "Wager", key: "wager", width: 9 },
    { header: "Wager Set By", key: "wsrc", width: 14 },
    { header: "Wager Time (s)", key: "wsec", width: 14 },
    { header: "Answer", key: "answer", width: 60 },
    { header: "Answer Time (s)", key: "asec", width: 14 },
    { header: "Answered?", key: "answered", width: 11 },
    { header: "Result", key: "result", width: 13 },
    { header: "Points Earned", key: "points", width: 13 }
  ];
  head(wsAns.getRow(1));
  wsAns.views = [{ state: "frozen", ySplit: 1 }];

  const perTeam = {}; // name -> { score, correct, answered, timeSum, timeCount }
  let r = 1;
  teams.forEach((t) => {
    perTeam[t.name] = { score: 0, correct: 0, answered: 0, timeSum: 0, timeCount: 0 };
    for (let q = 0; q < nQ; q++) {
      const k = String(q);
      const wager = t.wagers[k];
      const ans = t.answers[k];
      if (wager === undefined && ans === undefined) continue;
      const wm = (t.wagerMeta || {})[k] || {};
      const am = (t.answerMeta || {})[k] || {};
      const answered = ans !== undefined && ans !== NO_ANSWER;
      const res = t.results[k] === "correct" ? "Correct" : t.results[k] === "wrong" ? "Wrong" : "Not marked";
      const pts = res === "Correct" && typeof wager === "number" ? wager : 0;
      r += 1;
      const row = wsAns.getRow(r);
      row.getCell(1).value = t.name;
      row.getCell(2).value = q + 1;
      row.getCell(3).value = QUESTIONS[q].topic;
      row.getCell(4).value = typeof wager === "number" ? wager : null;
      row.getCell(5).value = wager === undefined ? "" : wm.source === "auto" ? "Auto-locked" : "Team";
      row.getCell(6).value = typeof wm.sec === "number" ? wm.sec : null;
      row.getCell(7).value = ans === undefined ? "" : ans;
      row.getCell(8).value = typeof am.sec === "number" ? am.sec : null;
      row.getCell(9).value = answered ? "Yes" : "No";
      row.getCell(10).value = res;
      row.getCell(11).value = { formula: "IF(J" + r + "=\"Correct\",D" + r + ",0)", result: pts };
      row.getCell(7).alignment = { wrapText: true, vertical: "top" };
      if (wm.source === "auto") fill(row.getCell(5), AMBER);
      if (!answered && ans !== undefined) fill(row.getCell(9), RED);
      const p = perTeam[t.name];
      p.score += pts;
      if (res === "Correct") p.correct += 1;
      if (answered) {
        p.answered += 1;
        if (typeof am.sec === "number") { p.timeSum += am.sec; p.timeCount += 1; }
      }
    }
  });
  const lastAns = Math.max(r, 2);
  wsAns.autoFilter = "A1:K" + lastAns;
  if (r >= 2) {
    wsAns.dataValidations.add("J2:J" + lastAns, { type: "list", allowBlank: false, formulae: ['"Correct,Wrong,Not marked"'] });
  }

  // ---- Leaderboard ----
  wsLead.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Team", key: "team", width: 28 },
    { header: "Total Score", key: "score", width: 13 },
    { header: "Correct Answers", key: "correct", width: 16 },
    { header: "Questions Answered", key: "answered", width: 19 },
    { header: "Avg Answer Time (s)", key: "avg", width: 19 },
    { header: "Screen-Lock Flags", key: "flags", width: 17 }
  ];
  head(wsLead.getRow(1));
  wsLead.views = [{ state: "frozen", ySplit: 1 }];
  const ranked = teams.slice().sort((a, b) => perTeam[b.name].score - perTeam[a.name].score || a.name.localeCompare(b.name));
  const n = ranked.length;
  ranked.forEach((t, i) => {
    const row = i + 2;
    const p = perTeam[t.name];
    const rank = 1 + ranked.filter((o) => perTeam[o.name].score > p.score).length;
    const ws = wsLead.getRow(row);
    ws.getCell(1).value = { formula: "RANK(C" + row + ",$C$2:$C$" + (n + 1) + ")", result: rank };
    ws.getCell(2).value = t.name;
    ws.getCell(3).value = { formula: "SUMIFS('All Answers'!$K:$K,'All Answers'!$A:$A,B" + row + ")", result: p.score };
    ws.getCell(4).value = { formula: "COUNTIFS('All Answers'!$A:$A,B" + row + ",'All Answers'!$J:$J,\"Correct\")", result: p.correct };
    ws.getCell(5).value = { formula: "COUNTIFS('All Answers'!$A:$A,B" + row + ",'All Answers'!$I:$I,\"Yes\")", result: p.answered };
    ws.getCell(6).value = {
      formula: "IFERROR(AVERAGEIFS('All Answers'!$H:$H,'All Answers'!$A:$A,B" + row + ",'All Answers'!$I:$I,\"Yes\"),\"\")",
      result: p.timeCount ? Math.round((p.timeSum / p.timeCount) * 10) / 10 : ""
    };
    ws.getCell(6).numFmt = "0.0";
    ws.getCell(7).value = t.violationCount || 0;
    if (rank === 1 && p.score > 0) ws.eachCell((c) => { c.font = { bold: true }; });
  });
  const infoRow = n + 3;
  wsLead.getCell("B" + infoRow).value = "Game code";
  wsLead.getCell("C" + infoRow).value = game.code || "";
  wsLead.getCell("B" + (infoRow + 1)).value = "Report generated";
  wsLead.getCell("C" + (infoRow + 1)).value = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
  wsLead.getCell("B" + (infoRow + 2)).value = "Tip";
  wsLead.getCell("C" + (infoRow + 2)).value = "Change a Result on the All Answers sheet and this leaderboard recalculates.";
  [infoRow, infoRow + 1, infoRow + 2].forEach((x) => { wsLead.getCell("B" + x).font = { bold: true }; fill(wsLead.getCell("B" + x), GREY); });

  // ---- Wagers grid ----
  const qHeaders = [];
  for (let q = 0; q < nQ; q++) qHeaders.push("Q" + (q + 1));
  wsW.addRow(["Team"].concat(qHeaders, ["Total Wagered"]));
  head(wsW.getRow(1));
  wsW.getColumn(1).width = 26;
  for (let c = 2; c <= nQ + 2; c++) wsW.getColumn(c).width = c === nQ + 2 ? 15 : 7;
  wsW.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  teams.forEach((t, i) => {
    const row = wsW.getRow(i + 2);
    row.getCell(1).value = t.name;
    let sum = 0;
    for (let q = 0; q < nQ; q++) {
      const w = t.wagers[String(q)];
      if (typeof w === "number") {
        row.getCell(q + 2).value = w;
        sum += w;
        if (((t.wagerMeta || {})[String(q)] || {}).source === "auto") fill(row.getCell(q + 2), AMBER);
      }
      row.getCell(q + 2).alignment = { horizontal: "center" };
    }
    const lastCol = String.fromCharCode(65 + nQ); // nQ <= 25
    row.getCell(nQ + 2).value = { formula: "SUM(B" + (i + 2) + ":" + lastCol + (i + 2) + ")", result: sum };
  });
  wsW.getCell("A" + (teams.length + 3)).value = "Amber cell = wager was auto-locked (team did not choose within the wager window).";
  wsW.getCell("A" + (teams.length + 3)).font = { italic: true };

  // ---- Time grid ----
  wsT.addRow(["Team"].concat(qHeaders, ["Avg (answered only)"]));
  head(wsT.getRow(1));
  wsT.getColumn(1).width = 26;
  for (let c = 2; c <= nQ + 2; c++) wsT.getColumn(c).width = c === nQ + 2 ? 20 : 7;
  wsT.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  teams.forEach((t, i) => {
    const row = wsT.getRow(i + 2);
    row.getCell(1).value = t.name;
    let sum = 0, cnt = 0;
    for (let q = 0; q < nQ; q++) {
      const k = String(q);
      const am = (t.answerMeta || {})[k];
      if (am && typeof am.sec === "number") {
        row.getCell(q + 2).value = am.sec;
        if (am.auto) fill(row.getCell(q + 2), RED);
        else { sum += am.sec; cnt += 1; }
      }
      row.getCell(q + 2).alignment = { horizontal: "center" };
    }
    if (cnt) { row.getCell(nQ + 2).value = Math.round((sum / cnt) * 10) / 10; row.getCell(nQ + 2).numFmt = "0.0"; }
  });
  wsT.getCell("A" + (teams.length + 3)).value = "Seconds from question broadcast to submit (paused time excluded). Red = no answer submitted.";
  wsT.getCell("A" + (teams.length + 3)).font = { italic: true };

  // ---- Screen-lock log ----
  wsV.columns = [
    { header: "Time (IST)", key: "t", width: 24 },
    { header: "Team", key: "team", width: 26 },
    { header: "Event", key: "ev", width: 50 }
  ];
  head(wsV.getRow(1));
  if (game.violations.length === 0) {
    wsV.addRow(["", "", "No screen-lock events recorded."]);
  } else {
    game.violations.forEach((v) => {
      wsV.addRow([new Date(v.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), v.teamName, violationLabel(v.type)]);
    });
  }

  // ---- Answer key ----
  wsK.columns = [
    { header: "Q#", key: "q", width: 6 },
    { header: "Broad Topic", key: "topic", width: 28 },
    { header: "Question", key: "question", width: 90 },
    { header: "Benchmark Answer", key: "answer", width: 50 }
  ];
  head(wsK.getRow(1));
  QUESTIONS.forEach((q, i) => {
    const row = wsK.addRow([i + 1, q.topic, q.question, q.answer]);
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
  });

  return wb;
}

app.get("/report.xlsx", async (req, res) => {
  try {
    if (!ExcelJS) return res.status(503).send("Report module is not installed on the server.");
    const token = String(req.query.token || "");
    if (!game.hostToken || !safeEqual(token, game.hostToken)) return res.status(403).send("Not authorised.");
    const wb = buildReport();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"War_Room_Wager_Report_" + (game.code || "game") + "_" + stamp + ".xlsx\"");
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("[report failed]", e && e.stack ? e.stack : e);
    if (!res.headersSent) res.status(500).send("Could not build the report. The game is unaffected - try again.");
  }
});

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
function reply(cb, obj) { if (typeof cb === "function") { try { cb(obj); } catch (e) { /* ignore */ } } }
function notice(socket, msg) { try { socket.emit("notice", { msg }); } catch (e) { /* ignore */ } }

// Registers a handler that can never throw out of the socket (one bad message cannot crash the server).
function on(socket, event, fn, hostOnly) {
  socket.on(event, (a, b) => {
    try {
      let payload = a, cb = b;
      if (typeof a === "function") { cb = a; payload = {}; }
      if (!payload || typeof payload !== "object") payload = {};
      if (hostOnly && !socket.data.isHost) { reply(cb, { ok: false, error: "Not authorised." }); return; }
      fn(payload, cb);
    } catch (e) {
      console.error("[handler error]", event, e && e.stack ? e.stack : e);
    }
  });
}

const authFails = new Map(); // ip -> { count, until }
function clientIp(socket) {
  const xf = socket.handshake && socket.handshake.headers ? socket.handshake.headers["x-forwarded-for"] : null;
  return (xf ? String(xf).split(",")[0].trim() : socket.handshake && socket.handshake.address) || "unknown";
}

let lastNextAt = 0;

io.on("connection", (socket) => {
  // ----- host -----
  on(socket, "host:login", (p, cb) => {
    const ip = clientIp(socket);
    const rec = authFails.get(ip);
    if (rec && rec.until > Date.now()) {
      reply(cb, { ok: false, error: "Too many wrong attempts. Wait a minute and try again." });
      return;
    }
    if (!safeEqual(p.pin, HOST_PIN)) {
      const r = rec || { count: 0, until: 0 };
      r.count += 1;
      if (r.count >= 5) { r.until = Date.now() + 60000; r.count = 0; }
      authFails.set(ip, r);
      reply(cb, { ok: false, error: "Incorrect PIN." });
      return;
    }
    authFails.delete(ip);
    if (game.status === "idle" || !game.code) newGame(false);
    if (!game.hostToken) game.hostToken = newToken();
    socket.data.isHost = true;
    socket.join("host");
    reply(cb, { ok: true, token: game.hostToken });
    broadcastAll();
  });

  on(socket, "host:rejoin", (p, cb) => {
    if (game.hostToken && safeEqual(p.token, game.hostToken)) {
      socket.data.isHost = true;
      socket.join("host");
      reply(cb, { ok: true });
      broadcastHost();
    } else {
      reply(cb, { ok: false });
    }
  });

  on(socket, "host:reset", () => {
    archiveGame();
    io.to("teams").emit("game:reset");
    io.in("teams").socketsLeave("teams");
    newGame(true);
    broadcastAll();
  }, true);

  on(socket, "host:start", () => {
    if (game.status !== "lobby") return;
    game.status = "active";
    game.currentIndex = 0;
    beginWagerWindow();
  }, true);

  on(socket, "host:broadcastQuestion", () => {
    if (game.status === "paused") { notice(socket, "The quiz is paused. Resume it first."); return; }
    if (game.status !== "active") return;
    broadcastQuestionToTeams();
  }, true);

  on(socket, "host:next", () => {
    if (game.status === "paused") { notice(socket, "The quiz is paused. Resume it first."); return; }
    if (game.status !== "active") return;
    if (game.phase !== "question") { notice(socket, "Broadcast the question first, then press Next."); return; }
    const now = Date.now();
    if (now - lastNextAt < 1500) return; // ignore double-clicks
    lastNextAt = now;
    nextQuestion();
  }, true);

  on(socket, "host:finishReview", () => {
    if (game.status !== "review") return;
    game.status = "ended";
    game.lockdown = false;
    clearTimer();
    broadcastAll();
  }, true);

  on(socket, "host:judge", (p) => {
    const t = game.teams[String(p.teamId)];
    if (!t) return;
    if (p.verdict !== "correct" && p.verdict !== "wrong") return;
    let qi = p.questionIndex === undefined ? game.currentIndex : p.questionIndex;
    if (!Number.isInteger(qi) || qi < 0 || qi >= QUESTIONS.length) return;
    t.results[String(qi)] = p.verdict;
    broadcastAll();
  }, true);

  on(socket, "host:pause", () => {
    if (game.status === "active") { game.status = "paused"; broadcastAll(); }
  }, true);

  on(socket, "host:resume", () => {
    if (game.status === "paused") {
      game.status = "active";
      ensureTimerRunning();
      broadcastAll();
    }
  }, true);

  on(socket, "host:setLockdown", (p) => {
    if (game.status === "ended" || game.status === "idle") return;
    game.lockdown = !!p.on;
    broadcastAll();
  }, true);

  on(socket, "host:end", () => {
    if (game.status === "idle") return;
    game.status = "ended";
    game.lockdown = false;
    clearTimer();
    broadcastAll();
  }, true);

  // ----- teams -----
  on(socket, "team:join", (p, cb) => {
    const name = String(p.name || "").trim().replace(/\s+/g, " ").slice(0, MAX_TEAM_NAME);
    const code = String(p.code || "").trim();
    if (!game.code || game.status === "idle" || code !== game.code) {
      reply(cb, { ok: false, error: "No game found with that code." });
      return;
    }
    if (!name) { reply(cb, { ok: false, error: "Enter a team name." }); return; }
    if (game.status === "review" || game.status === "ended") {
      reply(cb, { ok: false, error: "This game has already finished." });
      return;
    }
    const taken = Object.values(game.teams).some((t) => t.name.toLowerCase() === name.toLowerCase());
    if (taken) { reply(cb, { ok: false, error: "That team name is already taken. Choose another." }); return; }
    const id = "t_" + crypto.randomBytes(5).toString("hex");
    const team = { id, name, socketId: socket.id, wagers: {}, answers: {}, results: {}, wagerMeta: {}, answerMeta: {}, violationCount: 0 };
    game.teams[id] = team;
    socket.join("teams");
    socket.data.teamId = id;
    // Joined after the wager window closed: give them the lowest available wager for this question.
    if ((game.status === "active" || game.status === "paused") && (game.phase === "awaiting_broadcast" || game.phase === "question")) {
      autoLockTeam(team, game.timer.kind === "wager" ? game.timer.total : 0);
    }
    reply(cb, { ok: true, teamId: id });
    broadcastAll();
  });

  on(socket, "team:rejoin", (p, cb) => {
    const t = game.teams[String(p.teamId)];
    if (!t) { reply(cb, { ok: false }); return; }
    t.socketId = socket.id;
    socket.join("teams");
    socket.data.teamId = t.id;
    if (game.lockdown) recordViolation(t, "reconnected");
    reply(cb, { ok: true });
    broadcastAll();
  });

  on(socket, "team:wager", (p) => {
    const t = game.teams[socket.data.teamId];
    if (!t || game.phase !== "wagering" || game.status !== "active") return;
    const n = p.n;
    if (!Number.isInteger(n) || n < 1 || n > 10) return;
    const idx = String(game.currentIndex);
    if (t.wagers[idx] !== undefined) return;
    if (usedPoints(t).indexOf(n) !== -1) return;
    t.wagers[idx] = n;
    t.wagerMeta = t.wagerMeta || {};
    t.wagerMeta[idx] = { source: "team", sec: elapsedSeconds() };
    broadcastAll();
  });

  on(socket, "team:violation", (p) => {
    const t = game.teams[socket.data.teamId];
    if (!t || !game.lockdown) return;
    if (VIOLATION_TYPES.indexOf(p.type) === -1) return;
    recordViolation(t, p.type);
    broadcastHost();
    scheduleSave();
  });

  on(socket, "team:answer", (p) => {
    const t = game.teams[socket.data.teamId];
    if (!t || game.phase !== "question" || game.timer.kind !== "answer") return;
    const idx = String(game.currentIndex);
    if (t.answers[idx] !== undefined) return;
    const text = String(p.text === undefined || p.text === null ? "" : p.text).trim().slice(0, MAX_ANSWER_LEN);
    if (!text) return;
    t.answers[idx] = text;
    t.answerMeta = t.answerMeta || {};
    t.answerMeta[idx] = { sec: elapsedSeconds(), auto: false };
    broadcastAll();
  });

  socket.on("disconnect", () => { /* teams and the host rejoin with their stored ids/token; data is kept */ });
});

loadGame();
server.listen(PORT, () => {
  console.log("War Room Wager listening on port " + PORT);
});
