/* Ukraine ministers tenure, sheet 1 — the timeline, the headline answer, the
   records and the full table. The charts that plot individual ministers against
   one another live on sheet 2 (runway.html).
   Vanilla JS + SVG. Data comes from data.js (window.MINISTERS_DATA), shared
   helpers and every analytical rule from common.js (window.ML). */
(function () {
  "use strict";
  const DATA = window.MINISTERS_DATA;
  if (!DATA || !window.ML) return;

  const {
    YEAR_DAYS, el, svgel, D, median,
    fmtDate, fmtDur, fmtYears1, nameOf, lnameOf,
    eraOf, resolvedPool,
    makeTooltip, attachTenureEvents: bindTenure, crossHighlight,
  } = window.ML;
  const T0 = new Date(DATA.meta.independence + "T00:00:00");
  const T1 = new Date(DATA.meta.built + "T00:00:00");

  const state = {
    lang: ML.loadLang(),
    colorBy: "era", // 'era' | 'duration'
    exclActing: ML.loadExclActing(),
  };
  ML.applyStoredTheme();

  // ---------------------------------------------------------------- i18n
  const STR = {
    uk: {
      title: "Життєвий цикл українського міністра",
      subtitle:
        "Кожен голова міністерства та прем'єр-міністр із часів незалежності — хто, де і як довго тримався в кріслі. Наведіть курсор на будь-який сегмент.",
      langBtn: "EN",
      themeLight: "Світла",
      themeDark: "Темна",
      colorLabel: "Колір:",
      colorEra: "Президентська ера",
      colorDur: "Тривалість каденції",
      exclActing: "Не враховувати в.о. у статистиці",
      timelineTitle: "Хто керував кожним міністерством, 1991 — сьогодні",
      timelineCap:
        "Кожен прямокутник — одна безперервна каденція. Напівпрозорі — виконувачі обов'язків (в.о.). Клік відкриває Вікіпедію.",
      recordsTitle: "Рекорди",
      recLongest: "Найдовша каденція",
      recShortest: "Найкоротша каденція",
      recReturns: "Найбільше повернень у те саме крісло",
      recMulti: "Найбільше різних портфелів",
      toRunway: "Аналіз каденцій →",
      tableSummary: "Показати всі дані таблицею",
      tableNote: (cut, built) =>
        `Стовпець «Днів» — тривалість до ${cut}, як і в усій статистиці. Зірочка* — міністри, призначені після цієї дати: для них показано днів на ${built}.`,
      thName: "Міністр", thMinistry: "Міністерство", thStart: "Початок",
      thEnd: "Кінець", thDays: "Днів", thActing: "в.о.",
      ongoing: "триває",
      acting: "в.о.",
      actingLegend: "в.о. (виконувач обов'язків)",
      durLegend: ["до 6 міс.", "6–12 міс.", "1–2 роки", "2–4 роки", "4+ роки"],
      tooltipCabinet: "Уряд",
      tooltipEra: "Президент",
      tooltipSpells: "перепризначення",
      tooltipHint: "Клік — стаття у Вікіпедії",
      defunctMark: "(ліквідовано)",
      today: "сьогодні",
      medianNow: "медіана зараз",
      yesShorter: (a, b, pct) =>
        `Так. Медіанна каденція міністра впала з ${a} до ${b} — мінус ${pct}%.`,
      noSame: (a, b) =>
        `Не дуже: медіанна каденція майже не змінилася (${a} → ${b}).`,
      noLonger: (a, b, pct) =>
        `Ні, навпаки: медіанна каденція зросла з ${a} до ${b} (+${pct}%).`,
      heroCapPrefix: "призначені у",
      heroNote: (cut) =>
        `Порівнюються міністри, призначені до Помаранчевої революції, з призначеними після Євромайдану. Медіана враховує і в.о.; для тих, хто був на посаді на момент зміни уряду, тривалість рахується до ${cut} — це нижня межа. Прем'єр-міністри в статистику не входять. Перемикач вище дозволяє прибрати в.о.`,
      credit: "Графіка: Валентин Гацко, TG: @gorbach_squad.",
      repo: "Дані, код і метод: github.com/velgaks/ministers-lifetime",
      footer: (cut, built) =>
        `Джерело: Wikidata (твердження про посади P39) та Українська Вікіпедія (списки міністрів); усі виправлення з посиланнями на джерела — у data/patches.json. Статистика завершується зміною уряду ${cut}: міністри, призначені тоді, пробули на посаді близько тижня. Ранні галузеві міністерства 1990-х (машинобудування, зв'язку тощо) не охоплені. Каденції, що почалися до 24.08.1991, обрізані на дату незалежності. Дані зібрано ${built}.`,
      years: (y) => {
        const yi = Math.floor(y);
        const f = yi % 10, ff = yi % 100;
        if (f === 1 && ff !== 11) return `${yi} рік`;
        if (f >= 2 && f <= 4 && (ff < 12 || ff > 14)) return `${yi} роки`;
        return `${yi} років`;
      },
    },
    en: {
      title: "The Lifetime of a Ukrainian Minister",
      subtitle:
        "Every ministry head and prime minister since independence — who, where, and how long they lasted. Hover any segment.",
      langBtn: "УКР",
      themeLight: "Light",
      themeDark: "Dark",
      colorLabel: "Color:",
      colorEra: "Presidential era",
      colorDur: "Tenure length",
      exclActing: "Exclude acting ministers from stats",
      timelineTitle: "Who ran each ministry, 1991 — today",
      timelineCap:
        "Each rectangle is one continuous tenure. Translucent = acting ministers. Click opens Wikipedia.",
      recordsTitle: "Records",
      recLongest: "Longest tenure",
      recShortest: "Shortest tenure",
      recReturns: "Most returns to the same chair",
      recMulti: "Most different portfolios",
      toRunway: "Tenure analysis →",
      tableSummary: "Show all data as a table",
      tableNote: (cut, built) =>
        `The Days column measures to ${cut}, as every statistic here does. An asterisk* marks ministers appointed after that date, showing days as of ${built} instead.`,
      thName: "Minister", thMinistry: "Ministry", thStart: "Start",
      thEnd: "End", thDays: "Days", thActing: "acting",
      ongoing: "ongoing",
      acting: "acting",
      actingLegend: "acting minister",
      durLegend: ["under 6 months", "6–12 months", "1–2 years", "2–4 years", "4+ years"],
      tooltipCabinet: "Cabinet",
      tooltipEra: "President",
      tooltipSpells: "reappointment(s)",
      tooltipHint: "Click — Wikipedia article",
      defunctMark: "(dissolved)",
      today: "today",
      medianNow: "median now",
      yesShorter: (a, b, pct) =>
        `Yes. The median minister's tenure fell from ${a} to ${b} — down ${pct}%.`,
      noSame: (a, b) =>
        `Not really: the median tenure barely changed (${a} → ${b}).`,
      noLonger: (a, b, pct) =>
        `No — the opposite: the median tenure grew from ${a} to ${b} (+${pct}%).`,
      heroCapPrefix: "appointed",
      heroNote: (cut) =>
        `Compares ministers appointed before the Orange Revolution with those appointed after Euromaidan. The median includes acting ministers; anyone still in office at the government change is counted to ${cut}, a lower bound. Prime ministers are excluded. Use the toggle above to drop acting ministers.`,
      credit: "Chart: Valentyn Hatsko, TG: @gorbach_squad.",
      repo: "Data, code and method: github.com/velgaks/ministers-lifetime",
      footer: (cut, built) =>
        `Source: Wikidata (P39 officeholder statements) and Ukrainian Wikipedia minister lists; every correction is recorded with its source in data/patches.json. Statistics end at the government change of ${cut} — ministers appointed then had been in office about a week. Early-1990s branch ministries (machine-building, communications, etc.) are not covered. Tenures that began before 24 Aug 1991 are clipped at independence. Data collected ${built}.`,
      years: (y) => {
        const yi = Math.floor(y);
        return yi === 1 ? "1 year" : `${yi} years`;
      },
    },
  };
  const t = (k) => STR[state.lang][k];

  // ------------------------------------------------------------- helpers
  const $ = (s) => document.querySelector(s);
  // Same boundaries as the distribution charts in analysis/tenure_trends.R, so
  // one quantity is binned one way across the whole project.
  function durBucket(days) {
    const y = days / YEAR_DAYS;
    return y < 0.5 ? 0 : y < 1 ? 1 : y < 2 ? 2 : y < 4 ? 3 : 4;
  }
  function fillClass(ten) {
    return state.colorBy === "era"
      ? "f-" + eraOf(ten.start).id
      : "f-dur-" + durBucket(ten.days);
  }
  // The observation window, the pool rules, the formatters and the era lookups
  // all live in common.js so this sheet and the runway sheet cannot disagree.
  // `resolvedPool` drops tenures whose length is not yet knowable - still running
  // at the cutoff and begun within the final year. The timeline below still draws
  // every tenure; only the numbers use this pool.
  const statsPool = () =>
    resolvedPool().filter((x) => !(state.exclActing && x.acting));

  // ------------------------------------------------------------- tooltip
  const tip = makeTooltip();
  const attachTenureEvents = (node, ten, idx) => bindTenure(tip, node, ten, idx);

  // ------------------------------------------------------------ timeline
  function renderTimeline() {
    const host = $("#timeline-host");
    host.textContent = "";
    const gutter = 240;
    const width = Math.max(1160, host.parentElement.clientWidth - 4);
    const plotW = width - gutter - 20;
    const rowH = 26, barH = 18;
    const topPad = 46, bottomPad = 34;
    const lineages = [...DATA.lineages].sort((a, b) => a.order - b.order);
    const height = topPad + lineages.length * rowH + bottomPad;

    const x = (dateStr) => {
      const v = (D(dateStr) - T0) / (T1 - T0);
      return gutter + v * plotW;
    };

    const svg = svgel("svg", {
      width, height,
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": t("timelineTitle"),
    });

    // year gridlines (every 5y) + axis labels
    for (let y = 1995; y <= T1.getFullYear(); y += 5) {
      const xx = x(`${y}-01-01`);
      svg.appendChild(svgel("line", { x1: xx, x2: xx, y1: topPad - 6, y2: height - bottomPad, class: "gridline" }));
      const lbl = svgel("text", { x: xx, y: height - bottomPad + 16, class: "axis", "text-anchor": "middle" });
      lbl.textContent = y;
      svg.appendChild(lbl);
    }

    // presidential era boundaries + labels on top
    DATA.eras.presidents.forEach((p) => {
      const xs = x(p.start);
      if (p.start !== DATA.meta.independence)
        svg.appendChild(svgel("line", { x1: xs, x2: xs, y1: topPad - 24, y2: height - bottomPad, class: "erabound" }));
      const xe = p.end ? x(p.end) : gutter + plotW;
      const mid = (xs + xe) / 2;
      const lbl = svgel("text", { x: mid, y: topPad - 28, class: "eralabel", "text-anchor": "middle" });
      lbl.textContent = state.lang === "uk" ? p.name_uk : p.name_en;
      svg.appendChild(lbl);
      const dot = svgel("circle", { cx: mid - lbl.textContent.length * 3.4 - 9, cy: topPad - 32, r: 4, class: "f-" + p.id });
      svg.appendChild(dot);
    });

    // event lines + labels at bottom
    DATA.eras.events.forEach((evd) => {
      const xx = x(evd.date);
      svg.appendChild(svgel("line", { x1: xx, x2: xx, y1: topPad - 6, y2: height - bottomPad + 4, class: "eventline", "stroke-dasharray": "" }));
      const lbl = svgel("text", { x: xx + 4, y: height - bottomPad + 30, class: "eventlabel" });
      lbl.textContent = state.lang === "uk" ? evd.name_uk : evd.name_en;
      svg.appendChild(lbl);
    });

    // today line
    const xT = gutter + plotW;
    svg.appendChild(svgel("line", { x1: xT, x2: xT, y1: topPad - 6, y2: height - bottomPad, class: "todayline" }));
    const tl = svgel("text", { x: xT, y: topPad - 10, class: "axis", "text-anchor": "end" });
    tl.textContent = t("today");
    svg.appendChild(tl);

    // rows
    lineages.forEach((lin, i) => {
      const y0 = topPad + i * rowH;
      const lbl = svgel("text", {
        x: gutter - 10, y: y0 + rowH / 2 + 4,
        class: "rowlabel" + (lin.defunct ? " defunct" : ""),
        "text-anchor": "end",
      });
      lbl.textContent = lnameOf(lin) + (lin.defunct ? " †" : "");
      const note = state.lang === "uk" ? lin.note_uk : lin.note_en;
      if (note) {
        const ttl = svgel("title");
        ttl.textContent = note;
        lbl.appendChild(ttl);
      }
      svg.appendChild(lbl);
      svg.appendChild(svgel("line", { x1: gutter, x2: gutter + plotW, y1: y0 + rowH - 1.5, y2: y0 + rowH - 1.5, class: "gridline" }));
    });

    // segments
    DATA.tenures.forEach((ten, idx) => {
      const lin = DATA.lineages.find((l) => l.id === ten.lineage);
      const row = lineages.indexOf(lin);
      if (row < 0) return;
      const y0 = topPad + row * rowH + (rowH - barH) / 2 - 1;
      const x1 = x(ten.start);
      const x2 = ten.end ? x(ten.end) : xT;
      const w = Math.max(2.5, x2 - x1 - 2); // 2px surface gap between neighbors
      const rect = svgel("rect", {
        x: x1 + 1, y: y0, width: w, height: barH,
        class: `seg-mark ${fillClass(ten)}` + (ten.acting ? " acting" : ""),
        tabindex: 0,
        role: "img",
        "data-idx": idx,
        "aria-label": `${nameOf(ten)} — ${lnameOf(lin)}, ${fmtDate(ten.start)} — ${ten.end ? fmtDate(ten.end) : t("ongoing")}`,
      });
      attachTenureEvents(rect, ten, idx);
      svg.appendChild(rect);
    });

    host.appendChild(svg);

    // legend
    const legend = $("#tl-legend");
    legend.textContent = "";
    if (state.colorBy === "era") {
      DATA.eras.presidents.forEach((p) => {
        const item = el("span", { class: "item" });
        item.appendChild(el("span", { class: "sw b-" + p.id }));
        item.appendChild(document.createTextNode(state.lang === "uk" ? p.name_uk : p.name_en));
        legend.appendChild(item);
      });
    } else {
      t("durLegend").forEach((lbl, i) => {
        const item = el("span", { class: "item" });
        item.appendChild(el("span", { class: "sw b-dur-" + i }));
        item.appendChild(document.createTextNode(lbl));
        legend.appendChild(item);
      });
    }
    const act = el("span", { class: "item" });
    act.appendChild(el("span", { class: "sw acting b-" + (state.colorBy === "era" ? "kravchuk" : "dur-2") }));
    act.appendChild(document.createTextNode(t("actingLegend")));
    legend.appendChild(act);
  }

  // ------------------------------------------------------------- hero
  // Compares everything before the Orange Revolution against everything after
  // Euromaidan, read from eras.periods so the page, pipeline/build.py and
  // analysis/tenure_trends.R all answer this with the same windows. The previous
  // 1991-99 vs 2016-today slices were arbitrary decade cuts, and ended the late
  // window at the collection date rather than the analysis cutoff.
  const periodById = (id) => (DATA.eras.periods || []).find((p) => p.id === id);
  function renderHero() {
    const pool = statsPool();
    const days = (from, to) =>
      pool
        .filter((x) => x.start >= from && x.start <= to)
        .map((x) => x.days);
    const early = periodById("post-soviet");
    const late = periodById("donbas");
    if (!early || !late) return;
    const windowEndStr = DATA.meta.analysis_window_end || DATA.meta.built;
    const a = median(days(early.start, early.end));
    const b = median(days(late.start, windowEndStr));
    const host = $("#hero");
    host.textContent = "";
    if (a == null || b == null) return;
    const pct = Math.round((1 - b / a) * 100);
    let sentence;
    if (pct >= 15) sentence = STR[state.lang].yesShorter(fmtYears1(a), fmtYears1(b), pct);
    else if (pct <= -15) sentence = STR[state.lang].noLonger(fmtYears1(a), fmtYears1(b), -pct);
    else sentence = STR[state.lang].noSame(fmtYears1(a), fmtYears1(b));

    host.appendChild(el("p", { class: "answer" }, sentence));
    const figs = el("div", { class: "figures" });
    const f1 = el("div", { class: "fig" }, fmtYears1(a));
    // Captions state the actual windows used, derived from the data, so they
    // cannot go stale if the periodisation changes.
    const yr = (s) => s.slice(0, 4);
    f1.appendChild(el("span", { class: "figcap" },
      `${t("heroCapPrefix")} ${yr(early.start)}–${yr(early.end)}`));
    const arrow = el("div", { class: "arrow" }, "→");
    const f2 = el("div", { class: "fig" }, fmtYears1(b));
    f2.appendChild(el("span", { class: "figcap" },
      `${t("heroCapPrefix")} ${yr(late.start)}–${yr(windowEndStr)}`));
    const delta = el("div", { class: "delta" }, (pct > 0 ? "−" : "+") + Math.abs(pct) + "%");
    figs.append(f1, arrow, f2, delta);
    host.appendChild(figs);
    host.appendChild(el("p", { class: "note" },
      t("heroNote")(fmtDate(windowEndStr).replace(/\.$/, ""))));
  }

  // ---------------------------------------------------------- records
  function renderRecords() {
    const host = $("#records");
    host.textContent = "";
    const pool = statsPool();
    if (!pool.length) return;

    const longest = pool.reduce((a, b) => (b.days > a.days ? b : a));
    const completed = pool.filter((x) => !x.ongoing);
    const shortest = completed.reduce((a, b) => (b.days < a.days ? b : a));
    const returns = new Map(); // person+lineage tenure count
    pool.forEach((x) => {
      const k = (x.person || x.name_uk) + "|" + x.lineage;
      returns.set(k, (returns.get(k) || []).concat([x]));
    });
    let retBest = null;
    for (const [, v] of returns) {
      const spells = v.length + v.reduce((s, x) => s + x.reappointments, 0);
      if (spells > 1 && (!retBest || spells > retBest.spells)) retBest = { spells, ten: v[0] };
    }
    const byPerson = new Map();
    DATA.tenures.forEach((x) => {
      const k = x.person || x.name_uk;
      if (!byPerson.has(k)) byPerson.set(k, new Set());
      byPerson.get(k).add(x.lineage);
    });
    let multiBest = null;
    for (const [k, lins] of byPerson) {
      if (!multiBest || lins.size > multiBest.n) {
        const ten = DATA.tenures.find((x) => (x.person || x.name_uk) === k);
        multiBest = { n: lins.size, ten, lins };
      }
    }

    const linName = (id) => lnameOf(DATA.lineages.find((l) => l.id === id));
    const tiles = [
      { lbl: t("recLongest"), val: fmtDur(longest.days), who: nameOf(longest), ctx: `${linName(longest.lineage)} · ${fmtDate(longest.start)} — ${longest.end ? fmtDate(longest.end) : t("ongoing")}` },
      { lbl: t("recShortest"), val: fmtDur(shortest.days), who: nameOf(shortest), ctx: `${linName(shortest.lineage)} · ${fmtDate(shortest.start)}` },
      retBest && { lbl: t("recReturns"), val: "×" + retBest.spells, who: nameOf(retBest.ten), ctx: linName(retBest.ten.lineage) },
      multiBest && multiBest.n > 1 && { lbl: t("recMulti"), val: "×" + multiBest.n, who: nameOf(multiBest.ten), ctx: [...multiBest.lins].map(linName).join(", ") },
    ].filter(Boolean);

    tiles.forEach((tl) => {
      const d = el("div", { class: "tile" });
      d.appendChild(el("div", { class: "lbl" }, tl.lbl));
      d.appendChild(el("div", { class: "val" }, tl.val));
      d.appendChild(el("div", { class: "who" }, tl.who));
      d.appendChild(el("div", { class: "ctx" }, tl.ctx));
      host.appendChild(d);
    });
  }

  // ------------------------------------------------------------ table
  function renderTable() {
    const host = $("#table-host");
    host.textContent = "";
    const tbl = el("table", { class: "dataview" });
    const thead = el("thead");
    const hr = el("tr");
    [t("thMinistry"), t("thName"), t("thStart"), t("thEnd"), t("thDays"), t("thActing")].forEach((h) =>
      hr.appendChild(el("th", null, h))
    );
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tbody = el("tbody");
    const order = new Map(DATA.lineages.map((l) => [l.id, l.order]));
    [...DATA.tenures]
      .sort((a, b) => order.get(a.lineage) - order.get(b.lineage) || (a.start < b.start ? -1 : 1))
      .forEach((x) => {
        const tr = el("tr");
        tr.appendChild(el("td", null, lnameOf(DATA.lineages.find((l) => l.id === x.lineage))));
        tr.appendChild(el("td", null, nameOf(x)));
        tr.appendChild(el("td", { class: "num" }, x.start));
        tr.appendChild(el("td", { class: "num" }, x.end || t("ongoing")));
        // days_in_window, not days: the table must agree with the statistics
        // elsewhere on the page. Tenures starting after the cutoff have no
        // windowed length, so they show their observed length with a marker.
        tr.appendChild(el("td", { class: "num" },
          x.days_in_window == null ? `${x.days}*` : String(x.days_in_window)));
        tr.appendChild(el("td", null, x.acting ? "✓" : ""));
        tbody.appendChild(tr);
      });
    tbl.appendChild(tbody);
    host.appendChild(tbl);
  }

  // ------------------------------------------------------------ chrome
  // setText tolerates a missing element. Without it a single stale id blanked the
  // whole page: renderChrome threw partway through and every later render - hero,
  // timeline, charts - never ran, with nothing in the console to say why.
  function setText(sel, value) {
    const node = $(sel);
    if (node) node.textContent = value;
    else console.warn("viz: missing element", sel);
  }
  function renderChrome() {
    // The shared formatters in common.js read their language from ML, so this has
    // to happen before anything is formatted.
    ML.setLang(state.lang);
    // Ukrainian dates format as "25 лип. 2026 р." — already ending in a period —
    // so trim it and let the sentence supply its own punctuation in both languages.
    const noDot = (s) => s.replace(/\.$/, "");
    const cut = noDot(fmtDate(DATA.meta.analysis_window_end || DATA.meta.built));
    const built = noDot(fmtDate(DATA.meta.built));
    document.documentElement.lang = state.lang;
    document.title = t("title");
    setText("#title", t("title"));
    setText("#subtitle", t("subtitle"));
    setText("#lang-btn", t("langBtn"));
    setText("#color-label", t("colorLabel"));
    setText("#color-era", t("colorEra"));
    setText("#color-dur", t("colorDur"));
    const eraBtn = $("#color-era"), durBtn = $("#color-dur");
    if (eraBtn) eraBtn.setAttribute("aria-pressed", state.colorBy === "era");
    if (durBtn) durBtn.setAttribute("aria-pressed", state.colorBy === "duration");
    setText("#acting-label-txt", t("exclActing"));
    // The checkbox reflects the stored preference, which the other sheet can have
    // changed since this page last rendered.
    const chk = $("#acting-chk");
    if (chk) chk.checked = state.exclActing;
    setText("#timeline-title", t("timelineTitle"));
    setText("#timeline-cap", t("timelineCap"));
    setText("#table-summary", t("tableSummary"));
    setText("#table-note", t("tableNote")(cut, built));
    setText("#footer-note", t("footer")(cut, built));
    setText("#footer-credit", t("credit"));
    const repoLink = $("#footer-repo");
    if (repoLink) {
      repoLink.textContent = t("repo");
      repoLink.href = "https://github.com/velgaks/ministers-lifetime";
    }
    setText("#sheet-link", t("toRunway"));
    setText("#theme-btn", ML.isDark() ? t("themeLight") : t("themeDark"));
  }

  function renderAll() {
    renderChrome();
    renderHero();
    renderTimeline();
    renderRecords();
    renderTable();
  }

  // ------------------------------------------------------------ events
  // Language and theme persist, so following the link to the other sheet does not
  // silently reset either one.
  $("#lang-btn").addEventListener("click", () => {
    state.lang = state.lang === "uk" ? "en" : "uk";
    ML.saveLang(state.lang);
    renderAll();
  });
  $("#theme-btn").addEventListener("click", () => {
    ML.toggleTheme();
    renderAll();
  });
  $("#color-era").addEventListener("click", () => { state.colorBy = "era"; renderAll(); });
  $("#color-dur").addEventListener("click", () => { state.colorBy = "duration"; renderAll(); });
  $("#acting-chk").addEventListener("change", (e) => {
    state.exclActing = e.target.checked;
    ML.saveExclActing(state.exclActing);
    renderAll();
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 200);
  });

  renderAll();
})();
