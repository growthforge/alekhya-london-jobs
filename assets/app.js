/* Alekhya · London Job Search — single-file app (no build step, no tracking). */
(function () {
  "use strict";
  var A = window.APP, C = window.CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("alekhya." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("alekhya." + k, JSON.stringify(v)); } catch (e) {} }
  };
  var isMobile = function () { return window.matchMedia("(max-width: 759px)").matches || window.matchMedia("(pointer: coarse)").matches; };

  /* ---------- icons ---------- */
  var P = {
    today: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    fresh: '<path d="M12 3v3M12 18v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M3 12h3M18 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/>',
    roles: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    process: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="16" r="3"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    prompts: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    outreach: '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>',
    tracker: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    cv: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    toolkit: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'
  };
  var ico = function (n) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || "") + "</svg>"; };

  var ROUTES = [
    ["today", "Today"], ["fresh", "Fresh jobs"], ["roles", "Roles & links"], ["process", "Process"],
    ["prompts", "Prompts"], ["outreach", "Outreach"], ["tracker", "Tracker"], ["cv", "CV"], ["linkedin", "LinkedIn"], ["toolkit", "Toolkit"]
  ];
  var TITLE = {}; ROUTES.forEach(function (r) { TITLE[r[0]] = r[1]; });

  /* ---------- UI helpers ---------- */
  var toastT;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  function copy(text, label) {
    var done = function () { toast((label || "Copied") + " ✓"); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed: select and copy manually"); } document.body.removeChild(ta);
    }
  }
  var COPY = []; // registry so we never put long text in attributes
  function copyBtn(text, label, cls) { var i = COPY.push(text) - 1; return '<button class="btn ' + (cls || "sm") + '" data-copy="' + i + '" data-label="' + esc(label || "Copied") + '">Copy</button>'; }
  function modal(html) { $("#modal").innerHTML = html; $("#modalBackdrop").hidden = false; var f = $("#modal button, #modal a"); if (f) f.focus(); }
  function closeModal() { $("#modalBackdrop").hidden = true; $("#modal").innerHTML = ""; }
  function openSheet() {
    var more = ["prompts", "outreach", "tracker", "cv", "linkedin", "toolkit"];
    $("#sheet").innerHTML = '<div class="grab"></div><div class="sheet-grid">' + more.map(function (r) { return '<a href="#/' + r + '">' + ico(r) + esc(TITLE[r]) + "</a>"; }).join("") + "</div>";
    $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
  }
  function closeSheet() { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; }

  /* ---------- dates & UK working days ---------- */
  var HOL = {};
  ["2026-12-25", "2026-12-28", "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"].forEach(function (d) { HOL[d] = "Bank holiday"; });
  fetch("data/bank-holidays.json").then(function (r) { return r.json(); }).then(function (j) {
    (j["england-and-wales"].events || []).forEach(function (e) { HOL[e.date] = e.title; });
  }).catch(function () {});
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var ymd = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var parseYmd = function (s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var isWork = function (d) { var w = d.getDay(); return w !== 0 && w !== 6 && !HOL[ymd(d)]; };
  function addWork(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var c = 0; while (c < n) { x.setDate(x.getDate() + 1); if (isWork(x)) c++; } return x; }
  var fmt = function (d) { return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); };
  function londonNow() { var s = new Date().toLocaleString("en-CA", { timeZone: "Europe/London", hour12: false }); var m = s.match(/(\d+)-(\d+)-(\d+),?\s+(\d+):(\d+)/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4] % 24, +m[5]) : new Date(); }
  function plan(applied) {
    var out = addWork(applied, 1), f1 = addWork(applied, 8), f2 = addWork(applied, 15);
    return { out: out, f1: f1, f2: f2 };
  }
  function ics(title, d, desc) {
    var s = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alekhya London Jobs//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VTIMEZONE", "TZID:Europe/London",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:" + s + "-" + Math.random().toString(36).slice(2) + "@alekhya-london-jobs", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;TZID=Europe/London:" + s + "T083000", "DTEND;TZID=Europe/London:" + s + "T084500",
      "SUMMARY:" + title.replace(/[,;]/g, " "), "DESCRIPTION:" + (desc || "").replace(/\n/g, "\\n").replace(/[,;]/g, " "),
      "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Outreach", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }
  function gcal(title, d, desc) {
    var s = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + s + "T083000/" + s + "T084500&ctz=Europe/London&details=" + encodeURIComponent(desc || "");
  }
  function download(name, text, type) {
    var b = new Blob([text], { type: type || "text/plain" }), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Open all ---------- */
  var pendingOpen = null;
  function openAll(items, label) {
    // items: [{name,url}]
    if (!items.length) return;
    if (isMobile()) { return stepper(items, label, false); }
    var opened = 0;
    for (var i = 0; i < items.length; i++) {
      var w = window.open(items[i].url, "_blank");
      if (!w) break;
      try { w.opener = null; } catch (e) {}
      opened++;
    }
    if (opened === items.length) { toast("Opened " + opened + " tabs"); return; }
    pendingOpen = { items: items.slice(opened), label: label };
    modal('<h3>Your browser blocked the pop-ups</h3><p class="muted">Opened ' + opened + " of " + items.length + ". Allow pop-ups for this site once, then tap Open all again:</p>" +
      '<ul class="steps small"><li><b>Chrome / Edge:</b> click the blocked-pop-up icon at the right of the address bar → “Always allow pop-ups and redirects”.</li><li><b>Safari (Mac):</b> Safari → Settings → Websites → Pop-up Windows → set this site to “Allow”.</li><li><b>Firefox:</b> click “Options” in the yellow bar → “Allow pop-ups”.</li></ul>' +
      '<p class="small muted">Or open them one at a time with the stepper (always works).</p><div class="row"><button class="btn" data-act="close">Close</button><button class="btn" data-act="stepper">Use stepper</button><button class="btn primary" data-act="retry">Try again</button></div>');
  }
  function stepper(items, label) {
    var i = 0;
    function draw() {
      var pct = Math.round(i / items.length * 100);
      modal('<h3>' + esc(label) + "</h3><p class=\"muted small\">Phones only allow one new tab per tap. Tap <b>Open next</b>, check the results, come back, repeat.</p>" +
        '<div class="progress"><i style="width:' + pct + '%"></i></div><p class="small"><b>' + i + "</b> of " + items.length + " opened</p>" +
        '<div class="row" style="justify-content:stretch"><button class="btn primary block" data-act="next" ' + (i >= items.length ? "disabled" : "") + ">" + (i >= items.length ? "All done ✓" : "Open next: " + esc(items[i].name)) + "</button></div>" +
        '<div class="link-list">' + items.map(function (it, k) { return '<a href="' + esc(it.url) + '" target="_blank" rel="noopener" class="' + (k < i ? "done" : "") + '" data-k="' + k + '"><span>' + esc(it.name) + "</span><span class=\"muted\">↗</span></a>"; }).join("") + "</div>" +
        '<div class="row"><button class="btn" data-act="close">Close</button></div>');
      var nb = $('[data-act="next"]', $("#modal"));
      if (nb) nb.onclick = function () { var w = window.open(items[i].url, "_blank"); if (w) { try { w.opener = null; } catch (e) {} } i++; draw(); };
      $$(".link-list a", $("#modal")).forEach(function (a) { a.addEventListener("click", function () { i = Math.max(i, +a.dataset.k + 1); setTimeout(draw, 50); }); });
    }
    draw();
  }

  /* ---------- data helpers ---------- */
  var W = function () { return store.get("window", defaultWindow()); };
  function defaultWindow() { var n = londonNow(), d = n.getDay(); var y = new Date(n); y.setDate(y.getDate() - 1); return (d === 1 || HOL[ymd(y)]) ? "3" : "1"; }
  var CORE = { primary: ["linkedin", "indeed", "reed"], backup: ["linkedin", "indeed"] };
  function roleItems(role, w, only) {
    return role.links.filter(function (l) { return !only || only.indexOf(l.p) > -1; }).map(function (l) {
      return { name: role.label + " · " + ((A.platforms[l.p] || {}).name || l.p), url: l.u[w] || l.u["7"] };
    });
  }
  function tierItems(tier, w) { var out = []; A.roles.filter(function (r) { return r.tier === tier; }).forEach(function (r) { out = out.concat(roleItems(r, w, CORE[tier])); }); return out; }
  function segWindow(w) { return '<div class="seg" role="group" aria-label="Posted within">' + [["1", "24 h"], ["3", "3 days"], ["7", "7 days"]].map(function (x) { return '<button data-win="' + x[0] + '" aria-pressed="' + (w === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>"; }
  var JOBS = null;
  function loadJobs() { if (JOBS) return Promise.resolve(JOBS); return fetch("data/jobs.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { JOBS = j; return j; }).catch(function () { JOBS = { jobs: [], sources: {}, filters: [], error: true }; return JOBS; }); }
  function ago(iso) { if (!iso) return "date not given"; var d = (Date.now() - new Date(iso).getTime()) / 36e5; if (d < 1) return "just now"; if (d < 24) return Math.round(d) + " h ago"; var n = Math.round(d / 24); return n + (n === 1 ? " day ago" : " days ago"); }

  /* ---------- tracker ---------- */
  var COLS = ["ID", "Date found", "Date applied", "Company", "Role", "Track", "Source", "Job URL", "Location / hybrid", "Salary", "Sponsorship (Y/N/?)", "Fit (1-5)", "CV version", "Cover letter (Y/N)", "Deliverable", "Contact name", "Contact role", "Contact link / email", "Outreach due", "Outreach sent", "Follow-up 1 due", "Follow-up sent", "Status", "Next action", "Notes"];
  var STATUSES = ["Found", "Tailoring", "Applied", "Outreach sent", "Followed up", "Interview", "Offer", "Rejected", "Closed"];
  var T = { all: function () { return store.get("tracker.v1", []); }, save: function (r) { store.set("tracker.v1", r); } };
  function nextId(rows) { var m = 0; rows.forEach(function (r) { var n = parseInt(String(r["ID"]).replace(/\D/g, ""), 10); if (n > m) m = n; }); return "A" + String(m + 1).padStart(3, "0"); }
  function withDue(r) {
    if (r["Date applied"]) { var p = plan(parseYmd(r["Date applied"])); r["Outreach due"] = ymd(p.out) + " 08:30"; r["Follow-up 1 due"] = ymd(p.f1) + " 08:30"; }
    return r;
  }
  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return [COLS.join(",")].concat(rows.map(function (r) { return COLS.map(function (c) { return csvCell(r[c]); }).join(","); })).join("\n"); }
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) { var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    var head = rows.shift() || []; return rows.filter(function (r) { return r.some(function (x) { return x; }); }).map(function (r) { var o = {}; head.forEach(function (h, k) { o[h.trim()] = r[k] || ""; }); return o; });
  }

  /* ---------- views ---------- */
  var V = {};

  V.today = function () {
    var w = W(), now = londonNow(), key = "check." + ymd(now), done = store.get(key, []);
    var rows = T.all(), today = ymd(now);
    var dueOut = rows.filter(function (r) { return (r["Outreach due"] || "").slice(0, 10) <= today && r["Outreach due"] && !r["Outreach sent"]; }).length;
    var dueF = rows.filter(function (r) { return (r["Follow-up 1 due"] || "").slice(0, 10) <= today && r["Follow-up 1 due"] && !r["Follow-up sent"] && ["Interview", "Offer", "Rejected", "Closed"].indexOf(r.Status) < 0; }).length;
    var applied = rows.filter(function (r) { return r["Date applied"]; }).length;
    var pItems = tierItems("primary", w), bItems = tierItems("backup", w);
    var hol = HOL[today];
    var html = '<div class="grid dash"><div class="stack">' +
      '<section class="card hero"><div class="eyebrow" style="color:rgba(255,255,255,.7)">' + esc(fmt(now)) + (hol ? " · " + esc(hol) : "") + '</div><h2 style="margin:6px 0 4px">Good ' + (now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening") + ", Alekhya</h2>" +
      '<p class="muted">Fresh roles first, then the date-sorted searches. Apply to 2–3 roles with fit 4+, schedule tomorrow’s outreach for 08:30.</p>' +
      '<div style="margin:12px 0">' + segWindow(w) + '</div><div class="btn-row stretch"><button class="btn white" data-open="primary">Open all: Primary <span class="k">' + pItems.length + '</span></button><button class="btn light" data-open="backup">Open all: Backup <span class="k">' + bItems.length + "</span></button></div>" +
      '<p class="tiny muted" style="margin:10px 0 0">' + (isMobile() ? "On a phone this opens a one-tap-per-tab stepper." : "First time? Your browser may ask you to allow pop-ups.") + " Monday or after a bank holiday: use 3 days.</p></section>" +
      '<section class="card"><div class="section-title" style="margin-top:0"><h3>Today’s checklist</h3><span class="tag">' + done.length + "/" + A.checklist.length + "</span></div>" +
      A.checklist.map(function (c, i) { var on = done.indexOf(i) > -1; return '<label class="check' + (on ? " done" : "") + '"><input type="checkbox" data-check="' + i + '"' + (on ? " checked" : "") + "><span>" + esc(c) + "</span></label>"; }).join("") + "</section></div>" +
      '<div class="stack"><section class="card"><h3>At a glance</h3><div class="stats" style="margin-top:12px"><div class="stat"><b id="freshCount">…</b><span>fresh jobs</span></div><div class="stat"><b>' + dueOut + '</b><span>outreach due</span></div><div class="stat"><b>' + dueF + "</b><span>follow-ups due</span></div></div>" +
      '<hr><div class="btn-row stretch"><a class="btn" href="#/fresh">Fresh jobs</a><a class="btn" href="#/tracker">Tracker (' + applied + " applied)</a></div></section>" +
      calcCard() + fluxCard() + "</div></div>";
    return html;
  };
  V.today.after = function () {
    loadJobs().then(function (j) { var e = $("#freshCount"); if (e) e.textContent = j.count != null ? j.count : (j.jobs || []).length; });
    wireCalc();
  };

  function calcCard() {
    return '<section class="card" id="calc"><h3>Outreach timing</h3><p class="sub">Next UK working day, 08:00–09:00. Skips weekends and England &amp; Wales bank holidays.</p>' +
      '<label class="f" for="appliedOn">Date applied</label><input class="input" type="date" id="appliedOn" value="' + ymd(londonNow()) + '"><label class="f" for="calcRole">Company · role (optional)</label><input class="input" id="calcRole" placeholder="e.g. Monzo · Salesforce BA"><div class="calc-out" id="calcOut"></div></section>';
  }
  function wireCalc() {
    var inp = $("#appliedOn"); if (!inp) return;
    function draw() {
      if (!document.body.contains(inp) || !inp.value) return; var p = plan(parseYmd(inp.value)), who = $("#calcRole").value.trim() || "application";
      $("#calcOut").innerHTML = '<div><div class="eyebrow">Send outreach</div><div class="calc-big">' + esc(fmt(p.out)) + " · 08:30</div><div class=\"tiny muted\">Schedule it the evening before (Gmail/Outlook “Schedule send”). Window 08:00–09:00 UK time.</div></div>" +
        '<div class="timeline"><div><span>Follow-up 1 (+7 working days)</span><b>' + esc(fmt(p.f1)) + '</b></div><div><span>Close the loop (+14)</span><b>' + esc(fmt(p.f2)) + "</b></div></div>" +
        '<div class="btn-row"><a class="btn sm primary" target="_blank" rel="noopener" href="' + esc(gcal("Outreach: " + who, p.out, "Send the next-day outreach email (08:00–09:00).")) + '">Google Calendar</a><button class="btn sm" data-ics="1">Download .ics</button></div>';
      var b = $("[data-ics]", $("#calcOut")); b.onclick = function () { download("outreach-" + ymd(p.out) + ".ics", ics("Outreach: " + who, p.out, "Send the next-day outreach email (08:00-09:00)."), "text/calendar"); };
    }
    inp.addEventListener("input", draw); $("#calcRole").addEventListener("input", draw); draw();
    setTimeout(draw, 800); // re-run once official bank holidays have loaded
  }
  function fluxCard() {
    return '<section class="card flux"><div class="dot">F</div><div><div class="eyebrow">Coming soon</div><h3>Flux Career</h3><p class="sub" style="margin-bottom:8px">A career platform in development that brings this whole workflow (fresh roles, tailoring, outreach timing and tracking) into one place. This page will link to it when it opens.</p>' +
      (C.FLUX_URL ? '<a class="btn sm primary" href="' + esc(C.FLUX_URL) + '" target="_blank" rel="noopener">Open Flux Career</a>' : '<span class="tag blue">In development</span>') + "</div></section>";
  }

  V.fresh = function () {
    return '<div class="page-head"><div class="eyebrow">Refreshed every weekday ~06:15 UK</div><h2>Fresh jobs</h2><p>Filtered for Alekhya: target titles only, full-time permanent, London + about 20 miles, recently posted, deduplicated.</p></div><div id="freshBody"><div class="card empty">Loading…</div></div>';
  };
  V.fresh.after = function () {
    loadJobs().then(function (j) {
      var jobs = j.jobs || [], src = j.sources || {}, active = Object.keys(src).filter(function (k) { return /^ok/.test(src[k]); });
      var inactive = Object.keys(src).filter(function (k) { return /inactive/.test(src[k]); });
      var upd = j.generated_at ? new Date(j.generated_at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " UK" : "not yet";
      var html = (inactive.length && inactive.some(function (k) { return !/optional/.test(src[k]); }) ? '<div class="banner"><span>⚠︎</span><span><b>Job-board feeds are not switched on yet.</b> Only company careers pages are being checked. Adzuna and Reed start once their free API keys are added (see Toolkit → Fresh jobs setup).</span></div>' : "") +
        '<div class="card"><div class="role-head"><div><h3>' + jobs.length + " job" + (jobs.length === 1 ? "" : "s") + '</h3><div class="sub">Updated ' + esc(upd) + " · last " + esc(j.max_days || 3) + ' days</div></div><button class="btn sm" id="showSrc">Sources &amp; filters</button></div>' +
        (jobs.length ? '<div class="searchbar" style="margin-top:12px"><span class="muted">⌕</span><input id="jobQ" placeholder="Filter by title or company" aria-label="Filter jobs"></div>' : "") + "</div>" +
        '<div id="jobList" class="stack" style="margin-top:12px"></div>';
      $("#freshBody").innerHTML = html;
      function draw(q) {
        q = (q || "").toLowerCase();
        var list = jobs.filter(function (x) { return !q || (x.title + " " + x.company).toLowerCase().indexOf(q) > -1; });
        $("#jobList").innerHTML = list.length ? list.map(function (x, k) {
          var sal = x.salary_text || (x.salary_min ? "£" + Math.round(x.salary_min).toLocaleString("en-GB") + (x.salary_max && x.salary_max !== x.salary_min ? "–£" + Math.round(x.salary_max).toLocaleString("en-GB") : "") : "");
          return '<article class="card job"><div class="role-head"><h4>' + esc(x.title) + '</h4><span class="tag ' + (/ago|now/.test(ago(x.posted)) && (Date.now() - new Date(x.posted)) < 864e5 ? "ok" : "") + '">' + esc(ago(x.posted)) + '</span></div><div class="meta"><span><b>' + esc(x.company) + "</b></span><span>" + esc(x.location || "London") + "</span>" + (sal ? "<span>" + esc(sal) + "</span>" : "") + "</div>" +
            '<div class="chips"><span class="tag blue">' + esc(x.source) + "</span>" + (x.also_on || []).map(function (s) { return '<span class="tag">also on ' + esc(s) + "</span>"; }).join("") + (x.role ? '<span class="tag">' + esc(x.role) + "</span>" : "") + "</div>" +
            '<div class="btn-row" style="margin-top:6px"><a class="btn sm primary" href="' + esc(x.url) + '" target="_blank" rel="noopener">Open advert ↗</a><button class="btn sm" data-addjob="' + jobs.indexOf(x) + '">+ Tracker</button></div></article>';
        }).join("") : '<div class="card empty"><div class="big">🌤</div><p><b>' + (jobs.length ? "No matches for that filter." : "No new matching roles in the last " + (j.max_days || 3) + " days.") + "</b></p><p class=\"small\">" + (active.length <= 1 ? "Only company careers pages are live right now, so this list is short until the job-board keys are added." : "Nothing slipped through: filters are strict on purpose.") + ' Use the date-sorted searches meanwhile.</p><a class="btn primary" href="#/today">Open all: Primary</a></div>';
        $$("[data-addjob]").forEach(function (b) { b.onclick = function () { var x = jobs[+b.dataset.addjob], rows = T.all(); rows.unshift({ "ID": nextId(rows), "Date found": ymd(londonNow()), "Company": x.company, "Role": x.title, "Source": x.source, "Job URL": x.url, "Location / hybrid": x.location, "Salary": x.salary_text || "", "Status": "Found", "Next action": "Score fit" }); T.save(rows); toast("Added to Tracker"); }; });
      }
      draw();
      var q = $("#jobQ"); if (q) q.addEventListener("input", function () { draw(q.value); });
      $("#showSrc").onclick = function () {
        modal("<h3>Sources &amp; filters</h3>" + Object.keys(src).map(function (k) { var s = src[k]; return '<div class="source-row"><span>' + esc(k) + '</span><span class="tag ' + (/^ok/.test(s) ? "ok" : /optional/.test(s) ? "" : "warn") + '">' + esc(s.replace(/^inactive( \(optional\))?: /, "needs key: ").replace(/^ok /, "")) + "</span></div>"; }).join("") +
          '<h3 style="margin-top:16px">Filters applied</h3><ul class="steps small">' + (j.filters || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
          (j.excluded ? '<p class="small muted">Screened out this run: ' + Object.keys(j.excluded).map(function (k) { return esc(k) + " " + j.excluded[k]; }).join(" · ") + ' (of ' + esc(j.raw_count) + " checked).</p>" : "") + '<div class="row"><button class="btn primary" data-act="close">Done</button></div>');
      };
    });
  };

  V.roles = function () {
    var w = W(), tier = store.get("tier", "primary");
    var list = A.roles.filter(function (r) { return r.tier === tier; });
    return '<div class="page-head"><div class="eyebrow">' + A.roles.length + " roles · " + Object.keys(A.platforms).length + ' sources · newest first</div><h2>Roles &amp; hot links</h2><p>Every link is pre-filtered to London (+~20 miles), full-time where the site allows it, and sorted by date.</p></div>' +
      '<div class="btn-row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><div class="seg" role="group" aria-label="Role tier"><button data-tier="primary" aria-pressed="' + (tier === "primary") + '">Primary</button><button data-tier="backup" aria-pressed="' + (tier === "backup") + '">Backup</button></div>' + segWindow(w) + "</div>" +
      '<div class="grid two">' + list.map(function (r) {
        var items = roleItems(r, w);
        return '<article class="card"><div class="role-head"><div><span class="tag ' + (r.tier === "primary" ? "blue" : "") + '">' + esc(r.id) + "</span><h3 style=\"margin-top:6px\">" + esc(r.label) + '</h3></div></div><div class="role-meta"><div><span class="lbl">Pay</span><span>' + esc(r.salary) + '</span></div><div><span class="lbl">Fit</span><span>' + esc(r.fit) + '</span></div><div><span class="lbl">Gap</span><span class="muted">' + esc(r.gap) + "</span></div></div>" +
          '<div class="prompt-mini"><code class="tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.boolean) + "</code>" + copyBtn(r.boolean, "Search string copied") + "</div>" +
          '<div class="chips platform-chips">' + r.links.map(function (l) { return '<a class="chip" href="' + esc(l.u[w] || l.u["7"]) + '" target="_blank" rel="noopener">' + esc((A.platforms[l.p] || {}).name || l.p) + '<span class="ext">↗</span></a>'; }).join("") + "</div>" +
          '<button class="btn primary block" data-openrole="' + esc(r.id) + '">Open all ' + items.length + " for this role</button></article>";
      }).join("") + "</div>";
  };

  V.process = function () {
    var pr = {}; A.prompts.forEach(function (p) { pr[p.id] = p; });
    var setup = pr.project;
    return '<div class="page-head"><div class="eyebrow">9 stages · one AI chat per application</div><h2>Application process</h2><p>Search → research → gap &amp; tailor → cover letter → deliverable → apply → outreach → follow-up. Tap a stage to open it.</p></div>' +
      (setup ? '<div class="card" style="margin-bottom:12px"><div class="role-head"><div><div class="eyebrow">Before you start · once</div><h3>' + esc(setup.title) + '</h3><div class="sub">' + esc(setup.attach) + "</div></div>" + copyBtn(setup.text, "Project instructions copied", "sm primary") + "</div></div>" : "") +
      '<div class="stack">' + A.stages.map(function (s, i) {
        return '<details class="card stage"' + (i === 0 ? " open" : "") + '><summary><span class="stage-n">' + s.n + '</span><span class="t"><b>' + esc(s.title) + '</b><span class="tiny muted">' + esc(s.time) + '</span></span><span class="chev">›</span></summary><div class="body"><div class="why">' + esc(s.why) + '</div><ol class="steps">' + s.steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" +
          (s.prompts || []).map(function (id) { var p = pr[id]; if (!p) return ""; return '<div class="prompt-mini"><div><b>' + esc(p.title) + '</b><div class="tiny muted">' + esc(p.attach || "") + "</div></div>" + copyBtn(p.text, "Prompt copied") + "</div>"; }).join("") +
          (/deliverable/i.test(s.title) ? '<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Employer type</th><th>What to send</th></tr></thead><tbody>' + A.matrix.map(function (m) { return "<tr><td>" + esc(m[0]) + "</td><td>" + esc(m[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
          (/outreach/i.test(s.title) ? '<p style="margin-top:10px"><a class="btn sm" href="#/outreach">Timing calculator &amp; 12 strategies</a></p>' : "") +
          "</div></details>";
      }).join("") + "</div>";
  };

  V.prompts = function () {
    var f = store.get("pfilter", "all"), stages = {}; A.stages.forEach(function (s) { stages[s.n] = s.title; }); stages[0] = "Setup";
    var used = []; A.prompts.forEach(function (p) { if (used.indexOf(String(p.stage)) < 0) used.push(String(p.stage)); });
    var list = A.prompts.filter(function (p) { return f === "all" || String(p.stage) === f; });
    return '<div class="page-head"><div class="eyebrow">' + A.prompts.length + ' prompts · paste into the application’s chat</div><h2>Prompts</h2><p>Replace anything in [square brackets]. The tailoring prompt comes in two versions: Hemanth’s exact Notion text, and Alekhya’s version with her facts built in (changes marked ⟦CHANGED⟧).</p></div>' +
      '<div class="chips scroll" style="margin-bottom:12px"><button class="chip' + (f === "all" ? " on" : "") + '" data-pf="all">All</button>' + used.map(function (n) { return '<button class="chip' + (f === n ? " on" : "") + '" data-pf="' + n + '">' + (n === "0" ? "Setup" : n + " · " + esc(stages[n] || "")) + "</button>"; }).join("") + "</div>" +
      '<div class="stack">' + list.map(function (p) {
        var body = esc(p.text).replace(/⟦CHANGED⟧/g, "<mark>⟦CHANGED⟧</mark>");
        return '<article class="card"><div class="role-head"><div><span class="tag">' + (String(p.stage) === "0" ? "Setup" : "Stage " + esc(p.stage)) + '</span><h3 style="margin-top:6px">' + esc(p.title) + "</h3></div>" + copyBtn(p.text, "Prompt copied", "sm primary") + "</div>" +
          (p.attach ? '<div class="note">' + esc(p.attach) + (p.output ? " · Output: " + esc(p.output) : "") + "</div>" : "") +
          '<details><summary class="small" style="cursor:pointer;color:var(--accent);font-weight:600;margin-top:6px">Show prompt (' + p.text.length.toLocaleString("en-GB") + " characters)</summary><pre class=\"prompt\">" + body + "</pre></details></article>";
      }).join("") + "</div>";
  };

  V.outreach = function () {
    return '<div class="page-head"><div class="eyebrow">Next working day · 08:00–09:00 UK</div><h2>Outreach</h2><p>Every application gets a short, specific email to the hiring manager the next working morning. Twelve ways to stand out, each with a template to copy.</p></div>' +
      '<div class="grid dash"><div class="stack">' + A.strategies.map(function (s, i) {
        return '<article class="card"><div class="role-head"><div><span class="tag blue">' + (i + 1) + '</span><h3 style="margin-top:6px">' + esc(s.t) + '</h3><div class="sub">' + esc(s.when) + "</div></div>" + copyBtn(s.tpl, "Template copied") + '</div><p class="small" style="margin-top:8px">' + esc(s.how) + '</p><details><summary class="small" style="cursor:pointer;color:var(--accent);font-weight:600">Show template</summary><pre class="prompt">' + esc(s.tpl) + "</pre></details></article>";
      }).join("") + '</div><div class="stack">' + calcCard() + '<section class="card"><h3>Guardrails</h3><ul class="steps small">' + A.guardrails.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul></section></div></div>";
  };
  V.outreach.after = wireCalc;

  V.tracker = function () {
    var rows = T.all(), f = store.get("tfilter", "Active");
    var act = function (r) { return ["Rejected", "Closed"].indexOf(r.Status) < 0; };
    var list = rows.filter(function (r) { return f === "All" ? true : f === "Active" ? act(r) : r.Status === f; });
    var today = ymd(londonNow());
    return '<div class="page-head"><div class="eyebrow">Saved in this browser only</div><h2>Tracker</h2><p>Add each role as you find it. Outreach and follow-up dates fill in from the date applied. Export to CSV any time, or use the Excel / Sheets / Notion templates.</p></div>' +
      '<div class="btn-row" style="margin-bottom:12px"><button class="btn primary" data-tadd="1">+ Add role</button><button class="btn" data-texport="1">Export CSV</button><label class="btn" style="cursor:pointer">Import CSV<input type="file" accept=".csv,text/csv" id="tImport" hidden></label></div>' +
      '<div class="chips scroll" style="margin-bottom:12px">' + ["Active", "All"].concat(STATUSES).map(function (s) { var n = rows.filter(function (r) { return s === "All" ? 1 : s === "Active" ? act(r) : r.Status === s; }).length; return '<button class="chip' + (f === s ? " on" : "") + '" data-tf="' + esc(s) + '">' + esc(s) + " · " + n + "</button>"; }).join("") + "</div>" +
      (list.length ? '<div class="stack">' + list.map(function (r) {
        var od = (r["Outreach due"] || "").slice(0, 10), fd = (r["Follow-up 1 due"] || "").slice(0, 10);
        var flag = od && !r["Outreach sent"] && od <= today ? '<span class="tag warn">Outreach due</span>' : fd && !r["Follow-up sent"] && fd <= today && act(r) ? '<span class="tag warn">Follow-up due</span>' : "";
        return '<article class="card"><div class="role-head"><div><div class="tiny muted">' + esc(r.ID) + (r["Fit (1-5)"] ? " · fit " + esc(r["Fit (1-5)"]) : "") + '</div><h3>' + esc(r.Role || "Untitled role") + '</h3><div class="sub">' + esc(r.Company || "") + (r["Location / hybrid"] ? " · " + esc(r["Location / hybrid"]) : "") + "</div></div>" + flag + "</div>" +
          '<dl class="kv" style="margin-top:10px">' + (r["Date applied"] ? "<dt>Applied</dt><dd>" + esc(fmt(parseYmd(r["Date applied"]))) + "</dd>" : "") + (od ? "<dt>Outreach</dt><dd>" + esc(fmt(parseYmd(od))) + " 08:30" + (r["Outreach sent"] ? " ✓" : "") + "</dd>" : "") + (fd ? "<dt>Follow-up</dt><dd>" + esc(fmt(parseYmd(fd))) + (r["Follow-up sent"] ? " ✓" : "") + "</dd>" : "") + (r["Next action"] ? "<dt>Next</dt><dd>" + esc(r["Next action"]) + "</dd>" : "") + "</dl>" +
          '<div class="btn-row" style="margin-top:10px;align-items:center"><select class="input" style="width:auto;min-height:38px;padding:6px 10px;font-size:14px" data-tstatus="' + esc(r.ID) + '" aria-label="Status">' + STATUSES.map(function (s) { return "<option" + (r.Status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
          (od && !r["Outreach sent"] ? '<button class="btn sm" data-tsent="' + esc(r.ID) + '">Outreach sent</button>' : fd && !r["Follow-up sent"] ? '<button class="btn sm" data-tfsent="' + esc(r.ID) + '">Follow-up sent</button>' : "") +
          '<button class="btn sm" data-tedit="' + esc(r.ID) + '">Edit</button>' + (r["Job URL"] ? '<a class="btn sm ghost" href="' + esc(r["Job URL"]) + '" target="_blank" rel="noopener">Advert ↗</a>' : "") + "</div></article>";
      }).join("") + "</div>" : '<div class="card empty"><div class="big">🗂</div><p><b>' + (rows.length ? "Nothing in this view." : "No roles yet.") + '</b></p><p class="small">Add roles from Fresh jobs, or tap “Add role”.</p></div>') +
      '<div class="section-title"><h3>Templates</h3></div><div class="grid three">' +
      [["Excel (formulas)", "downloads/job-tracker-template.xlsx", "Outreach and follow-up dates calculate themselves (WORKDAY + UK bank holidays). Opens in Google Sheets too."], ["CSV", "downloads/job-tracker-template.csv", "Same columns. Import into Google Sheets: File → Import → Upload."], ["Notion", "downloads/job-tracker-notion-import.csv", "In Notion: ··· → Import → CSV, then set Status to a Select property."]].map(function (t) { return '<div class="card"><h3>' + t[0] + '</h3><p class="sub">' + t[2] + '</p><a class="btn sm" href="' + t[1] + '" download>Download</a></div>'; }).join("") + "</div>";
  };
  function trackerForm(r) {
    r = r || {}; var isNew = !r.ID;
    var fields = [["Company", "text"], ["Role", "text"], ["Job URL", "url"], ["Location / hybrid", "text"], ["Salary", "text"], ["Source", "text"], ["Date found", "date"], ["Date applied", "date"], ["Fit (1-5)", "number"], ["CV version", "text"], ["Contact name", "text"], ["Contact role", "text"], ["Contact link / email", "text"], ["Next action", "text"]];
    modal("<h3>" + (isNew ? "Add role" : "Edit " + esc(r.ID)) + '</h3><form id="tForm"><div class="form-grid">' + fields.map(function (f) { return '<div><label class="f">' + esc(f[0]) + '</label><input class="input" name="' + esc(f[0]) + '" type="' + f[1] + '"' + (f[1] === "number" ? ' min="1" max="5"' : "") + ' value="' + esc(r[f[0]] || (f[0] === "Date found" && isNew ? ymd(londonNow()) : "")) + '"></div>'; }).join("") +
      '<div><label class="f">Status</label><select class="input" name="Status">' + STATUSES.map(function (s) { return "<option" + ((r.Status || "Found") === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div></div><label class="f">Notes</label><textarea class="input" name="Notes">' + esc(r.Notes || "") + "</textarea>" +
      '<div class="row">' + (isNew ? "" : '<button type="button" class="btn ghost" data-tdel="' + esc(r.ID) + '" style="margin-right:auto;color:var(--bad)">Delete</button>') + '<button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>');
    $("#tForm").onsubmit = function (e) {
      e.preventDefault(); var rows = T.all(), o = isNew ? { ID: nextId(rows) } : rows.filter(function (x) { return x.ID === r.ID; })[0];
      $$("#tForm [name]").forEach(function (el) { o[el.name] = el.value.trim(); });
      if (o["Date applied"] && o.Status === "Found") o.Status = "Applied";
      withDue(o); if (isNew) rows.unshift(o); T.save(rows); closeModal(); render(); toast("Saved");
    };
    var d = $("[data-tdel]", $("#modal")); if (d) d.onclick = function () { if (confirm("Delete this role from the tracker?")) { T.save(T.all().filter(function (x) { return x.ID !== r.ID; })); closeModal(); render(); } };
  }
  V.tracker.after = function () {
    var imp = $("#tImport"); if (imp) imp.onchange = function () { var f = imp.files[0]; if (!f) return; f.text().then(function (t) { var add = parseCSV(t).filter(function (r) { return r.Company || r.Role; }); var rows = T.all(), ids = rows.map(function (r) { return r.ID; }); add.forEach(function (r) { if (!r.ID || ids.indexOf(r.ID) > -1) r.ID = nextId(rows); rows.push(r); ids.push(r.ID); }); T.save(rows); toast("Imported " + add.length); render(); }); };
  };

  V.cv = function () {
    var v = store.get("cvv", "a"), full = C.SHOW_CONTACT;
    var base = "cv/Alekhya_Bheema_CV_" + (v === "a" ? "Salesforce_BA_Consultant" : "Project_Coordinator_PMO") + "_" + (full ? "full" : "no-contact");
    return '<div class="page-head"><div class="eyebrow">A4 · 2 pages · ATS-safe</div><h2>' + esc(C.NAME || "Alekhya Bheema") + '</h2><p>Two versions of the same truthful CV. Pick the one that matches the advert, then tailor it in that application’s chat.</p></div>' +
      '<div class="card"><div class="seg" role="group" aria-label="CV version" style="margin-bottom:12px"><button data-cvv="a" aria-pressed="' + (v === "a") + '">Salesforce BA / Consultant</button><button data-cvv="b" aria-pressed="' + (v === "b") + '">Project Coordinator / PMO</button></div>' +
      (full ? '<div class="contact-line"><a href="tel:' + esc((C.PHONE || "").replace(/\s/g, "")) + '">' + esc(C.PHONE) + '</a><a href="mailto:' + esc(C.EMAIL) + '">' + esc(C.EMAIL) + '</a><a href="' + esc(C.LINKEDIN) + '" target="_blank" rel="noopener">LinkedIn ↗</a><span>London</span></div>' : '<div class="contact-line"><a href="' + esc(C.LINKEDIN) + '" target="_blank" rel="noopener">Contact via LinkedIn ↗</a><span>London</span></div>') +
      '<p class="small" style="margin:10px 0 0"><span class="tag ok">Right to work</span> UK Graduate visa: full right to work in the UK, no sponsorship required.</p>' +
      '<div class="btn-row" style="margin-top:14px"><a class="btn primary" href="' + base + '.pdf" download>Download PDF</a><a class="btn" href="' + base + '.docx" download>Download Word</a><button class="btn" data-share="1">Share link</button></div></div>' +
      '<div class="cv-pages"><img src="' + base + '-1.png" alt="CV page 1" loading="lazy" width="910" height="1287"><img src="' + base + '-2.png" alt="CV page 2" loading="lazy" width="910" height="1287"></div>';
  };

  V.linkedin = function () {
    var L = A.linkedin;
    var block = function (t, body, cp) { return '<section class="card"><div class="role-head"><h3>' + t + "</h3>" + (cp ? copyBtn(cp, t + " copied") : "") + "</div>" + body + "</section>"; };
    return '<div class="page-head"><div class="eyebrow">Profile rewrite · facts from her CV only</div><h2>LinkedIn</h2><p>Recruiters search LinkedIn by title, skills and location. These changes make her findable for the five primary roles. Work top to bottom.</p></div><div class="stack">' +
      block("Audit: now vs target", '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Section</th><th>Now</th><th>Change to</th></tr></thead><tbody>' + L.score.map(function (r) { return "<tr><td><b>" + esc(r[0]) + "</b></td><td class=\"muted\">" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>") +
      block("Do it in this order", '<ol class="steps">' + L.order.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>") +
      block("Headline options (pick one)", L.headlines.map(function (h) { return '<div class="prompt-mini"><span class="small">' + esc(h) + "</span>" + copyBtn(h, "Headline copied") + "</div>"; }).join("")) +
      block("About", '<pre class="prompt" style="font-family:var(--font);font-size:14px">' + esc(L.about) + "</pre>", L.about) +
      block("Experience descriptions", L.experience.map(function (e) { return '<div class="prompt-mini" style="align-items:flex-start"><div><b>' + esc(e[0]) + '</b><pre class="prompt" style="font-family:var(--font);font-size:13px;max-height:200px">' + esc(e[1]) + "</pre></div>" + copyBtn(e[1], "Description copied") + "</div>"; }).join("")) +
      block("Skills", '<p class="small muted">Pin these five as Top skills:</p><div class="chips">' + L.top.map(function (s) { return '<span class="chip on">' + esc(s) + "</span>"; }).join("") + '</div><p class="small muted" style="margin-top:12px">Then add:</p><div class="chips">' + L.skills.map(function (s) { return '<span class="chip">' + esc(s) + "</span>"; }).join("") + "</div>", L.top.concat(L.skills).join(", ")) +
      block("Rename certifications", '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Shown now</th><th>Current Salesforce name</th><th>Renamed</th></tr></thead><tbody>' + L.certs.map(function (c) { return '<tr><td class="muted">' + esc(c[0]) + "</td><td><b>" + esc(c[1]) + "</b></td><td>" + esc(c[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>") +
      block("Featured", '<ul class="steps">' + L.featured.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>") +
      block("Post ideas (one a week)", '<ul class="steps">' + L.posts.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>") + "</div>";
  };

  V.toolkit = function () {
    var links = function (arr) { return arr.map(function (x) { return '<div class="source-row"><a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + esc(x[0]) + " ↗</a>" + (x[2] ? '<span class="muted small" style="text-align:right">' + esc(x[2]) + "</span>" : "") + "</div>"; }).join(""); };
    return '<div class="page-head"><div class="eyebrow">Setup, tools and people</div><h2>Toolkit</h2><p>How to keep the AI organised, where to find the hidden market, and the downloads.</p></div><div class="grid two" style="align-items:start"><div class="stack">' +
      '<section class="card"><h3>AI hygiene</h3><p class="sub">One Project, one chat per application, everything downloaded and tracked.</p><ol class="steps">' + A.hygiene.map(function (h) { return "<li><b>" + esc(h[0]) + ".</b> " + esc(h[1]) + "</li>"; }).join("") + "</ol></section>" +
      A.tools.map(function (g) { return '<section class="card"><h3>' + esc(g.g) + "</h3>" + links(g.items) + "</section>"; }).join("") + '</div><div class="stack">' +
      '<section class="card"><h3>Downloads</h3>' + [["Job tracker (Excel, formulas)", "downloads/job-tracker-template.xlsx"], ["Job tracker (CSV)", "downloads/job-tracker-template.csv"], ["Job tracker (Notion import)", "downloads/job-tracker-notion-import.csv"]].map(function (d) { return '<div class="source-row"><span>' + d[0] + '</span><a class="btn sm" href="' + d[1] + '" download>Download</a></div>'; }).join("") + "</section>" +
      '<section class="card"><h3>Communities</h3>' + links(A.communities) + "</section>" +
      '<section class="card"><h3>Salesforce recruiters</h3>' + links(A.recruiters) + "</section>" +
      '<section class="card"><h3>Partners hiring in London</h3>' + A.partners.map(function (p) { return '<div class="source-row"><b>' + esc(p[0]) + '</b><span class="muted small" style="text-align:right">' + esc(p[1]) + "</span></div>"; }).join("") + "</section>" +
      '<section class="card" id="setup"><h3>Fresh jobs setup</h3><p class="sub">The list refreshes itself every weekday morning via GitHub Actions. Job-board feeds need free API keys, added once as repository secrets:</p><ul class="steps small"><li><b>Adzuna</b>: ADZUNA_APP_ID and ADZUNA_APP_KEY (developer.adzuna.com)</li><li><b>Reed</b>: REED_API_KEY (reed.co.uk/developers/jobseeker)</li><li><b>Jooble</b> (optional): JOOBLE_API_KEY</li></ul><p class="small muted">Company careers pages (Monzo, Wise, Octopus Energy and others) work without keys.</p></section>' +
      fluxCard() + "</div></div>";
  };

  /* ---------- router ---------- */
  function route() { var h = location.hash.replace(/^#\/?/, "").split("?")[0]; return TITLE[h] ? h : "today"; }
  function nav() {
    var r = route(), groups = [["Daily", ["today", "fresh", "roles"]], ["Apply", ["process", "prompts", "outreach", "tracker"]], ["Profile", ["cv", "linkedin", "toolkit"]]];
    $("#sidenav").innerHTML = groups.map(function (g) { return '<div class="grp">' + g[0] + "</div>" + g[1].map(function (k) { return '<a href="#/' + k + '"' + (k === r ? ' aria-current="page"' : "") + ">" + ico(k) + esc(TITLE[k]) + "</a>"; }).join(""); }).join("");
    var more = ["prompts", "outreach", "tracker", "cv", "linkedin", "toolkit"].indexOf(r) > -1;
    $("#bottomnav").innerHTML = [["today", "Today"], ["fresh", "Fresh"], ["roles", "Roles"], ["process", "Process"]].map(function (x) { return '<a href="#/' + x[0] + '"' + (x[0] === r ? ' aria-current="page"' : "") + ">" + ico(x[0]) + x[1] + "</a>"; }).join("") +
      '<button id="moreBtn"' + (more ? ' aria-current="page"' : "") + ' aria-haspopup="dialog">' + ico("more") + (more ? esc(TITLE[r].split(" ")[0]) : "More") + "</button>";
    $("#moreBtn").onclick = openSheet;
  }
  function render() {
    var r = route(); COPY = []; closeSheet();
    $("#pagetitle").textContent = TITLE[r]; document.title = TITLE[r] + " · Alekhya · London Job Search";
    $("#view").innerHTML = V[r](); nav(); if (V[r].after) V[r].after();
  }
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });

  /* ---------- delegated events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-copy],[data-open],[data-openrole],[data-win],[data-tier],[data-pf],[data-tf],[data-tadd],[data-tedit],[data-texport],[data-tsent],[data-tfsent],[data-cvv],[data-share],[data-act]");
    if (!t) return; var d = t.dataset;
    if (d.copy != null) return copy(COPY[+d.copy], d.label);
    if (d.open) { var w = W(); return openAll(tierItems(d.open, w), "Open all: " + (d.open === "primary" ? "Primary" : "Backup")); }
    if (d.openrole) { var role = A.roles.filter(function (r) { return r.id === d.openrole; })[0]; return openAll(roleItems(role, W()), role.label); }
    if (d.win) { store.set("window", d.win); return render(); }
    if (d.tier) { store.set("tier", d.tier); return render(); }
    if (d.pf) { store.set("pfilter", d.pf); return render(); }
    if (d.tf) { store.set("tfilter", d.tf); return render(); }
    if (d.tadd) return trackerForm();
    if (d.tedit) return trackerForm(T.all().filter(function (r) { return r.ID === d.tedit; })[0]);
    if (d.texport) return download("alekhya-job-tracker-" + ymd(londonNow()) + ".csv", "\ufeff" + toCSV(T.all()), "text/csv");
    if (d.tsent || d.tfsent) { var rows = T.all(); rows.forEach(function (r) { if (r.ID === (d.tsent || d.tfsent)) { if (d.tsent) { r["Outreach sent"] = ymd(londonNow()); r.Status = "Outreach sent"; r["Next action"] = "Follow up " + (r["Follow-up 1 due"] || "").slice(0, 10); } else { r["Follow-up sent"] = ymd(londonNow()); r.Status = "Followed up"; } } }); T.save(rows); toast("Updated"); return render(); }
    if (d.cvv) { store.set("cvv", d.cvv); return render(); }
    if (d.share) { var url = (C.SITE_URL || location.href.split("#")[0]) + "#/cv"; if (navigator.share) navigator.share({ title: (C.NAME || "") + " · CV", url: url }).catch(function () {}); else copy(url, "Link copied"); return; }
    if (d.act === "close") return closeModal();
    if (d.act === "retry" && pendingOpen) { var p = pendingOpen; pendingOpen = null; closeModal(); return openAll(p.items, p.label); }
    if (d.act === "stepper" && pendingOpen) { var q = pendingOpen; pendingOpen = null; return stepper(q.items, q.label); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.check != null) { var k = "check." + ymd(londonNow()), d = store.get(k, []), i = +t.dataset.check; d = t.checked ? d.concat([i]) : d.filter(function (x) { return x !== i; }); store.set(k, d); t.closest(".check").classList.toggle("done", t.checked); var tag = t.closest(".card").querySelector(".tag"); if (tag) tag.textContent = d.length + "/" + A.checklist.length; }
    if (t.dataset.tstatus) { var rows = T.all(); rows.forEach(function (r) { if (r.ID === t.dataset.tstatus) r.Status = t.value; }); T.save(rows); toast("Status: " + t.value); render(); }
  });
  $("#modalBackdrop").addEventListener("click", function (e) { if (e.target.id === "modalBackdrop") closeModal(); });
  $("#sheetBackdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeSheet(); } });

  /* ---------- theme ---------- */
  var th = store.get("theme", null) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  var setTheme = function (x) { document.documentElement.dataset.theme = x; store.set("theme", x); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = x === "dark" ? "#0b1220" : "#0f2a44"; };
  setTheme(th); $("#themeBtn").onclick = function () { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); };

  render();
})();
