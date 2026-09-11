/* Renderers for the intel pages. Each page sets window.INTEL (the whole
   intel_data.json) and a data-page attribute on <body>; this picks the right
   builder. Charts are inline SVG — no chart library, same as the queue page. */
(function () {
  "use strict";

  var D = window.INTEL || {};
  var SV = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8", "--s9"];
  var cvar = function (n) { return "var(" + n + ")"; };

  // ---------------------------------------------------------------- format
  function n0(v) { return v == null ? "—" : Math.round(v).toLocaleString("en-GB"); }
  function n1(v) { return v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("en-GB"); }
  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }
  function days(v) {
    if (v == null) return "—";
    if (v < 90) return v + " d";
    var y = v / 365;
    return y < 1 ? Math.round(v / 30.4) + " mo" : (Math.round(y * 10) / 10) + " yr";
  }
  function nok(v) { return v == null ? "—" : (Math.round(v * 1000) / 1000).toFixed(3); }
  function money(v) {
    if (v == null) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + " bn";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + " m";
    if (a >= 1e3) return (v / 1e3).toFixed(0) + " k";
    return String(v);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // --------------------------------------------------------------- tooltip
  var tip = document.getElementById("tip");
  function showTip(evt, html) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.opacity = 1;
    var r = tip.getBoundingClientRect();
    var x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.style.opacity = 0; }

  // ------------------------------------------------------------ svg helper
  function svg(w, h) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h);
    s.setAttribute("width", w);
    s.setAttribute("height", h);
    s.setAttribute("role", "img");
    return s;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) {
    var t = el("text", Object.assign({ x: x, y: y, "font-size": 10.5,
      "font-family": "var(--mono)", fill: "var(--muted)" }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }

  // ====================================================== survival curve ===
  function survivalChart(host, S) {
    var W = Math.max(560, host.clientWidth || 720), H = 320;
    var m = { t: 16, r: 96, b: 38, l: 46 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var curve = S.curve || [];
    if (!curve.length) return;
    var maxT = curve[curve.length - 1].t || 1;
    var x = function (t) { return m.l + (t / maxT) * iw; };
    var y = function (v) { return m.t + (1 - v) * ih; };

    var s = svg(W, H);
    s.setAttribute("aria-label", "Kaplan-Meier survival curve: share of cases still waiting for a reservation over time");

    // grid + y axis
    [0, .25, .5, .75, 1].forEach(function (v) {
      el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v),
        stroke: "var(--grid)", "stroke-width": 1 }, s);
      txt(s, m.l - 8, y(v) + 3.5, Math.round(v * 100) + "%", { "text-anchor": "end" });
    });
    // x ticks every year
    for (var t = 0; t <= maxT; t += 365) {
      el("line", { x1: x(t), x2: x(t), y1: m.t, y2: m.t + ih,
        stroke: "var(--grid)", "stroke-width": 1 }, s);
      txt(s, x(t), H - 16, t === 0 ? "0" : (t / 365) + " yr", { "text-anchor": "middle" });
    }

    // Greenwood band as a step polygon
    var up = [], dn = [], prev = null;
    curve.forEach(function (p) {
      if (prev !== null) { up.push([x(p.t), y(prev.hi)]); dn.push([x(p.t), y(prev.lo)]); }
      up.push([x(p.t), y(p.hi)]); dn.push([x(p.t), y(p.lo)]);
      prev = p;
    });
    el("polygon", { points: up.concat(dn.reverse()).map(function (q) { return q.join(","); }).join(" "),
      fill: cvar("--s1"), opacity: .13 }, s);

    // step line
    var d = "", pv = null;
    curve.forEach(function (p) {
      if (pv === null) { d = "M" + x(p.t) + "," + y(p.s); }
      else { d += " L" + x(p.t) + "," + y(pv.s) + " L" + x(p.t) + "," + y(p.s); }
      pv = p;
    });
    el("path", { d: d, fill: "none", stroke: cvar("--s1"), "stroke-width": 2,
      "stroke-linejoin": "round" }, s);

    // median guide
    var med = S.median || {};
    if (med.reached) {
      el("line", { x1: m.l, x2: x(med.t), y1: y(.5), y2: y(.5), stroke: "var(--ink-2)",
        "stroke-width": 1, "stroke-dasharray": "3 3" }, s);
      el("line", { x1: x(med.t), x2: x(med.t), y1: y(.5), y2: m.t + ih,
        stroke: "var(--ink-2)", "stroke-width": 1, "stroke-dasharray": "3 3" }, s);
    }

    // the watched case
    var w = S.watch || {};
    if (w.elapsed != null && w.survival_at_elapsed != null) {
      var wx = x(w.elapsed), wy = y(w.survival_at_elapsed);
      el("line", { x1: wx, x2: wx, y1: m.t, y2: m.t + ih, stroke: "var(--watch)",
        "stroke-width": 1.5, "stroke-dasharray": "2 3" }, s);
      el("circle", { cx: wx, cy: wy, r: 6, fill: cvar("--s1"),
        stroke: "var(--surface)", "stroke-width": 2 }, s);
      txt(s, Math.min(wx + 10, m.l + iw - 4), wy - 11, "Lefdal " + w.elapsed + " d",
        { fill: "var(--ink)", "font-size": 11, "font-weight": 600 });
    }

    // direct label at the curve end (single series: no legend box)
    var last = curve[curve.length - 1];
    txt(s, x(last.t) + 8, y(last.s) + 4, pct(last.s) + " still waiting",
      { fill: "var(--ink-2)", "font-size": 11 });

    // hover
    var hov = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent",
      "pointer-events": "all" }, s);
    var cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--axis)",
      "stroke-width": 1, opacity: 0 }, s);
    hov.addEventListener("mousemove", function (e) {
      var pt = s.getBoundingClientRect();
      var rel = (e.clientX - pt.left) / pt.width * W;
      var tt = Math.max(0, Math.min(maxT, (rel - m.l) / iw * maxT));
      var at = curve[0];
      for (var i = 0; i < curve.length; i++) if (curve[i].t <= tt) at = curve[i];
      cross.setAttribute("x1", x(at.t)); cross.setAttribute("x2", x(at.t));
      cross.setAttribute("opacity", 1);
      showTip(e, "<b>" + days(at.t) + " after joining the queue</b>" +
        '<div class="row"><i style="background:' + cvar("--s1") + '"></i>' +
        "still waiting <b>" + pct(at.s) + "</b></div>" +
        '<div class="row">95% band <b>' + pct(at.lo) + "–" + pct(at.hi) + "</b></div>" +
        '<div class="row">cases still at risk <b>' + at.at_risk + "</b></div>");
    });
    hov.addEventListener("mouseleave", function () {
      cross.setAttribute("opacity", 0); hideTip();
    });

    host.innerHTML = "";
    host.appendChild(s);
  }

  // ================================================== horizontal bar rows ===
  function barRows(host, rows, opts) {
    opts = opts || {};
    var keys = opts.keys || ["value"];
    var colors = opts.colors || [cvar("--neutral")];
    var W = Math.max(520, host.clientWidth || 700);
    var rowH = 26, labelW = opts.labelW || 190, padR = 74;
    var H = rows.length * rowH + 26;
    var iw = W - labelW - padR;
    var max = 0;
    rows.forEach(function (r) {
      var tot = 0; keys.forEach(function (k) { tot += (r[k] || 0); });
      if (tot > max) max = tot;
    });
    max = max || 1;

    var s = svg(W, H);
    s.setAttribute("aria-label", opts.label || "bar chart");
    rows.forEach(function (r, i) {
      var yy = i * rowH + 6, xx = labelW, tot = 0;
      var nameFill = r.watch ? "var(--ink)" : "var(--ink-2)";
      var nm = txt(s, labelW - 10, yy + 13, r.key, {
        "text-anchor": "end", "font-family": "var(--sans)", "font-size": 11.5,
        fill: nameFill, "font-weight": r.watch ? 600 : 400
      });
      nm.textContent = r.key.length > 28 ? r.key.slice(0, 27) + "…" : r.key;

      keys.forEach(function (k, ki) {
        var v = r[k] || 0;
        if (v <= 0) return;
        var w = (v / max) * iw;
        tot += v;
        // 2px surface gap between adjacent segments; rounded outer end only
        el("rect", { x: xx, y: yy + 3, width: Math.max(1, w - 2), height: 15,
          rx: ki === keys.length - 1 ? 4 : 0, fill: colors[ki],
          "data-k": r.key, "data-s": k, "data-v": v }, s).addEventListener(
          "mousemove", function (e) {
            showTip(e, "<b>" + esc(r.key) + "</b>" +
              '<div class="row"><i style="background:' + colors[ki] + '"></i>' +
              esc(opts.names ? opts.names[ki] : k) + " <b>" + n1(v) + " MW</b></div>" +
              (r.areas ? '<div class="row">areas <b>' + r.areas.join(", ") + "</b></div>" : "") +
              (r.n ? '<div class="row">cases <b>' + r.n + "</b></div>" : ""));
          });
        xx += w;
      });
      txt(s, xx + 8, yy + 15, n0(tot) + " MW", {
        fill: r.watch ? "var(--ink)" : "var(--muted)", "font-weight": r.watch ? 600 : 400
      });
      if (r.watch) {
        el("rect", { x: 0, y: yy, width: 3, height: 21, fill: "var(--watch)", rx: 1.5 }, s);
      }
    });
    s.addEventListener("mouseleave", hideTip);
    host.innerHTML = "";
    host.appendChild(s);
  }

  // ========================================================= line series ===
  function linesChart(host, labels, series, opts) {
    opts = opts || {};
    var W = Math.max(560, host.clientWidth || 720), H = opts.height || 280;
    var m = { t: 14, r: 58, b: 34, l: 50 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var vals = [];
    series.forEach(function (s) { s.points.forEach(function (p) { if (p != null) vals.push(p); }); });
    if (!vals.length) { host.innerHTML = '<p class="caveat">No price data cached yet.</p>'; return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (opts.zeroBase) lo = Math.min(0, lo);
    var pad = (hi - lo) * .12 || .1;
    lo -= pad; hi += pad;
    var x = function (i) { return m.l + (labels.length < 2 ? iw / 2 : (i / (labels.length - 1)) * iw); };
    var y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * ih; };

    var s = svg(W, H);
    s.setAttribute("aria-label", opts.label || "line chart");
    for (var g = 0; g <= 4; g++) {
      var v = lo + (hi - lo) * g / 4;
      el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: "var(--grid)",
        "stroke-width": 1 }, s);
      txt(s, m.l - 8, y(v) + 3.5, opts.fmtY ? opts.fmtY(v) : nok(v), { "text-anchor": "end" });
    }
    labels.forEach(function (l, i) {
      if (labels.length > 14 && i % Math.ceil(labels.length / 8) !== 0 && i !== labels.length - 1) return;
      txt(s, x(i), H - 14, l, { "text-anchor": "middle" });
    });

    series.forEach(function (ser, si) {
      var col = cvar(SV[si % SV.length]);
      var d = "", started = false;
      ser.points.forEach(function (p, i) {
        if (p == null) { started = false; return; }
        d += (started ? " L" : " M") + x(i) + "," + y(p);
        started = true;
      });
      el("path", { d: d, fill: "none", stroke: col, "stroke-width": ser.watch ? 2.5 : 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
        opacity: ser.watch ? 1 : .85 }, s);
      // direct label at series end (<=4 series: always direct-labelled)
      var lastI = -1;
      ser.points.forEach(function (p, i) { if (p != null) lastI = i; });
      if (lastI >= 0 && series.length <= 5) {
        txt(s, x(lastI) + 7, y(ser.points[lastI]) + 3.5, ser.key, {
          fill: "var(--ink-2)", "font-size": 11, "font-weight": ser.watch ? 600 : 500
        });
      }
    });

    var hov = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent",
      "pointer-events": "all" }, s);
    var cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--axis)", "stroke-width": 1, opacity: 0 }, s);
    hov.addEventListener("mousemove", function (e) {
      var pt = s.getBoundingClientRect();
      var rel = (e.clientX - pt.left) / pt.width * W;
      var i = Math.round((rel - m.l) / iw * (labels.length - 1));
      i = Math.max(0, Math.min(labels.length - 1, i));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      cross.setAttribute("opacity", 1);
      var h = "<b>" + labels[i] + "</b>";
      series.forEach(function (ser, si) {
        if (ser.points[i] == null) return;
        h += '<div class="row"><i style="background:' + cvar(SV[si % SV.length]) + '"></i>' +
          esc(ser.key) + " <b>" + (opts.fmtV ? opts.fmtV(ser.points[i]) : nok(ser.points[i])) + "</b></div>";
      });
      showTip(e, h);
    });
    hov.addEventListener("mouseleave", function () { cross.setAttribute("opacity", 0); hideTip(); });
    host.innerHTML = "";
    host.appendChild(s);
  }

  // ================================================== diverging spread =====
  function spreadChart(host, spread) {
    if (!spread || !spread.length) { host.innerHTML = '<p class="caveat">Not enough history yet.</p>'; return; }
    var W = Math.max(560, host.clientWidth || 720), H = 210;
    var m = { t: 14, r: 16, b: 34, l: 54 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var vs = spread.map(function (d) { return d.diff; });
    var mx = Math.max.apply(null, vs.map(Math.abs)) || .1;
    var y = function (v) { return m.t + (1 - (v + mx) / (2 * mx)) * ih; };
    var bw = Math.max(2, iw / spread.length - 2);

    var s = svg(W, H);
    s.setAttribute("aria-label", "NO3 spot price minus the mean of the other price areas, by month");
    [mx, 0, -mx].forEach(function (v) {
      el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v),
        stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, s);
      txt(s, m.l - 8, y(v) + 3.5, (v > 0 ? "+" : "") + nok(v), { "text-anchor": "end" });
    });
    spread.forEach(function (p, i) {
      var xx = m.l + (i / spread.length) * iw;
      var top = p.diff >= 0 ? y(p.diff) : y(0);
      var h = Math.abs(y(p.diff) - y(0));
      el("rect", { x: xx, y: top, width: bw, height: Math.max(1, h), rx: 2,
        fill: p.diff >= 0 ? cvar("--s2") : cvar("--s1") }, s)
        .addEventListener("mousemove", function (e) {
          showTip(e, "<b>" + p.m + "</b>" +
            '<div class="row">NO3 vs other areas <b>' + (p.diff > 0 ? "+" : "") +
            nok(p.diff) + " NOK/kWh</b></div>" +
            '<div class="row">' + (p.diff < 0 ? "NO3 cheaper" : "NO3 dearer") + "</div>");
        });
      if (i % Math.ceil(spread.length / 8) === 0 || i === spread.length - 1) {
        txt(s, xx + bw / 2, H - 14, p.m.slice(2), { "text-anchor": "middle" });
      }
    });
    s.addEventListener("mouseleave", hideTip);
    host.innerHTML = "";
    host.appendChild(s);
  }

  // ======================================================== table helper ===
  function table(host, cols, rows) {
    var h = '<div class="tablewrap"><table><thead><tr>';
    cols.forEach(function (c) {
      h += '<th class="' + (c.num ? "num" : "") + '">' + esc(c.label) + "</th>";
    });
    h += "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += '<tr class="' + (r.__watch ? "hit" : "") + '">';
      cols.forEach(function (c) {
        h += '<td class="' + (c.num ? "num" : (c.mono ? "mono" : "")) + '">' +
          (c.render ? c.render(r) : esc(r[c.key])) + "</td>";
      });
      h += "</tr>";
    });
    host.innerHTML = h + "</tbody></table></div>";
  }

  // ============================================================== pages ====
  var PAGES = {};

  PAGES.pipeline = function () {
    var S = D.sector || {};
    var wa = S.watch_area || {}, T = S.totals || {};
    set("kpis", [
      [n0(T.queued) + " MW", "Datacenter capacity queued", T.cases + " cases"],
      [n0(T.reserved) + " MW", "Already reserved", "held ahead of the queue"],
      [n0(S.developer_count), "Named developers", "with queued or reserved MW"],
      [n0(wa.competing_mw) + " MW", "Competing in " + wa.area, wa.competitors + " other developers"],
    ]);
    barRows(byId("devs"), (S.developers || []).slice(0, 20),
      { keys: ["queued", "reserved"], colors: [cvar("--s1"), cvar("--s3")],
        names: ["In capacity queue", "Reserved"], labelW: 200,
        label: "Datacenter developers by queued and reserved MW" });
    legend("devlegend", [["In capacity queue", cvar("--s1")], ["Reserved", cvar("--s3")]]);
    barRows(byId("areas"), S.areas || [],
      { keys: ["queued", "reserved"], colors: [cvar("--s1"), cvar("--s3")],
        names: ["In capacity queue", "Reserved"], labelW: 70,
        label: "Datacenter MW by price area" });
    legend("arealegend", [["In capacity queue", cvar("--s1")], ["Reserved", cvar("--s3")]]);
    table(byId("devtable"),
      [{ label: "Developer", key: "key" },
       { label: "Queued MW", key: "queued", num: true, render: function (r) { return n1(r.queued); } },
       { label: "Reserved MW", key: "reserved", num: true, render: function (r) { return n1(r.reserved); } },
       { label: "Cases", key: "n", num: true },
       { label: "Areas", key: "areas", render: function (r) { return esc(r.areas.join(", ")); } }],
      (S.developers || []).map(function (r) { r.__watch = r.watch; return r; }));
  };

  PAGES.odds = function () {
    var S = D.survival || {};
    var med = S.median || {}, w = S.watch || {};
    set("kpis", [
      [med.reached ? days(med.t) : "> " + days(med.floor), "Median wait to reservation",
       med.reached ? "only " + med.at_risk + " cases still at risk here" : "curve never reaches 50%"],
      [pct(S.s_1y), "Still waiting after 1 year", "of " + S.n + " cases"],
      [pct(S.s_2y), "Still waiting after 2 years", ""],
      [days(S.naive_median), "Naive median", "converted cases only — biased"],
    ]);
    fill("figs",
      '<div class="fig dim">' + days(S.naive_median) +
        "<small>Naive median (biased)</small></div>" +
      '<div class="fig">' + (med.reached ? days(med.t) : "> " + days(med.floor)) +
        "<small>Censored median</small></div>" +
      '<div class="fig">' + pct(S.censor_rate) +
        "<small>Cases still waiting</small></div>" +
      '<div class="fig">' + S.observed + " of " + S.n +
        "<small>Actually reached a reservation</small></div>");
    survivalChart(byId("km"), S);
    var segs = (S.segments || []).filter(function (x) { return x.kind === "area"; });
    table(byId("segarea"),
      [{ label: "Price area", key: "key" },
       { label: "Cases", key: "n", num: true },
       { label: "Converted", key: "observed", num: true },
       { label: "Still waiting @1yr", key: "s_1y", num: true, render: function (r) { return pct(r.s_1y); } },
       { label: "Still waiting @2yr", key: "s_2y", num: true, render: function (r) { return pct(r.s_2y); } },
       { label: "Median", key: "median", num: true, render: function (r) {
           return r.reached ? days(r.median) + ' <span class="pill">n=' + r.median_at_risk + "</span>"
                            : "&gt; " + days(r.floor); } }],
      segs.map(function (r) { r.__watch = r.watch; return r; }));
    var secs = (S.segments || []).filter(function (x) { return x.kind === "sector"; });
    table(byId("segsector"),
      [{ label: "Sector", key: "key" },
       { label: "Cases", key: "n", num: true },
       { label: "Converted", key: "observed", num: true },
       { label: "Still waiting @1yr", key: "s_1y", num: true, render: function (r) { return pct(r.s_1y); } },
       { label: "Median", key: "median", num: true, render: function (r) {
           return r.reached ? days(r.median) + ' <span class="pill">n=' + r.median_at_risk + "</span>"
                            : "&gt; " + days(r.floor); } }],
      secs.map(function (r) { r.__watch = r.watch; return r; }));
    fill("watchline", w.elapsed == null ? "No queued watch case found." :
      "Lefdal's queued case <b>" + esc(w.case) + "</b> has been in the capacity queue <b>" +
      w.elapsed + " days</b>. At that point on the all-case curve <b>" +
      pct(w.survival_at_elapsed) + "</b> were still waiting, estimated with <b>" +
      w.at_risk_at_elapsed + "</b> cases still at risk — a well-populated part of " +
      "the curve, and an unremarkable position on it rather than a stalled one.");
  };

  PAGES.counterparties = function () {
    var C = D.companies || {};
    var rows = C.companies || [];
    var watch = rows.filter(function (r) { return r.watch; })[0];
    set("kpis", [
      [watch ? money(watch.revenue) : "—", "Lefdal revenue (NOK)",
       watch && watch.year ? "FY" + watch.year : ""],
      [watch ? money(watch.equity) : "—", "Lefdal equity (NOK)", ""],
      [n0(rows.length), "Companies resolved", "Lefdal + datacenter peers"],
      [n0((C.unresolved || []).length), "Unresolved names", "shown below, not guessed"],
    ]);
    table(byId("cotable"),
      [{ label: "Company", key: "name" },
       { label: "Org no.", key: "org", mono: true },
       { label: "FY", key: "year", mono: true },
       { label: "Revenue", key: "revenue", num: true, render: function (r) { return money(r.revenue); } },
       { label: "EBIT", key: "ebit", num: true, render: function (r) { return money(r.ebit); } },
       { label: "Result", key: "profit", num: true, render: function (r) { return money(r.profit); } },
       { label: "Equity", key: "equity", num: true, render: function (r) { return money(r.equity); } },
       { label: "Debt", key: "debt", num: true, render: function (r) { return money(r.debt); } },
       { label: "Staff", key: "employees", num: true },
       { label: "Status", key: "distress", render: function (r) {
           return r.distress ? '<span class="pill bad">distress</span>'
                             : '<span class="pill ok">active</span>'; } }],
      rows.map(function (r) { r.__watch = r.watch; return r; }));
    var un = C.unresolved || [];
    if (un.length) {
      table(byId("untable"),
        [{ label: "Statnett end customer", key: "name" },
         { label: "Queued MW", key: "mw", num: true, render: function (r) { return n1(r.mw); } },
         { label: "Why unresolved", key: "why", mono: true }], un);
    }
  };

  PAGES.power = function () {
    var P = D.prices || {};
    var no3 = (P.series || []).filter(function (s) { return s.key === "NO3"; })[0];
    var last = P.spread && P.spread.length ? P.spread[P.spread.length - 1].diff : null;
    set("kpis", [
      [nok(P.no3_latest), "NO3 spot, NOK/kWh", P.latest_month || ""],
      [last == null ? "—" : (last > 0 ? "+" : "") + nok(last), "NO3 vs other areas",
       last == null ? "" : (last < 0 ? "NO3 cheaper" : "NO3 dearer")],
      [n0(P.days_cached), "Area-days cached", "day-ahead, hourly mean"],
      [n0((P.months || []).length), "Months of history", ""],
    ]);
    linesChart(byId("prices"), P.months || [], P.series || [],
      { label: "Monthly mean day-ahead price by price area", height: 300 });
    legend("pricelegend", (P.series || []).map(function (s, i) {
      return [s.key, cvar(SV[i % SV.length])];
    }));
    spreadChart(byId("spread"), P.spread || []);
    table(byId("pricetable"),
      [{ label: "Month", key: "m", mono: true }].concat((P.series || []).map(function (s, i) {
        return { label: s.key, key: s.key, num: true,
                 render: function (r) { return nok(r[s.key]); } };
      })),
      (P.months || []).map(function (m, i) {
        var row = { m: m };
        (P.series || []).forEach(function (s) { row[s.key] = s.points[i]; });
        return row;
      }));
    var M = D.manual || {};
    var items = M.items || [];
    table(byId("manual"),
      [{ label: "Topic", key: "topic" },
       { label: "Why it matters", key: "why" },
       { label: "Status", key: "status", render: function (r) {
           return '<span class="pill warnp">' + esc(r.status) + "</span>"; } },
       { label: "Last checked", key: "last_checked", mono: true,
         render: function (r) { return esc(r.last_checked || "never"); } },
       { label: "Source", key: "url", render: function (r) {
           return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">open</a>'; } }],
      items);
  };

  // ------------------------------------------------------------- plumbing
  function byId(id) { return document.getElementById(id); }
  function fill(id, html) { var e = byId(id); if (e) e.innerHTML = html; }
  function set(id, items) {
    var e = byId(id);
    if (!e) return;
    e.innerHTML = items.map(function (it) {
      return '<div class="kpi"><div class="n">' + it[0] + '</div><div class="l">' +
        esc(it[1]) + '</div><div class="s">' + esc(it[2] || "") + "</div></div>";
    }).join("");
  }
  function legend(id, pairs) {
    var e = byId(id);
    if (!e) return;
    e.innerHTML = pairs.map(function (p) {
      return '<span><i style="background:' + p[1] + '"></i>' + esc(p[0]) + "</span>";
    }).join("");
  }

  function boot() {
    var page = document.body.getAttribute("data-page");
    var stamp = byId("stamp");
    if (stamp && D.fetched_utc) {
      var dt = new Date(D.fetched_utc);
      stamp.innerHTML = "<b>Snapshot</b> " + dt.toLocaleDateString("en-GB",
        { day: "numeric", month: "short", year: "numeric" }) + "<br>" +
        "Statnett · BRREG · spot";
    }
    if (PAGES[page]) PAGES[page]();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(boot, 180);
  });
})();
