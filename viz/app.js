/* Ukraine ministers tenure — interactive timeline + trend analysis.
   Vanilla JS + SVG. Data comes from data.js (window.MINISTERS_DATA). */
(function () {
  "use strict";
  const DATA = window.MINISTERS_DATA;
  if (!DATA) return;

  const SVGNS = "http://www.w3.org/2000/svg";
  const MS_DAY = 86400000;
  const YEAR_DAYS = 365.25;
  const T0 = new Date(DATA.meta.independence + "T00:00:00");
  const T1 = new Date(DATA.meta.built + "T00:00:00");

  const state = {
    lang: "uk",
    colorBy: "era", // 'era' | 'duration'
    exclActing: false,
  };

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
      trendTitle: "Чи стали каденції коротшими?",
      trendCap:
        "Кожна точка — один міністр (без прем'єрів): дата призначення проти тривалості каденції. Лінія — ковзна медіана (вікно ±1,5 року). Кільця — міністри, які були на посаді на момент зміни уряду (це нижня межа). Підписані найдовші каденції. Останній відрізок лінії напівпрозорий — найновіші призначення ще «не дозріли».",
      eraTitle: "Медіанна каденція за президентами",
      eraCap: "Міністри, призначені за каденції відповідного президента.",
      recordsTitle: "Рекорди",
      recLongest: "Найдовша каденція",
      recShortest: "Найкоротша каденція",
      recReturns: "Найбільше повернень у те саме крісло",
      recMulti: "Найбільше різних портфелів",
      tableSummary: "Показати всі дані таблицею",
      thName: "Міністр", thMinistry: "Міністерство", thStart: "Початок",
      thEnd: "Кінець", thDays: "Днів", thActing: "в.о.",
      ongoing: "триває",
      acting: "в.о.",
      actingLegend: "в.о. (виконувач обов'язків)",
      censoredLegend: "чинний міністр (каденція триває)",
      durLegend: ["до 1 року", "1–2 роки", "2–4 роки", "4–7 років", "7+ років"],
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
      heroCapA: "призначені у 1991–1999",
      heroCapB: "призначені у 2016–2026",
      heroNote:
        "Медіана враховує і в.о., і чинних міністрів (для чинних тривалість рахується до сьогодні — це нижня межа). Прем'єр-міністри в статистику не входять. Перемикач вище дозволяє прибрати в.о.",
      credit: "Графіка: Валентин Гацко, TG: @gorbach_squad.",
      repo: "Дані, код і метод: github.com/velgaks/ministers-lifetime",
      footer:
        "Джерело: Wikidata (твердження про посади P39) та Українська Вікіпедія (списки міністрів), отримано в липні 2026 року; усі виправлення з посиланнями на джерела — у data/patches.json. Статистика завершується зміною уряду 16 липня 2026 року: міністри, призначені тоді, пробули на посаді близько тижня. Ранні галузеві міністерства 1990-х (машинобудування, зв'язку тощо) не охоплені. Каденції, що почалися до 24.08.1991, обрізані на дату незалежності. Зібрано ",
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
      trendTitle: "Are tenures getting shorter?",
      trendCap:
        "Each dot is one minister (PMs excluded): appointment date vs tenure length. The line is a rolling median (±1.5-year window). Rings are ministers still in office when the government changed, so a lower bound. The longest tenures are named. The line's final stretch is translucent — the newest appointments have not 'matured' yet.",
      eraTitle: "Median tenure by president",
      eraCap: "Ministers appointed during each president's time in office.",
      recordsTitle: "Records",
      recLongest: "Longest tenure",
      recShortest: "Shortest tenure",
      recReturns: "Most returns to the same chair",
      recMulti: "Most different portfolios",
      tableSummary: "Show all data as a table",
      thName: "Minister", thMinistry: "Ministry", thStart: "Start",
      thEnd: "End", thDays: "Days", thActing: "acting",
      ongoing: "ongoing",
      acting: "acting",
      actingLegend: "acting minister",
      censoredLegend: "current minister (tenure ongoing)",
      durLegend: ["under 1 year", "1–2 years", "2–4 years", "4–7 years", "7+ years"],
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
      heroCapA: "appointed 1991–1999",
      heroCapB: "appointed 2016–2026",
      heroNote:
        "The median includes acting and current ministers (current tenures are counted up to today — a lower bound). Prime ministers are excluded from the stats. Use the toggle above to drop acting ministers.",
      credit: "Chart: Valentyn Hatsko, TG: @gorbach_squad.",
      repo: "Data, code and method: github.com/velgaks/ministers-lifetime",
      footer:
        "Source: Wikidata (P39 officeholder statements) and Ukrainian Wikipedia minister lists, retrieved July 2026; every correction is recorded with its source in data/patches.json. Statistics end at the government change of 16 July 2026 — ministers appointed then had been in office about a week. Early-1990s branch ministries (machine-building, communications, etc.) are not covered. Tenures that began before 24 Aug 1991 are clipped at independence. Built ",
      years: (y) => {
        const yi = Math.floor(y);
        return yi === 1 ? "1 year" : `${yi} years`;
      },
    },
  };
  const t = (k) => STR[state.lang][k];

  // ------------------------------------------------------------- helpers
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

  function fmtDate(s) {
    if (!s) return t("ongoing");
    const d = D(s);
    return d.toLocaleDateString(state.lang === "uk" ? "uk-UA" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  function fmtDur(days) {
    const y = Math.floor(days / YEAR_DAYS);
    const m = Math.round((days - y * YEAR_DAYS) / 30.44);
    const uk = state.lang === "uk";
    const yTxt = uk
      ? (y % 10 === 1 && y % 100 !== 11 ? "рік" : y % 10 >= 2 && y % 10 <= 4 && (y % 100 < 12 || y % 100 > 14) ? "роки" : "років")
      : (y === 1 ? "yr" : "yrs");
    const mTxt = uk ? "міс." : "mo";
    if (days < 45) return `${days} ${uk ? "дн." : "d"}`;
    if (y === 0) return `${Math.max(1, m)} ${mTxt}`;
    if (m === 0 || m === 12) return `${m === 12 ? y + 1 : y} ${yTxt}`;
    return `${y} ${yTxt} ${m} ${mTxt}`;
  }
  const fmtYears1 = (days) =>
    (days / YEAR_DAYS).toLocaleString(state.lang === "uk" ? "uk-UA" : "en-US", {
      minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + (state.lang === "uk" ? " р." : " y");

  // The era in force is the one whose start is the latest not after the date.
  // Matching start-and-end and returning the first hit put anyone appointed
  // exactly on a transition date into the OUTGOING era — which showed Avakov,
  // appointed 22 Feb 2014, in Yanukovych's colour.
  function latestBefore(list, dateStr) {
    const d = D(dateStr);
    let hit = null;
    for (const item of list) if (D(item.start) <= d) hit = item;
    return hit;
  }
  const eraOf = (dateStr) =>
    latestBefore(DATA.eras.presidents, dateStr) || DATA.eras.presidents[0];
  const cabinetOf = (dateStr) => latestBefore(DATA.eras.cabinets, dateStr);
  function durBucket(days) {
    const y = days / YEAR_DAYS;
    return y < 1 ? 0 : y < 2 ? 1 : y < 4 ? 2 : y < 7 ? 3 : 4;
  }
  function fillClass(ten) {
    return state.colorBy === "era"
      ? "f-" + eraOf(ten.start).id
      : "f-dur-" + durBucket(ten.days);
  }
  // Statistics stop at the July 2026 government change. Ministers appointed
  // then had been in office about a week; counting them drags every recent
  // figure down for no reason but when the data was collected. The timeline
  // above still shows them — only the numbers below exclude them.
  //
  // Read from the data, not hardcoded: pipeline/build.py and
  // analysis/tenure_trends.R take the same value from data/eras.json, and when
  // this was a literal in three places the three disagreed.
  const WINDOW_END = D(
    DATA.meta.analysis_window_end || DATA.eras.analysis_window_end || DATA.meta.built
  );
  const ministersOnly = () =>
    DATA.tenures
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.lineage !== "pm" && D(x.start) < WINDOW_END)
      .map(({ x, i }) => {
        const ended = x.end && D(x.end) < WINDOW_END;
        const endEff = ended ? D(x.end) : WINDOW_END;
        return {
          ...x,
          _idx: i,
          days: Math.max(1, Math.round((endEff - D(x.start)) / MS_DAY)),
          ongoing: !ended,
        };
      });
  const statsPool = () =>
    ministersOnly().filter((x) => !(state.exclActing && x.acting));
  function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }
  function wikiUrl(ten) {
    const preferUk = state.lang === "uk";
    const title = preferUk ? ten.ukwiki || ten.enwiki : ten.enwiki || ten.ukwiki;
    if (!title) return null;
    const host =
      title === ten.ukwiki && ten.ukwiki
        ? "uk.wikipedia.org"
        : "en.wikipedia.org";
    return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  }
  const nameOf = (x) =>
    state.lang === "uk" ? x.name_uk || x.name_en : x.name_en || x.name_uk;
  // Source names mix "Surname Given Patronymic" with "Given Surname". For chart
  // labels drop the patronymic so the annotations stay short and comparable;
  // tooltips and the table keep the full form.
  const shortName = (x) => {
    const parts = nameOf(x).split(/\s+/);
    if (parts.length < 3) return nameOf(x);
    const kept = parts.filter(
      (p) => !/(ович|евич|євич|йович|івна|ївна|овна|евна)$/i.test(p)
    );
    return (kept.length >= 2 ? kept : parts).slice(0, 2).join(" ");
  };
  const lnameOf = (l) => (state.lang === "uk" ? l.name_uk : l.name_en);

  // ------------------------------------------------------------- tooltip
  const tooltip = $("#tooltip");
  function showTooltip(ten, ev) {
    tooltip.textContent = "";
    const head = el("div", { class: "tt-head" });
    if (ten.image) {
      const img = el("img", { src: ten.image + (ten.image.includes("?") ? "&" : "?") + "width=88", alt: "" });
      img.onerror = () => img.remove();
      head.appendChild(img);
    }
    const hh = el("div");
    hh.appendChild(el("div", { class: "tt-name" }, nameOf(ten)));
    const lin = DATA.lineages.find((l) => l.id === ten.lineage);
    hh.appendChild(el("div", { class: "tt-role" }, lnameOf(lin)));
    head.appendChild(hh);
    tooltip.appendChild(head);

    const dates = el("div", { class: "tt-line" });
    const strong = el("strong", null, fmtDur(ten.days));
    dates.appendChild(strong);
    dates.appendChild(
      document.createTextNode(` · ${fmtDate(ten.start)} — ${ten.end ? fmtDate(ten.end) : t("ongoing")}`)
    );
    tooltip.appendChild(dates);

    const cab = cabinetOf(ten.start);
    const era = eraOf(ten.start);
    const info = el("div", { class: "tt-line" });
    info.textContent =
      `${t("tooltipEra")}: ${state.lang === "uk" ? era.name_uk : era.name_en}` +
      (cab ? ` · ${t("tooltipCabinet")}: ${state.lang === "uk" ? cab.name_uk : cab.name_en}` : "");
    tooltip.appendChild(info);

    const badges = el("div");
    if (ten.acting || ten.has_acting_part) badges.appendChild(el("span", { class: "badge" }, t("acting")));
    if (ten.ongoing) badges.appendChild(el("span", { class: "badge" }, t("ongoing")));
    if (ten.reappointments > 0)
      badges.appendChild(el("span", { class: "badge" }, `${ten.reappointments} ${t("tooltipSpells")}`));
    if (badges.childNodes.length) tooltip.appendChild(badges);

    if (wikiUrl(ten)) tooltip.appendChild(el("div", { class: "tt-hint" }, t("tooltipHint")));
    tooltip.style.display = "block";
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    const pad = 14;
    const r = tooltip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }
  function hideTooltip() {
    tooltip.style.display = "none";
  }

  function attachTenureEvents(node, ten, idx) {
    node.addEventListener("pointerenter", (ev) => {
      showTooltip(ten, ev);
      crossHighlight(idx, true);
    });
    node.addEventListener("pointermove", moveTooltip);
    node.addEventListener("pointerleave", () => {
      hideTooltip();
      crossHighlight(idx, false);
    });
    node.addEventListener("focus", (ev) => {
      const r = node.getBoundingClientRect();
      showTooltip(ten, { clientX: r.left + r.width / 2, clientY: r.top });
      crossHighlight(idx, true);
    });
    node.addEventListener("blur", () => {
      hideTooltip();
      crossHighlight(idx, false);
    });
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
    document.querySelectorAll(`[data-idx="${idx}"]`).forEach((n) => {
      n.classList.toggle("hl", on);
    });
  }

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
  function renderHero() {
    const pool = statsPool();
    const days = (from, to) =>
      pool
        .filter((x) => x.start >= from && x.start <= to)
        .map((x) => x.days);
    const a = median(days("1991-08-24", "1999-12-31"));
    const b = median(days("2016-01-01", DATA.meta.built));
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
    f1.appendChild(el("span", { class: "figcap" }, t("heroCapA")));
    const arrow = el("div", { class: "arrow" }, "→");
    const f2 = el("div", { class: "fig" }, fmtYears1(b));
    f2.appendChild(el("span", { class: "figcap" }, t("heroCapB")));
    const delta = el("div", { class: "delta" }, (pct > 0 ? "−" : "+") + Math.abs(pct) + "%");
    figs.append(f1, arrow, f2, delta);
    host.appendChild(figs);
    host.appendChild(el("p", { class: "note" }, t("heroNote")));
  }

  // ------------------------------------------------------------- trend
  function renderTrend() {
    const host = $("#scatter-host");
    host.textContent = "";
    const pool = statsPool();
    const width = Math.max(620, host.clientWidth - 4);
    const height = 360;
    const mL = 44, mR = 16, mT = 14, mB = 30;
    const plotW = width - mL - mR, plotH = height - mT - mB;
    const maxY = Math.max(...pool.map((p) => p.days)) / YEAR_DAYS;
    const yMax = Math.ceil(maxY);
    const x = (dateStr) => mL + ((D(dateStr) - T0) / (WINDOW_END - T0)) * plotW;
    const y = (days) => mT + plotH - (days / YEAR_DAYS / yMax) * plotH;

    const svg = svgel("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": t("trendTitle") });

    for (let yy = 0; yy <= yMax; yy += 2) {
      const py = y(yy * YEAR_DAYS);
      svg.appendChild(svgel("line", { x1: mL, x2: mL + plotW, y1: py, y2: py, class: "gridline" }));
      const lbl = svgel("text", { x: mL - 8, y: py + 4, class: "axis", "text-anchor": "end" });
      lbl.textContent = yy;
      svg.appendChild(lbl);
    }
    for (let yr = 1995; yr <= WINDOW_END.getFullYear(); yr += 5) {
      const px = x(`${yr}-01-01`);
      const lbl = svgel("text", { x: px, y: height - 8, class: "axis", "text-anchor": "middle" });
      lbl.textContent = yr;
      svg.appendChild(lbl);
    }

    // Rolling median on a monthly grid. A +-18-month window (3 years total)
    // tracks the shocks; anything wider flattens 2005 and 2014 into the trend.
    const pts = pool
      .map((p) => ({ t: D(p.start).getTime(), days: p.days }))
      .sort((a, b) => a.t - b.t);
    const win = 18 * 30.44 * MS_DAY;
    const pathPts = [];
    for (let d = new Date(1993, 0, 1); d <= WINDOW_END; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const tt = d.getTime();
      const sel = pts.filter((p) => Math.abs(p.t - tt) <= win).map((p) => p.days);
      pathPts.push(sel.length ? { t: tt, v: median(sel) } : null);
    }
    // The last stretch is drawn faint: with an 18-month half-window the newest
    // appointments have not had time to reveal how long they will last.
    const matured = WINDOW_END.getTime() - 1.5 * YEAR_DAYS * MS_DAY;
    let dSolid = "", dProv = "", pen = false, penP = false;
    pathPts.forEach((p) => {
      if (!p) { pen = penP = false; return; }
      const px = mL + ((p.t - T0.getTime()) / (WINDOW_END - T0)) * plotW;
      const py = y(p.v);
      if (p.t <= matured) {
        dSolid += (pen ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
        pen = true; penP = false;
      } else {
        if (!penP && dSolid) dProv += "M" + px.toFixed(1) + " " + py.toFixed(1);
        else dProv += (penP ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
        penP = true;
      }
    });
    if (dSolid) svg.appendChild(svgel("path", { d: dSolid, class: "trend" }));
    if (dProv) svg.appendChild(svgel("path", { d: dProv, class: "trend provisional" }));

    // dots
    pool.forEach((ten) => {
      const idx = ten._idx;
      const cls = state.colorBy === "era" ? "f-" + eraOf(ten.start).id : "f-dur-" + durBucket(ten.days);
      const c = svgel("circle", {
        cx: x(ten.start).toFixed(1), cy: y(ten.days).toFixed(1), r: 4.5,
        class: `dot ${cls}` + (ten.ongoing ? ` censored c-${eraOf(ten.start).id}` : ""),
        "data-idx": idx, tabindex: 0,
      });
      attachTenureEvents(c, ten, idx);
      svg.appendChild(c);
    });

    // Name the standout long tenures. Placement is greedy: try right of the dot,
    // then left, then above/below, and skip the label entirely rather than let
    // it collide with one already placed or run outside the plot.
    const placed = [];
    [...pool].sort((a, b) => b.days - a.days).slice(0, 7).forEach((ten) => {
      const cx = x(ten.start), cy = y(ten.days);
      const text = shortName(ten);
      const w = text.length * 5.3, h = 11;
      const options = [
        [cx + 9, cy + 3.5, "start"],
        [cx - 9, cy + 3.5, "end"],
        [cx, cy - 9, "middle"],
        [cx, cy + 15, "middle"],
      ];
      for (const [tx, ty, anchor] of options) {
        const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
        const box = { x0, x1: x0 + w, y0: ty - h, y1: ty + 3 };
        const clashes = placed.some(
          (p) => !(box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1)
        );
        if (clashes || box.x0 < mL || box.x1 > mL + plotW || box.y0 < mT) continue;
        placed.push(box);
        const lbl = svgel("text", { x: tx.toFixed(1), y: ty.toFixed(1), class: "outlier", "text-anchor": anchor });
        lbl.textContent = text;
        svg.appendChild(lbl);
        break;
      }
    });

    host.appendChild(svg);

    const legend = $("#trend-legend");
    legend.textContent = "";
    const cens = el("span", { class: "item" });
    cens.appendChild(el("span", { class: "sw ring" }));
    cens.appendChild(document.createTextNode(t("censoredLegend")));
    legend.appendChild(cens);
  }

  // ------------------------------------------------------- era medians
  function renderEraBars() {
    const host = $("#erabars-host");
    host.textContent = "";
    const pool = statsPool();
    const rows = DATA.eras.presidents.map((p) => {
      const sel = pool.filter((x) => eraOf(x.start).id === p.id);
      return { p, med: median(sel.map((x) => x.days)), n: sel.length };
    });
    const width = Math.max(300, host.clientWidth - 4);
    const rowH = 34, mL = 110, mR = 64;
    const height = rows.length * rowH + 8;
    const maxV = Math.max(...rows.map((r) => r.med || 0));
    const svg = svgel("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": t("eraTitle") });
    rows.forEach((r, i) => {
      const y0 = 4 + i * rowH;
      const lbl = svgel("text", { x: mL - 10, y: y0 + 16, class: "rowlabel", "text-anchor": "end" });
      lbl.textContent = state.lang === "uk" ? r.p.name_uk : r.p.name_en;
      svg.appendChild(lbl);
      if (r.med == null) return;
      const w = Math.max(3, ((width - mL - mR) * r.med) / maxV);
      svg.appendChild(svgel("rect", { x: mL, y: y0 + 2, width: w, height: 20, rx: 4, class: "f-" + r.p.id }));
      const val = svgel("text", { x: mL + w + 8, y: y0 + 17, class: "rowlabel" });
      val.textContent = fmtYears1(r.med) + `  (n=${r.n})`;
      svg.appendChild(val);
    });
    host.appendChild(svg);
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
        tr.appendChild(el("td", { class: "num" }, String(x.days)));
        tr.appendChild(el("td", null, x.acting ? "✓" : ""));
        tbody.appendChild(tr);
      });
    tbl.appendChild(tbody);
    host.appendChild(tbl);
  }

  // ------------------------------------------------------------ chrome
  function renderChrome() {
    document.documentElement.lang = state.lang;
    document.title = t("title");
    $("#title").textContent = t("title");
    $("#subtitle").textContent = t("subtitle");
    $("#lang-btn").textContent = t("langBtn");
    $("#color-label").textContent = t("colorLabel");
    $("#color-era").textContent = t("colorEra");
    $("#color-era").setAttribute("aria-pressed", state.colorBy === "era");
    $("#color-dur").textContent = t("colorDur");
    $("#color-dur").setAttribute("aria-pressed", state.colorBy === "duration");
    $("#acting-label-txt").textContent = t("exclActing");
    $("#timeline-title").textContent = t("timelineTitle");
    $("#timeline-cap").textContent = t("timelineCap");
    $("#trend-title").textContent = t("trendTitle");
    $("#trend-cap").textContent = t("trendCap");
    $("#era-title").textContent = t("eraTitle");
    $("#era-cap").textContent = t("eraCap");
    $("#table-summary").textContent = t("tableSummary");
    $("#footer-note").textContent = t("footer") + DATA.meta.built + ".";
    $("#footer-credit").textContent = t("credit");
    const repoLink = $("#footer-repo");
    repoLink.textContent = t("repo");
    repoLink.href = "https://github.com/velgaks/ministers-lifetime";
    const themeBtn = $("#theme-btn");
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    themeBtn.textContent = dark ? t("themeLight") : t("themeDark");
  }

  function renderAll() {
    renderChrome();
    renderHero();
    renderTimeline();
    renderTrend();
    renderEraBars();
    renderRecords();
    renderTable();
  }

  // ------------------------------------------------------------ events
  $("#lang-btn").addEventListener("click", () => {
    state.lang = state.lang === "uk" ? "en" : "uk";
    renderAll();
  });
  $("#theme-btn").addEventListener("click", () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
    renderAll();
  });
  $("#color-era").addEventListener("click", () => { state.colorBy = "era"; renderAll(); });
  $("#color-dur").addEventListener("click", () => { state.colorBy = "duration"; renderAll(); });
  $("#acting-chk").addEventListener("change", (e) => {
    state.exclActing = e.target.checked;
    renderAll();
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 200);
  });

  renderAll();
})();
