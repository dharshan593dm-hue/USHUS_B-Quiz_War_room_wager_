(function () {
  "use strict";

  const socket = io();

  let view = "home";
  let homeError = "";
  let joinName = "";
  let joinCode = "";
  let joining = false;
  let toastMsg = "";
  let toastTimer = null;

  let hostState = null;   // full state pushed to host
  let teamState = null;   // filtered state pushed to a team
  let myTeamId = localStorage.getItem("wrw_team_id") || null;
  let hostToken = localStorage.getItem("wrw_host_token") || null;
  let hostPinOpen = false;
  let hostPin = "";
  let hostBusy = false;
  let hostError = "";

  // Tracks the "structural" shape of the last full render, so that a bare
  // timer tick (which arrives every second) doesn't tear down and rebuild
  // the DOM — that was destroying focus on the answer textarea and made
  // typing on mobile keyboards impossible.
  let lastStructuralKey = null;

  // ---------------- DOM helpers ----------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((k) => {
      if (k === "class") node.className = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function showToast(msg) {
    toastMsg = msg;
    clearTimeout(toastTimer);
    renderFull();
    toastTimer = setTimeout(() => { toastMsg = ""; renderFull(); }, 2600);
  }

  function usedPoints(wagers) {
    return Object.values(wagers || {});
  }

  function statusLabel(status) {
    if (status === "active") return "LIVE";
    if (status === "paused") return "PAUSED";
    if (status === "review") return "REVIEW";
    if (status === "ended") return "ENDED";
    return "LOBBY";
  }


  // ---------------- Full-screen lock: team side ----------------
  // Browsers only allow full screen after a tap/click on each device, so the host's
  // button switches lock mode ON and every team gets a blocking "Enter Full Screen" screen.
  let lockActive = false;
  let lockEnteredFs = false;
  let lockAcked = false;
  let lockWarning = "";
  let tabFlag = false;
  let lastReport = {};
  let lockOverlayKey = null;

  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen);
  }

  function enterFullscreen() {
    const d = document.documentElement;
    try {
      const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: "hide" }) : d.webkitRequestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function releaseFullscreen() {
    try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) {}
    try {
      if (fsElement()) {
        const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  }

  function reportViolation(type) {
    if (!lockActive || view !== "team") return;
    if (type === "tab_switch") tabFlag = true;
    const now = Date.now();
    if (lastReport[type] && now - lastReport[type] < 1500) return; // blur + visibilitychange fire together
    lastReport[type] = now;
    socket.emit("team:violation", { type });
  }

  function applyLockdown(on) {
    on = !!on;
    if (on && !lockActive) {
      lockActive = true; lockEnteredFs = false; lockAcked = false; lockWarning = ""; tabFlag = false; lastReport = {};
    } else if (!on && lockActive) {
      lockActive = false; lockWarning = ""; tabFlag = false;
      releaseFullscreen();
    }
    updateLockOverlay();
  }

  function overlayModel() {
    if (!lockActive || view !== "team") return null;
    if (fsSupported() && !fsElement()) {
      return lockEnteredFs
        ? { key: "left", title: "YOU LEFT FULL SCREEN", text: "The host has been alerted. Return to full screen to continue the quiz.", btn: "Return to Full Screen", act: "fs" }
        : { key: "enter", title: "FULL SCREEN MODE", text: "The host has locked the quiz to full screen. Tap below to enter. Switching tabs or windows is monitored and reported to the host.", btn: "Enter Full Screen", act: "fs" };
    }
    if (!fsSupported() && !lockAcked) {
      return { key: "focus", title: "FOCUS MODE", text: "The host has turned on focus mode. This device cannot go full screen, but switching tabs or windows is monitored and reported to the host.", btn: "I Understand", act: "ack" };
    }
    if (lockWarning) return { key: "warn:" + lockWarning, title: "WARNING", text: lockWarning, btn: "Back to Quiz", act: "clear" };
    return null;
  }

  function updateLockOverlay() {
    const layer = document.getElementById("lock-layer");
    if (!layer) return;
    const m = overlayModel();
    const key = m ? m.key : "";
    if (key === lockOverlayKey) return; // don't rebuild on every timer tick (would swallow taps)
    lockOverlayKey = key;
    layer.innerHTML = "";
    if (!m) { layer.className = ""; return; }
    layer.className = "on";
    layer.appendChild(el("div", { class: "lock-card" }, [
      el("div", { class: "lock-title" }, [m.title]),
      el("p", { class: "lock-text" }, [m.text]),
      el("button", { class: "btn btn-solid", onclick: () => {
        if (m.act === "fs") enterFullscreen();
        else if (m.act === "ack") { lockAcked = true; updateLockOverlay(); }
        else { lockWarning = ""; updateLockOverlay(); }
      } }, [m.btn])
    ]));
  }

  function onFsChange() {
    if (fsElement()) {
      lockEnteredFs = true;
      try { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {}); } catch (e) {}
    } else if (lockActive && lockEnteredFs) {
      reportViolation("exited_fullscreen");
    }
    updateLockOverlay();
  }
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  function returnedToQuiz() {
    if (lockActive && view === "team" && tabFlag) {
      tabFlag = false;
      lockWarning = "You switched away from the quiz. The host has been alerted.";
      updateLockOverlay();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reportViolation("tab_switch");
    else returnedToQuiz();
  });
  window.addEventListener("blur", () => reportViolation("tab_switch"));
  window.addEventListener("focus", returnedToQuiz);

  // ---------------- Full-screen lock: host side ----------------
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.resume) audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
  }

  function violationText(type) {
    if (type === "tab_switch") return "switched tabs / left the quiz window";
    if (type === "exited_fullscreen") return "exited full screen";
    if (type === "reconnected") return "reconnected (page refresh or connection drop)";
    return type;
  }
  function timeText(ms) { return new Date(ms).toLocaleTimeString(); }

  function pushAlert(a) {
    const layer = document.getElementById("alert-layer");
    if (!layer) return;
    const node = el("div", { class: "alert-card" }, [
      el("div", { class: "alert-body" }, [
        el("b", {}, [a.teamName]), " " + violationText(a.type),
        el("small", {}, [timeText(a.at)])
      ]),
      el("button", { class: "alert-x", onclick: () => node.remove() }, ["×"])
    ]);
    layer.insertBefore(node, layer.firstChild);
    while (layer.children.length > 5) layer.removeChild(layer.lastChild);
    setTimeout(() => { if (node.parentNode) node.remove(); }, 12000);
    beep();
  }

  function toggleLock() {
    const on = !(hostState && hostState.lockdown);
    socket.emit("host:setLockdown", { on });
  }

  function renderViolationLog() {
    const v = hostState.violations || [];
    if (!hostState.lockdown && v.length === 0) return null;
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("p", { class: "panel-label" }, ["SCREEN-LOCK MONITOR — " + (hostState.lockdown ? "LOCK ON" : "LOCK OFF")]));
    if (v.length === 0) {
      panel.appendChild(el("p", { class: "empty-note" }, ["No violations so far."]));
    } else {
      v.slice().reverse().slice(0, 20).forEach((r) => {
        panel.appendChild(el("div", { class: "viol-row" }, [
          el("span", { class: "viol-time" }, [timeText(r.at)]),
          el("b", {}, [r.teamName]),
          " " + violationText(r.type)
        ]));
      });
    }
    return panel;
  }

  // ---------------- Socket wiring ----------------
  socket.on("host:state", (state) => {
    hostState = state;
    if (view === "host") smartRender(hostStructuralKey(state));
  });
  socket.on("team:state", (state) => {
    teamState = state;
    if (view === "team") { applyLockdown(state.lockdown); smartRender(teamStructuralKey(state)); }
  });
  socket.on("host:alert", (alert) => {
    if (view === "host") pushAlert(alert);
  });
  // Light once-a-second timer update (the full state is only pushed when something changes).
  socket.on("timer:tick", (t) => {
    if (hostState) hostState.timer = t;
    if (teamState) teamState.timer = t;
    updateTimerInPlace();
  });
  socket.on("notice", (n) => { if (n && n.msg) showToast(n.msg); });
  socket.on("game:reset", () => {
    if (view !== "team") return;
    localStorage.removeItem("wrw_team_id");
    myTeamId = null;
    teamState = null;
    applyLockdown(false);
    lastStructuralKey = null;
    view = "home";
    joinCode = "";
    homeError = "The host started a new game. Join again with the new code.";
    renderFull();
  });

  // ---------------- Connection banner ----------------
  function showConn(lost) {
    const d = document.getElementById("conn-layer");
    if (!d) return;
    d.className = lost ? "on" : "";
    d.textContent = lost ? "Connection lost — reconnecting…" : "";
  }
  socket.on("disconnect", () => showConn(true));
  socket.on("connect_error", () => showConn(true));
  socket.on("connect", () => showConn(false));
  window.addEventListener("offline", () => showConn(true));
  window.addEventListener("online", () => { if (socket.connected) showConn(false); });

  function hostStructuralKey(state) {
    if (!state) return "none";
    const teamsKey = (state.teams || [])
      .map((t) => t.id + ":" + JSON.stringify(t.wagers) + ":" + JSON.stringify(t.answers) + ":" + JSON.stringify(t.results))
      .join("|");
    return [state.status, state.phase, state.currentIndex, state.lockdown ? "lock" : "open", (state.violations || []).length, teamsKey].join("::");
  }

  function teamStructuralKey(state) {
    if (!state || !state.me) return "none";
    const idx = String(state.currentIndex);
    const me = state.me;
    return [
      state.status,
      state.phase,
      state.currentIndex,
      me.wagers ? me.wagers[idx] : "-",
      me.answers ? (me.answers[idx] !== undefined ? "answered" : "-") : "-",
      me.score
    ].join("::");
  }

  function smartRender(newKey) {
    if (newKey !== lastStructuralKey) {
      lastStructuralKey = newKey;
      renderFull();
    } else {
      updateTimerInPlace();
    }
  }

  function updateTimerInPlace() {
    const state = view === "host" ? hostState : teamState;
    if (!state) return;
    const timer = state.timer;
    const fill = document.getElementById("timer-fill");
    const label = document.getElementById("timer-label");
    if (!fill || !label || !timer || !timer.total) return;
    const pct = Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100));
    const urgent = timer.remaining <= Math.ceil(timer.total * 0.25);
    fill.style.width = pct + "%";
    fill.className = "timer-bar-fill" + (urgent ? " urgent" : "");
    const kindLabel = timer.kind === "wager" ? "TIME TO WAGER" : timer.kind === "answer" ? "TIME TO ANSWER" : "";
    label.textContent = kindLabel + " — " + timer.remaining + "s";
  }

  function forgetHost() {
    hostToken = null;
    hostState = null;
    localStorage.removeItem("wrw_host_token");
  }

  function rejoinIfNeeded() {
    if (hostToken) {
      socket.emit("host:rejoin", { token: hostToken }, (res) => {
        if (res && res.ok) { view = "host"; lastStructuralKey = null; renderFull(); return; }
        forgetHost();
        hostError = "Host session expired. Enter the PIN to continue.";
        hostPinOpen = true;
        if (view === "host") view = "home";
        lastStructuralKey = null;
        renderFull();
      });
      return;
    }
    if (myTeamId) {
      socket.emit("team:rejoin", { teamId: myTeamId }, (res) => {
        if (res && res.ok) { view = "team"; lastStructuralKey = null; renderFull(); }
        else { localStorage.removeItem("wrw_team_id"); myTeamId = null; renderFull(); }
      });
    }
  }
  socket.on("connect", rejoinIfNeeded);

  // ---------------- Actions ----------------
  function hostLogin() {
    hostError = "";
    const pin = hostPin.trim();
    if (!pin) { hostError = "Enter the host PIN."; renderFull(); return; }
    if (hostBusy) return;
    hostBusy = true;
    renderFull();
    let answered = false;
    const guard = setTimeout(() => {
      if (answered) return;
      hostBusy = false;
      hostError = "No response from the server. Check your connection and try again.";
      renderFull();
    }, 8000);
    socket.emit("host:login", { pin }, (res) => {
      answered = true;
      clearTimeout(guard);
      hostBusy = false;
      hostPin = "";
      if (res && res.ok) {
        hostToken = res.token;
        localStorage.setItem("wrw_host_token", hostToken);
        hostPinOpen = false;
        hostError = "";
        view = "host";
        lastStructuralKey = null;
      } else {
        hostError = (res && res.error) || "Could not log in.";
      }
      renderFull();
    });
  }

  function newGame() {
    if (!window.confirm("Start a NEW game?\n\nThis removes every team and result from the current game (a backup copy is kept on the server). Download the Excel report first if you still need it.")) return;
    socket.emit("host:reset");
    lastStructuralKey = null;
  }

  function downloadReport() {
    if (!hostToken) return;
    fetch("/report.xlsx?token=" + encodeURIComponent(hostToken))
      .then((r) => {
        if (!r.ok) throw new Error("status " + r.status);
        const cd = r.headers.get("Content-Disposition") || "";
        const m = /filename="([^"]+)"/.exec(cd);
        const name = m ? m[1] : "War_Room_Wager_Report.xlsx";
        return r.blob().then((blob) => ({ blob, name }));
      })
      .then(({ blob, name }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        showToast("Report downloaded.");
      })
      .catch(() => showToast("Could not download the report. Try again in a moment."));
  }

  function hostFooter() {
    return el("div", { class: "host-footer" }, [
      el("button", { class: "footer-link", onclick: leaveHost }, ["Exit host console"]),
      el("button", { class: "footer-link", onclick: newGame }, ["Start a new game"])
    ]);
  }

  function submitJoin() {
    homeError = "";
    const name = joinName.trim();
    const code = joinCode.trim();
    if (!name) { homeError = "Enter your team name."; renderFull(); return; }
    if (!code) { homeError = "Enter the joining code."; renderFull(); return; }
    joining = true; renderFull();
    let joinAnswered = false;
    const joinGuard = setTimeout(() => {
      if (joinAnswered) return;
      joining = false;
      homeError = "No response from the server. Check your connection and try again.";
      renderFull();
    }, 8000);
    socket.emit("team:join", { name, code }, (res) => {
      joinAnswered = true;
      clearTimeout(joinGuard);
      joining = false;
      if (res && res.ok) {
        myTeamId = res.teamId;
        localStorage.setItem("wrw_team_id", myTeamId);
        view = "team";
        lastStructuralKey = null;
        renderFull();
      } else {
        homeError = (res && res.error) || "Could not join.";
        renderFull();
      }
    });
  }

  function placeWager(n) {
    socket.emit("team:wager", { n });
  }

  function submitAnswer(text) {
    socket.emit("team:answer", { text });
  }

  function leaveHost() {
    forgetHost();
    lastStructuralKey = null;
    view = "home";
    renderFull();
  }

  // ---------------- Timer bar ----------------
  function timerBar(timer) {
    if (!timer || !timer.total) return null;
    const pct = Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100));
    const urgent = timer.remaining <= Math.ceil(timer.total * 0.25);
    const kindLabel = timer.kind === "wager" ? "TIME TO WAGER" : timer.kind === "answer" ? "TIME TO ANSWER" : "";
    return el("div", { class: "timer-wrap" }, [
      el("div", { id: "timer-label", class: "timer-label" }, [kindLabel + " — " + timer.remaining + "s"]),
      el("div", { class: "timer-bar-bg" }, [
        el("div", { id: "timer-fill", class: "timer-bar-fill" + (urgent ? " urgent" : ""), style: "width:" + pct + "%" })
      ])
    ]);
  }

  // ---------------- Views ----------------
  function renderHome() {
    const wrap = el("div", { class: "home-wrap" });
    const hostPanel = el("div", { class: "panel" }, [el("p", { class: "panel-label" }, ["HOST"])]);
    if (!hostPinOpen) {
      hostPanel.appendChild(el("button", { class: "btn btn-solid", onclick: () => { hostPinOpen = true; hostError = ""; renderFull(); } }, ["Join as Host"]));
    } else {
      hostPanel.appendChild(el("div", { class: "field" }, [
        el("label", {}, ["Host PIN"]),
        el("input", {
          type: "password", id: "pin-input", value: hostPin, placeholder: "Enter PIN", autocomplete: "off",
          oninput: (e) => { hostPin = e.target.value; },
          onkeydown: (e) => { if (e.key === "Enter") hostLogin(); }
        })
      ]));
      if (hostError) hostPanel.appendChild(el("p", { class: "error-text" }, [hostError]));
      hostPanel.appendChild(el("button", { class: "btn btn-solid", disabled: hostBusy ? "true" : null, onclick: hostLogin }, [hostBusy ? "Checking…" : "Enter Host Console"]));
    }
    wrap.appendChild(hostPanel);
    wrap.appendChild(el("div", { class: "divider-word" }, ["OR"]));
    wrap.appendChild(el("div", { class: "panel" }, [
      el("p", { class: "panel-label" }, ["TEAM"]),
      el("div", { class: "field" }, [
        el("label", {}, ["Team name"]),
        el("input", { type: "text", value: joinName, placeholder: "e.g. Alpha Squad", oninput: (e) => { joinName = e.target.value; } })
      ]),
      el("div", { class: "field" }, [
        el("label", {}, ["Joining code"]),
        el("input", { type: "text", class: "code", value: joinCode, placeholder: "CODE", maxlength: "6", oninput: (e) => { joinCode = e.target.value; } })
      ]),
      homeError ? el("p", { class: "error-text" }, [homeError]) : null,
      el("button", { class: "btn", disabled: joining ? "true" : null, onclick: submitJoin }, [joining ? "Joining…" : "Join Game"])
    ]));
    return wrap;
  }

  function renderLeaderboard(teams) {
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("p", { class: "panel-label" }, ["STANDINGS"]));
    const sorted = (teams || []).slice().sort((a, b) => b.score - a.score);
    if (sorted.length === 0) {
      panel.appendChild(el("p", { class: "empty-note" }, ["No teams yet."]));
      return panel;
    }
    const lb = el("div", { class: "leaderboard" });
    sorted.forEach((t, i) => {
      lb.appendChild(el("div", { class: "lb-row" }, [
        el("div", { class: "lb-rank" }, [String(i + 1)]),
        el("div", { class: "lb-name" }, [t.name]),
        el("div", { class: "lb-score" }, [t.score + " pts"])
      ]));
    });
    panel.appendChild(lb);
    return panel;
  }

  function renderHostReview() {
    const wrap = el("div", { class: "host-wrap" });
    wrap.appendChild(el("div", { class: "host-top" }, [
      el("div", { class: "code-badge" }, ["JOIN CODE", el("b", {}, [hostState.code || "------"])]),
      el("span", { class: "status-pill paused" }, ["REVIEW"])
    ]));
    wrap.appendChild(el("p", { class: "empty-note", style: "margin-bottom:14px;" }, [
      "All 10 questions are done. Review each team's wagers and typed answers below, mark Correct / Wrong, then reveal final standings."
    ]));
    wrap.appendChild(el("div", { class: "control-row" }, [
      el("button", { class: "btn btn-auto btn-solid", onclick: () => socket.emit("host:finishReview") }, ["Show Final Standings"]),
      el("button", { class: "btn btn-auto", onclick: downloadReport }, ["Download Excel Report"])
    ]));

    const allQ = hostState.allQuestions || [];
    (hostState.teams || []).forEach((team) => {
      const panel = el("div", { class: "panel" });
      panel.appendChild(el("p", { class: "panel-label" }, [team.name + " — " + team.score + " pts"]));
      allQ.forEach((q, idx) => {
        const wager = team.wagers ? team.wagers[String(idx)] : undefined;
        const answer = team.answers ? team.answers[String(idx)] : undefined;
        const result = team.results ? team.results[String(idx)] : undefined;
        if (wager === undefined && answer === undefined) return;
        const row = el("div", { class: "review-row" });
        const rwm = team.wagerMeta ? team.wagerMeta[String(idx)] : null;
        const ram = team.answerMeta ? team.answerMeta[String(idx)] : null;
        const rAuto = rwm && rwm.source === "auto" ? " (auto-locked)" : "";
        const rTime = ram && !ram.auto && typeof ram.sec === "number" ? " (" + ram.sec + "s)" : "";
        row.appendChild(el("div", { class: "review-q-label" }, ["Q" + (idx + 1) + " · " + q.topic + " — wagered " + (wager !== undefined ? wager : "—") + rAuto]));
        row.appendChild(el("div", { class: "review-answer" }, [
          el("span", { class: "typed-answer-label" }, ["Their answer" + rTime + ": "]),
          el("span", {}, [answer !== undefined ? answer : "(none)"])
        ]));
        row.appendChild(el("div", { class: "review-answer" }, [
          el("span", { class: "typed-answer-label" }, ["Benchmark: "]),
          el("span", {}, [q.answer])
        ]));
        if (result) {
          row.appendChild(el("span", { class: "judged-tag " + result }, [result === "correct" ? "✓ Marked Correct (+" + wager + ")" : "✗ Marked Wrong"]));
        } else {
          const jb = el("div", { class: "judge-btns" });
          jb.appendChild(el("button", { class: "btn btn-olive", onclick: () => socket.emit("host:judge", { teamId: team.id, verdict: "correct", questionIndex: idx }) }, ["Correct"]));
          jb.appendChild(el("button", { class: "btn btn-red", onclick: () => socket.emit("host:judge", { teamId: team.id, verdict: "wrong", questionIndex: idx }) }, ["Wrong"]));
          row.appendChild(jb);
        }
        panel.appendChild(row);
      });
      wrap.appendChild(panel);
    });

    wrap.appendChild(hostFooter());
    return wrap;
  }

  function renderHost() {
    const wrap = el("div", { class: "host-wrap" });
    if (!hostState) {
      wrap.appendChild(el("p", { class: "empty-note" }, ["Setting up your game…"]));
      return wrap;
    }
    const st = hostState.status;

    if (st === "review") return renderHostReview();

    wrap.appendChild(el("div", { class: "host-top" }, [
      el("div", { class: "code-badge" }, ["JOIN CODE", el("b", {}, [hostState.code || "------"])]),
      el("span", { class: "status-pill " + (st === "active" ? "live" : st === "paused" ? "paused" : st === "ended" ? "ended" : "") }, [statusLabel(st)])
    ]));

    const controls = el("div", { class: "control-row" });
    if (st === "lobby") {
      controls.appendChild(el("button", { class: "btn btn-solid", onclick: () => socket.emit("host:start") }, ["Start Quiz"]));
      controls.appendChild(el("button", { class: "btn " + (hostState.lockdown ? "btn-red" : ""), onclick: toggleLock }, [hostState.lockdown ? "Release Full Screen" : "Lock Full Screen"]));
    } else if (st === "active" || st === "paused") {
      controls.appendChild(el("button", { class: "btn btn-olive", onclick: () => socket.emit(st === "paused" ? "host:resume" : "host:pause") }, [st === "paused" ? "Resume" : "Pause"]));
      controls.appendChild(el("button", { class: "btn " + (hostState.lockdown ? "btn-red" : ""), onclick: toggleLock }, [hostState.lockdown ? "Release Full Screen" : "Lock Full Screen"]));
      controls.appendChild(el("button", { class: "btn btn-red", onclick: () => socket.emit("host:end") }, ["End Quiz"]));
    }
    if (st === "ended") {
      controls.appendChild(el("button", { class: "btn btn-solid btn-auto", onclick: downloadReport }, ["Download Excel Report"]));
    }
    wrap.appendChild(controls);

    if (st === "ended") {
      wrap.appendChild(renderLeaderboard(hostState.teams));
    } else if (st !== "lobby") {
      const q = hostState.question;
      const phase = hostState.phase;
      const qPanel = el("div", { class: "panel" });
      qPanel.appendChild(el("span", { class: "phase-tag" }, [
        phase === "wagering" ? "WAGERING" :
        phase === "awaiting_broadcast" ? "READY TO BROADCAST" : "QUESTION LIVE"
      ]));
      qPanel.appendChild(el("p", { class: "q-topic-label" }, [
        "QUESTION " + (hostState.currentIndex + 1) + " OF " + hostState.totalQuestions + (q && q.format ? " · " + q.format.toUpperCase() : "")
      ]));
      qPanel.appendChild(el("p", { class: "q-topic" }, [q ? q.topic : ""]));
      qPanel.appendChild(timerBar(hostState.timer));
      qPanel.appendChild(el("p", { class: "q-text" }, [q ? q.question : ""]));
      qPanel.appendChild(el("div", { class: "q-answer" }, ["Correct answer: " + (q ? q.answer : "")]));

      const qControls = el("div", { class: "control-row" });
      if (phase === "wagering") {
        qControls.appendChild(el("button", { class: "btn btn-auto btn-solid", onclick: () => socket.emit("host:broadcastQuestion") }, ["Broadcast Question Now"]));
      } else if (phase === "awaiting_broadcast") {
        qControls.appendChild(el("button", { class: "btn btn-auto btn-solid", onclick: () => socket.emit("host:broadcastQuestion") }, ["Broadcast Question to Teams"]));
      } else {
        const label = hostState.currentIndex + 1 >= hostState.totalQuestions ? "Finish Round" : "Next Question";
        qControls.appendChild(el("button", { class: "btn btn-auto btn-solid", onclick: () => socket.emit("host:next") }, [label]));
      }
      qPanel.appendChild(qControls);
      wrap.appendChild(qPanel);
    }

    const vlog = renderViolationLog();
    if (vlog) wrap.appendChild(vlog);

    const roster = el("div", { class: "panel" });
    roster.appendChild(el("p", { class: "panel-label" }, ["TEAMS (" + (hostState.teams || []).length + ")"]));
    if (!hostState.teams || hostState.teams.length === 0) {
      roster.appendChild(el("p", { class: "empty-note" }, ["No teams have joined yet. Share the code above."]));
    } else {
      hostState.teams.forEach((team) => {
        const row = el("div", { class: "team-row" });
        row.appendChild(el("div", { class: "team-name" }, [team.name]));
        row.appendChild(el("div", { class: "team-score" }, [team.score + " pts"]));
        if (team.violationCount > 0) row.appendChild(el("span", { class: "viol-badge" }, ["⚠ " + team.violationCount]));

        if (st !== "lobby" && st !== "ended") {
          const idx = String(hostState.currentIndex);
          const wager = team.wagers ? team.wagers[idx] : undefined;
          const typedAnswer = team.answers ? team.answers[idx] : undefined;

          const wm = team.wagerMeta ? team.wagerMeta[idx] : null;
          const am = team.answerMeta ? team.answerMeta[idx] : null;
          const autoTag = wm && wm.source === "auto" ? " (auto)" : "";
          const noAns = typedAnswer === "[No Answer Submitted]";
          const timeTag = am && !am.auto && typeof am.sec === "number" ? " in " + am.sec + "s" : "";
          if (wager === undefined) {
            row.appendChild(el("span", { class: "wager-status" }, ["Waiting to wager…"]));
          } else if (typedAnswer === undefined) {
            row.appendChild(el("span", { class: "wager-status has-wager" }, ["Wagered " + wager + autoTag + " — writing answer…"]));
          } else if (noAns) {
            row.appendChild(el("span", { class: "wager-status has-wager" }, ["Wagered " + wager + autoTag + " — no answer submitted"]));
          } else {
            row.appendChild(el("span", { class: "wager-status has-wager" }, ["Wagered " + wager + autoTag + " — answer received ✓" + timeTag]));
          }

          if (typedAnswer !== undefined) {
            row.appendChild(el("div", { class: "typed-answer" }, [
              el("span", { class: "typed-answer-label" }, ["Their answer: "]),
              el("span", {}, [typedAnswer])
            ]));
          }
        }

        const used = usedPoints(team.wagers);
        const strip = el("div", { class: "points-used-strip" });
        for (let n = 1; n <= 10; n++) {
          strip.appendChild(el("span", { class: "pu-chip" + (used.indexOf(n) !== -1 ? " used" : "") }, [String(n)]));
        }
        row.appendChild(strip);

        roster.appendChild(row);
      });
    }
    wrap.appendChild(roster);

    wrap.appendChild(hostFooter());

    return wrap;
  }

  function renderTeam() {
    const wrap = el("div", { class: "team-wrap" });
    if (!teamState) {
      wrap.appendChild(el("div", { class: "waiting-block" }, [el("div", { class: "pulse" }), el("p", {}, ["Connecting…"])]));
      return wrap;
    }
    const st = teamState.status;
    const me = teamState.me;

    wrap.appendChild(el("div", { class: "team-top" }, [
      el("span", { class: "team-header" }, [me.name.toUpperCase()]),
      el("span", { class: "team-scoreline" }, [me.score + " points"])
    ]));

    if (st === "paused") {
      wrap.appendChild(el("div", { class: "waiting-block" }, [el("div", { class: "pulse" }), el("p", {}, ["The host has paused the round. Hold tight."])]));
      return wrap;
    }
    if (st === "review") {
      wrap.appendChild(el("div", { class: "waiting-block" }, [el("div", { class: "pulse" }), el("p", {}, ["All questions are done. The host is reviewing every team's answers — final results coming soon."])]));
      return wrap;
    }
    if (st === "ended") {
      wrap.appendChild(el("p", {}, ["The quiz has ended. Final standings:"]));
      wrap.appendChild(renderLeaderboard([{ id: me.id, name: me.name, score: me.score }]));
      return wrap;
    }
    if (st === "lobby") {
      wrap.appendChild(el("div", { class: "waiting-block" }, [el("div", { class: "pulse" }), el("p", {}, ["Waiting for the host to start the quiz…"])]));
      return wrap;
    }

    const idx = teamState.currentIndex;
    const phase = teamState.phase;
    const myWager = me.wagers ? me.wagers[String(idx)] : undefined;
    const myAnswer = me.answers ? me.answers[String(idx)] : undefined;
    const used = usedPoints(me.wagers);

    wrap.appendChild(el("p", { class: "topic-banner" }, ["QUESTION " + (idx + 1) + " OF " + teamState.totalQuestions + " — TOPIC"]));
    wrap.appendChild(el("p", { class: "topic-name" }, [teamState.topic || ""]));
    wrap.appendChild(timerBar(teamState.timer));

    if (phase === "wagering") {
      if (myWager === undefined) {
        const grid = el("div", { class: "wager-grid" });
        [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].forEach((rowNums) => {
          const row = el("div", { class: "wager-row" });
          rowNums.forEach((n) => {
            const isUsed = used.indexOf(n) !== -1;
            row.appendChild(el("button", { class: "wager-btn" + (isUsed ? " used" : ""), disabled: isUsed ? "true" : null, onclick: () => placeWager(n) }, [String(n)]));
          });
          grid.appendChild(row);
        });
        wrap.appendChild(el("p", { class: "wager-hint" }, ["Choose how many points to wager. Each number can only be used once. Auto-locks to your lowest available number if time runs out."]));
        wrap.appendChild(grid);
      } else {
        wrap.appendChild(el("div", { class: "locked-block" }, [
          el("div", { class: "locked-value" }, [String(myWager)]),
          el("div", { class: "locked-label" }, ["POINTS LOCKED IN — WAITING FOR THE QUESTION"])
        ]));
      }
    } else if (phase === "awaiting_broadcast") {
      wrap.appendChild(el("div", { class: "locked-block" }, [
        el("div", { class: "locked-value" }, [String(myWager !== undefined ? myWager : "—")]),
        el("div", { class: "locked-label" }, ["WAGER LOCKED — WAITING FOR THE HOST TO SHOW THE QUESTION"])
      ]));
    } else if (phase === "question") {
      wrap.appendChild(el("div", { class: "locked-block", style: "padding-top:0;" }, [
        el("div", { class: "locked-value" }, [String(myWager !== undefined ? myWager : "—")]),
        el("div", { class: "locked-label" }, ["POINTS ON THE LINE"])
      ]));
      wrap.appendChild(el("div", { class: "question-block" }, [el("p", { class: "q-text" }, [teamState.question || ""])]));
      if (myAnswer === undefined) {
        const box = el("textarea", { id: "answer-box", class: "answer-textarea", rows: "3", placeholder: "Type your team's answer…" });
        wrap.appendChild(el("div", { class: "answer-input-block" }, [
          box,
          el("button", { class: "btn btn-solid", style: "margin-top:10px;", onclick: () => submitAnswer(document.getElementById("answer-box").value) }, ["Submit Answer"])
        ]));
      } else {
        wrap.appendChild(el("div", { class: "answer-locked-note" }, [
          el("span", {}, ["Your answer: "]), el("b", {}, [myAnswer]),
          el("div", { class: "locked-label", style: "margin-top:8px;" }, ["LOCKED IN — WAITING FOR THE HOST"])
        ]));
      }
    }

    return wrap;
  }

  // ---------------- One-screen fit (team view) ----------------
  // Shrinks the question text until the question, timer and answer box all fit
  // on the screen with no scrolling.
  function fitQuestionText() {
    const box = document.querySelector("body.team-fit .question-block");
    const txt = box && box.querySelector(".q-text");
    if (!txt) return;
    box.style.overflowY = "hidden";
    let size = Math.min(22, Math.max(14, Math.round(window.innerWidth / 26)));
    const min = 9;
    txt.style.fontSize = size + "px";
    while (box.scrollHeight > box.clientHeight + 1 && size > min) {
      size -= 0.5;
      txt.style.fontSize = size + "px";
    }
    if (box.scrollHeight > box.clientHeight + 1) box.style.overflowY = "auto"; // last-resort fallback
  }
  window.addEventListener("resize", () => requestAnimationFrame(fitQuestionText));
  window.addEventListener("orientationchange", () => setTimeout(fitQuestionText, 250));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", () => requestAnimationFrame(fitQuestionText));

  // ---------------- Root render ----------------
  function renderFull() {
    const app = document.getElementById("app");
    document.body.classList.toggle("team-fit", view === "team");
    app.innerHTML = "";
    app.appendChild(el("div", { class: "brand-row" }, [el("div", { class: "brand-mark" })]));
    app.appendChild(el("h1", { class: "title" }, ["WAR ROOM ", el("span", { class: "wager" }, ["WAGER"])]));
    app.appendChild(el("p", { class: "subtitle" }, [
      view === "home" ? "COLLEGE QUIZ COMPETITION" : view === "host" ? "HOST CONSOLE" : "TEAM CONSOLE"
    ]));
    const screen = el("div", { class: "screen" });
    if (view === "home") screen.appendChild(renderHome());
    else if (view === "host") screen.appendChild(renderHost());
    else if (view === "team") screen.appendChild(renderTeam());
    app.appendChild(screen);
    if (toastMsg) app.appendChild(el("div", { class: "toast" }, [toastMsg]));
    requestAnimationFrame(fitQuestionText);
    if (view === "home" && hostPinOpen && !hostBusy) {
      const pin = document.getElementById("pin-input");
      if (pin && document.activeElement !== pin) pin.focus();
    }
  }

  ["lock-layer", "alert-layer", "conn-layer"].forEach((id) => {
    const d = document.createElement("div");
    d.id = id;
    document.body.appendChild(d);
  });

  if (hostToken) view = "host";
  else if (myTeamId) view = "team";
  renderFull();
})();
