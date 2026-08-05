/* Shared core for both sheets (index.html and runway.html).

   Everything here is either a primitive both pages need or - more importantly -
   an ANALYTICAL rule that must not differ between them: the observation window,
   which tenures count, which era or cabinet a date falls in. Those same rules
   live in pipeline/build.py and analysis/tenure_trends.R, all three reading
   data/eras.json, and this file exists so the two sheets cannot be the place
   they drift apart.

   Language: pages own their own state, but call ML.setLang() before rendering so
   the formatters here agree with the page chrome. */
window.ML = (function () {
  "use strict";
  const DATA = window.MINISTERS_DATA;
  // data.js is 335 KB and can genuinely fail to arrive. Bail out to null rather
  // than throw: the constants below reach into DATA.meta at module scope, so
  // without this a dropped request blanks the page with a stack trace instead of
  // tripping the `if (!DATA || !window.ML) return` guard each sheet already has.
  if (!DATA) {
    console.error("viz: data.js did not load; nothing to render");
    return null;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  const MS_DAY = 86400000;
  const YEAR_DAYS = 365.25;

  let lang = "uk";
  const setLang = (l) => { lang = l === "en" ? "en" : "uk"; };
  const getLang = () => lang;
  const uk = () => lang === "uk";

  // Strings needed by the formatters and the tooltip below, which both sheets
  // share. Page-specific copy stays in the page's own script.
  const S = {
    uk: {
      ongoing: "триває", acting: "в.о.", actingPart: "частково в.о.",
      era: "Президент", cabinet: "Уряд",
      spells: "перепризначення", hint: "Клік — стаття у Вікіпедії",
    },
    en: {
      ongoing: "ongoing", acting: "acting", actingPart: "partly acting",
      era: "President", cabinet: "Cabinet",
      spells: "reappointment(s)", hint: "Click — Wikipedia article",
    },
  };
  const str = (k) => S[lang][k];

  // ------------------------------------------------------------- primitives
  const $ = (s) => document.querySelector(s);
  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function svgel(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  const D = (s) => new Date(s + "T00:00:00");
  function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }

  // ------------------------------------------------------------- formatters
  function fmtDate(s) {
    if (!s) return str("ongoing");
    return D(s).toLocaleDateString(uk() ? "uk-UA" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }
  function fmtDur(days) {
    const y = Math.floor(days / YEAR_DAYS);
    const m = Math.round((days - y * YEAR_DAYS) / 30.44);
    const yTxt = uk()
      ? (y % 10 === 1 && y % 100 !== 11 ? "рік" : y % 10 >= 2 && y % 10 <= 4 && (y % 100 < 12 || y % 100 > 14) ? "роки" : "років")
      : (y === 1 ? "yr" : "yrs");
    const mTxt = uk() ? "міс." : "mo";
    if (days < 45) return `${days} ${uk() ? "дн." : "d"}`;
    if (y === 0) return `${Math.max(1, m)} ${mTxt}`;
    if (m === 0 || m === 12) return `${m === 12 ? y + 1 : y} ${yTxt}`;
    return `${y} ${yTxt} ${m} ${mTxt}`;
  }
  const fmtYears1 = (days) =>
    (days / YEAR_DAYS).toLocaleString(uk() ? "uk-UA" : "en-US", {
      minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + (uk() ? " р." : " y");

  const nameOf = (x) => (uk() ? x.name_uk || x.name_en : x.name_en || x.name_uk);
  // Source names mix "Surname Given Patronymic" with "Given Surname". For chart
  // labels drop the patronymic so annotations stay short; tooltips and tables
  // keep the full form.
  const shortName = (x) => {
    const parts = nameOf(x).split(/\s+/);
    if (parts.length < 3) return nameOf(x);
    const kept = parts.filter(
      (p) => !/(ович|евич|євич|йович|івна|ївна|овна|евна)$/i.test(p)
    );
    return (kept.length >= 2 ? kept : parts).slice(0, 2).join(" ");
  };
  const lnameOf = (l) => (uk() ? l.name_uk : l.name_en);
  function wikiUrl(ten) {
    const title = uk() ? ten.ukwiki || ten.enwiki : ten.enwiki || ten.ukwiki;
    if (!title) return null;
    const host = title === ten.ukwiki && ten.ukwiki ? "uk.wikipedia.org" : "en.wikipedia.org";
    return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  }

  // -------------------------------------------------------- eras & window
  // The era in force is the one whose start is the latest not after the date.
  // Matching start-and-end and returning the first hit put anyone appointed
  // exactly on a transition date into the OUTGOING era - which showed Avakov,
  // appointed 22 Feb 2014, in Yanukovych's colour.
  function latestBefore(list, dateStr) {
    const d = D(dateStr);
    let hit = null;
    for (const item of list) if (D(item.start) <= d) hit = item;
    return hit;
  }
  // Presidencies are contiguous, so latest-start-before is the right rule there.
  const eraOf = (s) => latestBefore(DATA.eras.presidents, s) || DATA.eras.presidents[0];

  // Statistics stop at the July 2026 government change: ministers appointed then
  // had been in office about a week, and counting them drags every recent figure
  // down for no reason but when the data was collected. Read from the data, not
  // hardcoded - when this was a literal in three places the three disagreed.
  const WINDOW_END = D(
    DATA.meta.analysis_window_end || DATA.eras.analysis_window_end || DATA.meta.built
  );
  const UNKNOWABLE_BEFORE = new Date(WINDOW_END.getTime() - 365 * MS_DAY);

  // Cabinets are NOT contiguous - there are five inter-cabinet gaps of 11 to 30
  // days, all at the biggest reshuffles - so the cabinet in office is the one
  // whose term contains the date, and for a date inside a gap it is the next
  // cabinet formed: the government the minister actually served under. Under
  // latest-start-before, Avakov, appointed on the day of the 2014 handover, came
  // out under Azarov II, a government that had already fallen four weeks earlier.
  //
  // One rule for both jobs: the tooltip names this cabinet and the runway is
  // measured to its end, so the two cannot contradict each other on screen. Same
  // rule as runway_end() in analysis/tenure_trends.R.
  const cabsByStart = [...DATA.eras.cabinets].sort((a, b) => (a.start < b.start ? -1 : 1));
  const cabEnd = (c) => (c.end ? D(c.end) : WINDOW_END);
  function cabinetOf(dateStr) {
    const d = D(dateStr);
    for (const c of cabsByStart) if (D(c.start) <= d && d < cabEnd(c)) return c;
    for (const c of cabsByStart) if (D(c.start) > d) return c;
    return cabsByStart[cabsByStart.length - 1] || null;
  }
  function runwayEnd(startStr) {
    const c = cabinetOf(startStr);
    return c ? cabEnd(c) : null;
  }

  // Every ministerial tenure inside the window, with length measured to the
  // window's end. Matches `tenures` in analysis/tenure_trends.R (n = 415).
  function windowPool() {
    return DATA.tenures
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.lineage !== "pm" && D(x.start) < WINDOW_END)
      .map(({ x, i }) => {
        // <= not <: a tenure ending exactly on the cutoff has ended. Many did -
        // the cutoff IS a government change - and treating them as ongoing
        // wrongly dropped them as "unknowable" below.
        const ended = x.end && D(x.end) <= WINDOW_END;
        const endEff = ended ? D(x.end) : WINDOW_END;
        return {
          ...x, _idx: i,
          days: Math.max(1, Math.round((endEff - D(x.start)) / MS_DAY)),
          ongoing: !ended,
        };
      });
  }
  // The same pool minus tenures whose length is not yet knowable: still running
  // at the cutoff AND begun within the final year, so they could not have
  // reached a year even in principle. Matches `resolved` in the R script and the
  // stats block in pipeline/build.py, so all three report the same n (412).
  const resolvedPool = () =>
    windowPool().filter((x) => !(x.ongoing && D(x.start) > UNKNOWABLE_BEFORE));

  // ---------------------------------------------------------------- tooltip
  // One floating panel per page, created on first use against #tooltip.
  function makeTooltip() {
    const node = $("#tooltip");
    function move(ev) {
      const pad = 14;
      const r = node.getBoundingClientRect();
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
      node.style.left = x + "px";
      node.style.top = y + "px";
    }
    function show(ten, ev, extraLine) {
      node.textContent = "";
      const head = el("div", { class: "tt-head" });
      if (ten.image) {
        const img = el("img", {
          src: ten.image + (ten.image.includes("?") ? "&" : "?") + "width=88", alt: "",
        });
        img.onerror = () => img.remove();
        head.appendChild(img);
      }
      const hh = el("div");
      hh.appendChild(el("div", { class: "tt-name" }, nameOf(ten)));
      const lin = DATA.lineages.find((l) => l.id === ten.lineage);
      if (lin) hh.appendChild(el("div", { class: "tt-role" }, lnameOf(lin)));
      head.appendChild(hh);
      node.appendChild(head);

      const dates = el("div", { class: "tt-line" });
      dates.appendChild(el("strong", null, fmtDur(ten.days)));
      dates.appendChild(document.createTextNode(
        ` · ${fmtDate(ten.start)} — ${ten.end ? fmtDate(ten.end) : str("ongoing")}`));
      node.appendChild(dates);

      const cab = cabinetOf(ten.start), era = eraOf(ten.start);
      const info = el("div", { class: "tt-line" });
      info.textContent =
        `${str("era")}: ${uk() ? era.name_uk : era.name_en}` +
        (cab ? ` · ${str("cabinet")}: ${uk() ? cab.name_uk : cab.name_en}` : "");
      node.appendChild(info);

      // The runway sheet adds its own line here: how the tenure compares to the
      // life the appointing government had left.
      if (extraLine) node.appendChild(el("div", { class: "tt-line" }, extraLine));

      const badges = el("div");
      // Two different facts, and they were sharing one badge: `acting` means never
      // confirmed as minister, `has_acting_part` means only some of the spell was
      // acting. The runway sheet colours strictly by the first, so eleven ministers
      // showed a blue "confirmed" dot next to a badge reading "acting".
      if (ten.acting) badges.appendChild(el("span", { class: "badge" }, str("acting")));
      else if (ten.has_acting_part) badges.appendChild(el("span", { class: "badge" }, str("actingPart")));
      if (ten.ongoing) badges.appendChild(el("span", { class: "badge" }, str("ongoing")));
      if (ten.reappointments > 0)
        badges.appendChild(el("span", { class: "badge" }, `${ten.reappointments} ${str("spells")}`));
      if (badges.childNodes.length) node.appendChild(badges);

      if (wikiUrl(ten)) node.appendChild(el("div", { class: "tt-hint" }, str("hint")));
      node.style.display = "block";
      move(ev);
    }
    const hide = () => { node.style.display = "none"; };
    return { show, move, hide };
  }

  // Hover/focus/click wiring shared by every mark that represents a tenure.
  // `extra` optionally returns a string for the tooltip's extra line.
  function attachTenureEvents(tip, node, ten, idx, extra) {
    const line = () => (extra ? extra(ten) : null);
    node.addEventListener("pointerenter", (ev) => { tip.show(ten, ev, line()); crossHighlight(idx, true); });
    node.addEventListener("pointermove", tip.move);
    node.addEventListener("pointerleave", () => { tip.hide(); crossHighlight(idx, false); });
    node.addEventListener("focus", () => {
      const r = node.getBoundingClientRect();
      tip.show(ten, { clientX: r.left + r.width / 2, clientY: r.top }, line());
      crossHighlight(idx, true);
    });
    node.addEventListener("blur", () => { tip.hide(); crossHighlight(idx, false); });
    const url = wikiUrl(ten);
    if (url) {
      node.addEventListener("click", () => window.open(url, "_blank", "noopener"));
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open(url, "_blank", "noopener");
        }
      });
    }
  }
  function crossHighlight(idx, on) {
    document.querySelectorAll(`[data-idx="${idx}"]`).forEach((n) => n.classList.toggle("hl", on));
  }

  // -------------------------------------------------------------- prefs
  // Persisted so moving between the two sheets does not reset language or theme.
  // Wrapped because a browser with storage blocked would otherwise throw here and
  // take the whole page down with it.
  const KEY_LANG = "ml.lang", KEY_THEME = "ml.theme", KEY_EXCL = "ml.exclActing";
  function readPref(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function writePref(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }
  const loadLang = () => (readPref(KEY_LANG) === "en" ? "en" : "uk");
  const saveLang = (l) => writePref(KEY_LANG, l);
  // Whether never-confirmed acting officials count towards the statistics is one
  // analytical choice, and both sheets ask it - the hero and records on sheet 1,
  // the trend and the era medians on sheet 2. Shared so the two cannot show the
  // reader different answers to the same question.
  const loadExclActing = () => readPref(KEY_EXCL) === "1";
  const saveExclActing = (v) => writePref(KEY_EXCL, v ? "1" : "0");
  function applyStoredTheme() {
    const v = readPref(KEY_THEME);
    if (v === "dark" || v === "light") document.documentElement.setAttribute("data-theme", v);
  }
  const isDark = () => {
    const set = document.documentElement.getAttribute("data-theme");
    return set === "dark" || (!set && window.matchMedia("(prefers-color-scheme: dark)").matches);
  };
  function toggleTheme() {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    writePref(KEY_THEME, next);
    return next;
  }

  return {
    DATA, SVGNS, MS_DAY, YEAR_DAYS,
    setLang, getLang, uk, str,
    $, el, svgel, D, median,
    fmtDate, fmtDur, fmtYears1, nameOf, shortName, lnameOf, wikiUrl,
    latestBefore, eraOf, cabinetOf,
    WINDOW_END, UNKNOWABLE_BEFORE, windowPool, resolvedPool, runwayEnd,
    makeTooltip, attachTenureEvents, crossHighlight,
    loadLang, saveLang, loadExclActing, saveExclActing,
    applyStoredTheme, isDark, toggleTheme,
  };
})();
