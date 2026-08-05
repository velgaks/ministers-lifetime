/* Ukraine ministers tenure, sheet 2 — the charts that plot individual ministers
   against one another, moved off the timeline sheet to give them room.

   Lead story: a minister's tenure against the life the government that appointed
   them had left, read against the 45° line. This is the interactive twin of
   analysis/figures/q8-runway.png. Below it, the appointment-date trend and the
   median by president, which used to share a cramped two-column card on sheet 1.

   The runway rule and the observation window come from common.js so the sheets
   cannot drift apart. */
(function () {
  "use strict";
  const DATA = window.MINISTERS_DATA;
  if (!DATA || !window.ML) return;

  const {
    MS_DAY, YEAR_DAYS, el, svgel, D, median, fmtDate, fmtDur, fmtYears1,
    shortName, eraOf, WINDOW_END, windowPool, resolvedPool, runwayEnd,
    makeTooltip, attachTenureEvents,
  } = window.ML;
  const T0 = new Date(DATA.meta.independence + "T00:00:00");

  const state = { lang: ML.loadLang(), exclActing: ML.loadExclActing() };
  ML.applyStoredTheme();

  // Tolerance for "left when the government did". It is a threshold, so it is
  // stated in the footer rather than hidden: at ±7 days the middle share reads
  // 29%, at ±14 it reads 31%, at ±30 it reads 42%. The chart itself shows
  // position against the line and commits to nothing.
  const BAND_DAYS = 14;

  // ---------------------------------------------------------------- i18n
  const STR = {
    uk: {
      title: "Аналіз каденцій міністрів",
      subtitle:
        "Три графіки, на яких кожен міністр — окрема точка: хто переживає зміну уряду, чи стали каденції коротшими, і скільки тримався середній міністр кожного президента.",
      langBtn: "EN", themeLight: "Світла", themeDark: "Темна",
      toIndex: "← Життєвий цикл міністра (таймлайн)",
      chartTitle: "Каденція проти залишку життя уряду",
      chartCap:
        "Горизонталь — скільки залишалося уряду, який призначив міністра. Вертикаль — скільки міністр насправді пробув. На діагоналі — пішов разом з урядом; нижче — пішов раніше; вище — зберіг посаду попри зміну уряду. Кільця — чинні міністри, для них тривалість є нижньою межею.",
      actingTitle: "В.о. майже ніколи не переживає зміну уряду",
      actingCap:
        "Ті самі міністри, розкладені за тим, як їхня каденція співвідноситься з життям уряду.",
      diagonal: "пішов разом з урядом",
      regionAbove: "зберіг посаду попри зміну уряду",
      regionBelow: "пішов раніше, ніж упав уряд",
      axisX: "залишок життя уряду, який призначив",
      axisY: "тривалість каденції",
      placeEarly: "Пішли раніше, ніж упав уряд",
      placeWith: "Пішли разом з урядом",
      placeOutlived: "Пережили свій уряд",
      placeEarlyShort: "раніше", placeWithShort: "разом", placeOutlivedShort: "пережили",
      ministers: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "міністр" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "міністри" : "міністрів"}`,
      legendConfirmed: "затверджений міністр",
      legendActing: "в.о. — ніколи не затверджений",
      legendRing: "чинний міністр (каденція триває)",
      rowActing: "в.о.", rowConfirmed: "затверджені",
      ttRunway: "Уряду залишалося",
      ttOutlived: "пережив на",
      ttEarly: "пішов раніше на",
      ttWith: "пішов разом з урядом",
      exclActing: "Не враховувати в.о. у двох графіках нижче",
      trendTitle: "Чи стали каденції коротшими?",
      trendCap:
        "Кожна точка — один міністр (без прем'єрів): дата призначення проти тривалості каденції. Лінія — ковзна медіана (вікно ±1,5 року). Кільця — міністри, які були на посаді на момент зміни уряду (це нижня межа). Підписані найдовші каденції. Останній відрізок лінії напівпрозорий — найновіші призначення ще «не дозріли».",
      eraTitle: "Медіанна каденція за президентами",
      eraCap: "Міністри, призначені за каденції відповідного президента.",
      censoredLegend: "чинний міністр (каденція триває)",
      credit: "Графіка: Валентин Гацко, TG: @gorbach_squad.",
      repo: "Дані, код і метод: github.com/velgaks/ministers-lifetime",
      footer: (cut, n, band) =>
        `«Залишок життя уряду» — від призначення до відходу того уряду, який був при владі на момент призначення; для двох міністрів, призначених у міжурядову паузу, рахується до кінця наступного сформованого уряду. Прем'єр-міністри не враховані. Порожні кільця — міністри, які були на посаді на ${cut}: їхня тривалість є нижньою межею. «Пішли разом з урядом» означає ±${band} днів від зміни уряду — цей допуск впливає на числа (при ±7 днях частка 29%, при ±30 — 42%), тому на графіку його немає, лише положення точки. Усього ${n} каденцій. Джерело: Wikidata та Українська Вікіпедія.`,
    },
    en: {
      title: "Minister Tenures, Analysed",
      subtitle:
        "Three charts that plot ministers one dot at a time: who survives a change of government, whether tenures are getting shorter, and how long the typical minister of each president lasted.",
      langBtn: "УКР", themeLight: "Light", themeDark: "Dark",
      toIndex: "← The Lifetime of a Minister (timeline)",
      chartTitle: "Tenure against the life left in the appointing government",
      chartCap:
        "Across: how much life the government that appointed them had left. Up: how long they actually stayed. On the diagonal they left when the government did; below it they went early; above it they kept the job through a change of government. Rings are ministers still in office, so their length is a lower bound.",
      actingTitle: "An acting minister almost never survives a change of government",
      actingCap:
        "The same ministers, split by how their tenure compares to the life of their government.",
      diagonal: "left when their government did",
      regionAbove: "outlived their government",
      regionBelow: "left before it fell",
      axisX: "life left in the appointing government",
      axisY: "time served",
      placeEarly: "Left before their government fell",
      placeWith: "Left when their government did",
      placeOutlived: "Outlived their government",
      placeEarlyShort: "left early", placeWithShort: "left with it", placeOutlivedShort: "outlived it",
      ministers: (n) => `${n} minister${n === 1 ? "" : "s"}`,
      legendConfirmed: "confirmed minister",
      legendActing: "acting official, never confirmed",
      legendRing: "current minister (tenure ongoing)",
      rowActing: "acting", rowConfirmed: "confirmed",
      ttRunway: "Government had left",
      ttOutlived: "outlived it by",
      ttEarly: "went early by",
      ttWith: "left when the government did",
      exclActing: "Exclude acting ministers from the two charts below",
      trendTitle: "Are tenures getting shorter?",
      trendCap:
        "Each dot is one minister (PMs excluded): appointment date vs tenure length. The line is a rolling median (±1.5-year window). Rings are ministers still in office when the government changed, so a lower bound. The longest tenures are named. The line's final stretch is translucent — the newest appointments have not 'matured' yet.",
      eraTitle: "Median tenure by president",
      eraCap: "Ministers appointed during each president's time in office.",
      censoredLegend: "current minister (tenure ongoing)",
      credit: "Chart: Valentyn Hatsko, TG: @gorbach_squad.",
      repo: "Data, code and method: github.com/velgaks/ministers-lifetime",
      footer: (cut, n, band) =>
        `"Life left" runs from the appointment to the fall of the cabinet in office at the time; for the two ministers appointed during an inter-cabinet gap it runs to the end of the next cabinet formed. Prime ministers are excluded. Hollow rings were still in office on ${cut}, so their length is a lower bound. "Left when their government did" means within ±${band} days of the change — that tolerance moves the numbers (at ±7 days the share is 29%, at ±30 it is 42%), which is why the chart shows only position. ${n} tenures in all. Source: Wikidata and Ukrainian Wikipedia.`,
    },
  };
  const t = (k) => STR[state.lang][k];
  const $ = (s) => document.querySelector(s);

  // --------------------------------------------------------------- model
  // 415 ministerial tenures inside the window - the same pool as `tenures` in
  // analysis/tenure_trends.R, NOT the narrower `resolved` used for medians. A
  // tenure too recent to judge on length still has a known runway.
  function build() {
    return windowPool()
      .map((x) => {
        const end = runwayEnd(x.start);
        if (!end) return null;
        const runway = Math.max(1, Math.round((end - D(x.start)) / MS_DAY));
        const over = x.days - runway;
        return {
          ...x, runway, over,
          place: Math.abs(over) <= BAND_DAYS ? "with" : over < 0 ? "early" : "outlived",
          status: x.acting ? "acting" : "confirmed",
        };
      })
      .filter(Boolean);
  }
  const PLACES = ["early", "with", "outlived"];
  const placeLabel = (p) =>
    t(p === "early" ? "placeEarly" : p === "with" ? "placeWith" : "placeOutlived");
  const placeShort = (p) =>
    t(p === "early" ? "placeEarlyShort" : p === "with" ? "placeWithShort" : "placeOutlivedShort");

  const tip = makeTooltip();
  // The extra tooltip line: what the dot's position actually says.
  const ttExtra = (d) => {
    const head = `${t("ttRunway")}: ${fmtDur(d.runway)}`;
    if (d.place === "with") return `${head} · ${t("ttWith")}`;
    const verb = d.place === "outlived" ? t("ttOutlived") : t("ttEarly");
    return `${head} · ${verb} ${fmtDur(Math.abs(d.over))}`;
  };

  // -------------------------------------------------------- name the outliers
  // Greedy placement shared by both scatters: rank the rows, try each candidate
  // offset in turn, and skip the label rather than let it collide.
  //
  // Two things this gets right that the version on sheet 1 did not. It measures
  // the label's real rendered width instead of guessing at length × 5.3, which is
  // wrong enough on Cyrillic to let a box pass the test and overlap anyway. And it
  // tests against the DOTS as well as the labels already placed - the survivors
  // cluster tightly, and testing labels alone put four names straight on top of
  // their neighbours' dots.
  //
  // Must run with `svg` already in the document: getBBox() returns zeros for an
  // element that is not being rendered, which silently sized every box 0×0 and
  // stopped any collision from ever being detected.
  function placeNames(svg, rows, rank, px, py, bounds, count) {
    const dotXY = rows.map((r) => [px(r), py(r)]);
    const placed = [];
    [...rows].sort((a, b) => rank(b) - rank(a)).slice(0, count).forEach((d) => {
      const cx = px(d), cy = py(d);
      const lbl = svgel("text", { x: 0, y: 0, class: "outlier", "text-anchor": "start" });
      lbl.textContent = shortName(d);
      svg.appendChild(lbl);
      const bb = lbl.getBBox();
      const w = bb.width, h = bb.height, dy = bb.y;

      // Offsets reach a long way sideways, because the space next to a crowded
      // cluster is usually horizontal. Anything past the first ring gets a leader
      // line, which is what keeps a distant label attached to its dot.
      const cands = [];
      for (const off of [9, 18, 30, 48, 70]) {
        cands.push([cx + off, cy + 3.5, "start", off], [cx - off, cy + 3.5, "end", off],
                   [cx, cy - off, "middle", off], [cx, cy + off + 6, "middle", off]);
      }
      let done = false;
      for (const [tx, ty, anchor, off] of cands) {
        const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
        const box = { x0, x1: x0 + w, y0: ty + dy, y1: ty + dy + h };
        if (box.x0 < bounds.x0 || box.x1 > bounds.x1 ||
            box.y0 < bounds.y0 || box.y1 > bounds.y1) continue;
        if (placed.some((p) => !(box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1))) continue;
        // the labelled dot itself is allowed to sit under its own leader
        const onDot = dotXY.some(([dx2, dy2]) =>
          !(dx2 === cx && dy2 === cy) &&
          dx2 > box.x0 - 4 && dx2 < box.x1 + 4 && dy2 > box.y0 - 4 && dy2 < box.y1 + 4);
        if (onDot) continue;
        placed.push(box);
        lbl.setAttribute("x", tx.toFixed(1));
        lbl.setAttribute("y", ty.toFixed(1));
        lbl.setAttribute("text-anchor", anchor);
        if (off > 9) {
          const lx = anchor === "start" ? box.x0 - 2 : anchor === "end" ? box.x1 + 2 : cx;
          const ly = anchor === "middle" ? (ty > cy ? box.y0 - 1 : box.y1 + 2) : ty - 3;
          svg.insertBefore(svgel("line", {
            x1: cx.toFixed(1), y1: cy.toFixed(1), x2: lx.toFixed(1), y2: ly.toFixed(1),
            class: "leader",
          }), lbl);
        }
        done = true;
        break;
      }
      if (!done) lbl.remove();
    });
  }

  // ------------------------------------------------------- split summary
  function renderSplit(rows) {
    const host = $("#split");
    host.textContent = "";
    PLACES.forEach((p) => {
      const sel = rows.filter((r) => r.place === p);
      const tile = el("div", { class: "tile" });
      tile.appendChild(el("div", { class: "lbl" }, placeLabel(p)));
      tile.appendChild(el("div", { class: "val" },
        Math.round((sel.length / rows.length) * 100) + "%"));
      tile.appendChild(el("div", { class: "ctx" }, STR[state.lang].ministers(sel.length)));
      host.appendChild(tile);
    });
  }

  // ------------------------------------------------------------- scatter
  function renderScatter(rows) {
    const host = $("#runway-host");
    host.textContent = "";
    const mL = 48, mR = 18, mT = 16, mB = 42;
    // Square panel with equal ranges on both axes. Equal units are what makes the
    // 45° line mean anything, and equal units on a non-square panel is a portrait
    // chart; squaring it by clipping the y axis would throw the longest-serving
    // ministers off the top. The cost is an empty strip past 5.4 years, where no
    // government ever had that much left - the region labels live there.
    const avail = Math.max(300, (host.clientWidth || 900) - mL - mR - 2);
    const S = Math.max(300, Math.min(avail, 720));
    const width = S + mL + mR, height = S + mT + mB;
    const MAX = Math.ceil(Math.max(...rows.map((r) => Math.max(r.days, r.runway))) / YEAR_DAYS * 2) / 2;
    const xs = (yv) => mL + (yv / MAX) * S;
    const ys = (yv) => mT + S - (yv / MAX) * S;
    const svg = svgel("svg", {
      width, height, viewBox: `0 0 ${width} ${height}`,
      role: "img", "aria-label": t("chartTitle"),
    });

    // gridlines + axis ticks, one per year on both axes
    for (let v = 0; v <= MAX; v += 1) {
      const py = ys(v), px = xs(v);
      svg.appendChild(svgel("line", { x1: mL, x2: mL + S, y1: py, y2: py, class: "gridline" }));
      svg.appendChild(svgel("line", { x1: px, x2: px, y1: mT, y2: mT + S, class: "gridline" }));
      const yl = svgel("text", { x: mL - 8, y: py + 4, class: "axis", "text-anchor": "end" });
      yl.textContent = v;
      svg.appendChild(yl);
      const xl = svgel("text", { x: px, y: mT + S + 16, class: "axis", "text-anchor": "middle" });
      xl.textContent = v;
      svg.appendChild(xl);
    }
    // axis titles
    const xt = svgel("text", { x: mL + S / 2, y: height - 6, class: "axis", "text-anchor": "middle" });
    xt.textContent = t("axisX");
    svg.appendChild(xt);
    const yt = svgel("text", {
      x: 12, y: mT + S / 2, class: "axis", "text-anchor": "middle",
      transform: `rotate(-90 12 ${mT + S / 2})`,
    });
    yt.textContent = t("axisY");
    svg.appendChild(yt);

    // the line the whole chart is read against
    svg.appendChild(svgel("line", {
      x1: xs(0), y1: ys(0), x2: xs(MAX), y2: ys(MAX), class: "diagonal",
    }));
    const dLab = MAX * 0.84, dx = xs(dLab), dy = ys(dLab);
    const dl = svgel("text", {
      x: dx, y: dy - 6, class: "eventlabel", "text-anchor": "middle",
      transform: `rotate(-45 ${dx} ${dy - 6})`,
    });
    dl.textContent = t("diagonal");
    svg.appendChild(dl);

    // region labels, out in the unpopulated right-hand strip
    const above = svgel("text", { x: xs(MAX * 0.46), y: ys(MAX * 0.975), class: "regionlabel" });
    above.textContent = t("regionAbove");
    svg.appendChild(above);
    const below = svgel("text", {
      x: xs(MAX * 0.99), y: ys(MAX * 0.21), class: "regionlabel", "text-anchor": "end",
    });
    below.textContent = t("regionBelow");
    svg.appendChild(below);

    // dots — finished filled, still-in-office hollow
    rows.forEach((d) => {
      const c = svgel("circle", {
        cx: xs(d.runway / YEAR_DAYS).toFixed(1),
        cy: ys(d.days / YEAR_DAYS).toFixed(1),
        r: 4,
        class: `dot f-${d.status}` + (d.ongoing ? ` censored c-${d.status}` : ""),
        "data-idx": d._idx, tabindex: 0,
      });
      attachTenureEvents(tip, c, d, d._idx, ttExtra);
      svg.appendChild(c);
    });

    // The SVG has to be in the document before the labels are placed: getBBox()
    // returns zeros for an element that is not being rendered, so measuring while
    // the chart was still detached silently sized every label box 0×0 and the
    // collision tests below could never fire.
    host.appendChild(svg);

    placeNames(svg, rows, (r) => r.over,
      (r) => xs(r.runway / YEAR_DAYS), (r) => ys(r.days / YEAR_DAYS),
      { x0: mL, y0: mT, x1: mL + S, y1: mT + S }, 8);

    const legend = $("#runway-legend");
    legend.textContent = "";
    const item = (swClass, label) => {
      const s = el("span", { class: "item" });
      s.appendChild(el("span", { class: "sw " + swClass }));
      s.appendChild(document.createTextNode(label));
      return s;
    };
    legend.appendChild(item("b-confirmed", t("legendConfirmed")));
    legend.appendChild(item("b-acting", t("legendActing")));
    legend.appendChild(item("ring", t("legendRing")));
  }

  // ------------------------------------------------- acting vs confirmed
  // Two stacked bars. The ordered ramp runs left-early → left-with → outlived,
  // one hue light to dark, because the three outcomes are a sequence rather than
  // unrelated categories.
  function renderActing(rows) {
    const host = $("#acting-host");
    host.textContent = "";
    const groups = [
      { id: "acting", label: t("rowActing"), sel: rows.filter((r) => r.status === "acting") },
      { id: "confirmed", label: t("rowConfirmed"), sel: rows.filter((r) => r.status === "confirmed") },
    ];
    // Floored so the row labels and the segment percentages stay legible; below
    // that the wrapping .scrollx scrolls it, the same way index.html handles its
    // timeline on a narrow screen.
    const width = Math.max(400, (host.clientWidth || 800) - 4);
    const mL = 104, mR = 16, rowH = 46, barH = 26;
    const plotW = width - mL - mR;
    const height = groups.length * rowH + 26;
    const svg = svgel("svg", {
      width, height, viewBox: `0 0 ${width} ${height}`,
      role: "img", "aria-label": t("actingTitle"),
    });

    groups.forEach((g, i) => {
      const y0 = 6 + i * rowH;
      const lbl = svgel("text", { x: mL - 10, y: y0 + barH / 2 + 4, class: "rowlabel", "text-anchor": "end" });
      lbl.textContent = `${g.label} (n=${g.sel.length})`;
      svg.appendChild(lbl);
      let x0 = mL;
      PLACES.forEach((p, pi) => {
        const n = g.sel.filter((r) => r.place === p).length;
        if (!n) return;
        const share = n / g.sel.length;
        const w = share * plotW;
        svg.appendChild(svgel("rect", {
          x: x0.toFixed(1), y: y0, width: Math.max(0.5, w).toFixed(1), height: barH,
          class: "placebar p-" + pi,
        }));
        // Label inside the segment where the text fits, otherwise just below it.
        // The narrow case is not a rounding detail here: the acting row's
        // "outlived it" segment is 2% wide and is the whole point of the chart, so
        // it must carry its number somewhere.
        const pct = Math.round(share * 100);
        const tl = svgel("text", {
          x: (x0 + w / 2).toFixed(1),
          y: w > 34 ? y0 + barH / 2 + 4 : y0 + barH + 12,
          class: "barvalue" + (w > 34 ? (pi === 1 ? " on-mid" : "") : " outside"),
          "text-anchor": "middle",
        });
        tl.textContent = pct + "%";
        svg.appendChild(tl);
        x0 += w;
      });
    });

    // one shared scale label row, since both bars run 0–100%
    const keyY = groups.length * rowH + 14;
    let kx = mL;
    PLACES.forEach((p, pi) => {
      const k = svgel("text", { x: kx, y: keyY, class: "axis" });
      k.textContent = "▪ " + placeShort(p);
      svg.appendChild(k);
      kx += Math.max(96, plotW / 3);
    });
    host.appendChild(svg);
  }

  // --------------------------------------------------- appointment trend
  // Moved here from sheet 1, where it shared a two-column card with the era
  // medians. Both use `resolvedPool` - tenures whose length is not yet knowable
  // are dropped - unlike the runway chart above, which needs the full window.
  //
  // Colour is always the presidential era now. On sheet 1 this scatter honoured
  // the era/duration colour toggle that drives the timeline, but on a chart whose
  // y axis already IS duration, colouring by duration encodes the same variable
  // twice; the toggle stayed behind with the timeline, which genuinely needs it.
  const statsPool = () =>
    resolvedPool().filter((x) => !(state.exclActing && x.acting));

  function renderTrend() {
    const host = $("#scatter-host");
    host.textContent = "";
    const pool = statsPool();
    if (!pool.length) return;
    const width = Math.max(620, (host.clientWidth || 700) - 4);
    const height = 360;
    const mL = 44, mR = 16, mT = 14, mB = 30;
    const plotW = width - mL - mR, plotH = height - mT - mB;
    const yMax = Math.ceil(Math.max(...pool.map((p) => p.days)) / YEAR_DAYS);
    const x = (dateStr) => mL + ((D(dateStr) - T0) / (WINDOW_END - T0)) * plotW;
    const y = (days) => mT + plotH - (days / YEAR_DAYS / yMax) * plotH;

    const svg = svgel("svg", {
      width, height, viewBox: `0 0 ${width} ${height}`,
      role: "img", "aria-label": t("trendTitle"),
    });

    for (let yy = 0; yy <= yMax; yy += 2) {
      const py = y(yy * YEAR_DAYS);
      svg.appendChild(svgel("line", { x1: mL, x2: mL + plotW, y1: py, y2: py, class: "gridline" }));
      const lbl = svgel("text", { x: mL - 8, y: py + 4, class: "axis", "text-anchor": "end" });
      lbl.textContent = yy;
      svg.appendChild(lbl);
    }
    for (let yr = 1995; yr <= WINDOW_END.getFullYear(); yr += 5) {
      const lbl = svgel("text", {
        x: x(`${yr}-01-01`), y: height - 8, class: "axis", "text-anchor": "middle",
      });
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

    pool.forEach((ten) => {
      const era = eraOf(ten.start).id;
      const c = svgel("circle", {
        cx: x(ten.start).toFixed(1), cy: y(ten.days).toFixed(1), r: 4.5,
        class: `dot f-${era}` + (ten.ongoing ? ` censored c-${era}` : ""),
        "data-idx": ten._idx, tabindex: 0,
      });
      attachTenureEvents(tip, c, ten, ten._idx);
      svg.appendChild(c);
    });

    // in the document before measuring, as placeNames requires
    host.appendChild(svg);
    placeNames(svg, pool, (r) => r.days, (r) => x(r.start), (r) => y(r.days),
      { x0: mL, y0: mT, x1: mL + plotW, y1: mT + plotH }, 7);

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
    const width = Math.max(300, (host.clientWidth || 340) - 4);
    const rowH = 34, mL = 110, mR = 64;
    const height = rows.length * rowH + 8;
    const maxV = Math.max(...rows.map((r) => r.med || 0));
    const svg = svgel("svg", {
      width, height, viewBox: `0 0 ${width} ${height}`,
      role: "img", "aria-label": t("eraTitle"),
    });
    rows.forEach((r, i) => {
      const y0 = 4 + i * rowH;
      const lbl = svgel("text", { x: mL - 10, y: y0 + 16, class: "rowlabel", "text-anchor": "end" });
      lbl.textContent = ML.uk() ? r.p.name_uk : r.p.name_en;
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

  // -------------------------------------------------------------- chrome
  function setText(sel, v) {
    const n = $(sel);
    if (n) n.textContent = v;
    else console.warn("runway: missing element", sel);
  }
  function renderChrome(rows) {
    ML.setLang(state.lang);
    document.documentElement.lang = state.lang;
    document.title = t("title");
    setText("#title", t("title"));
    setText("#subtitle", t("subtitle"));
    setText("#sheet-link", t("toIndex"));
    setText("#lang-btn", t("langBtn"));
    setText("#theme-btn", ML.isDark() ? t("themeLight") : t("themeDark"));
    setText("#chart-title", t("chartTitle"));
    setText("#chart-cap", t("chartCap"));
    setText("#acting-title", t("actingTitle"));
    setText("#acting-cap", t("actingCap"));
    setText("#trend-title", t("trendTitle"));
    setText("#trend-cap", t("trendCap"));
    setText("#era-title", t("eraTitle"));
    setText("#era-cap", t("eraCap"));
    setText("#acting-label-txt", t("exclActing"));
    // reflect the stored preference, which the other sheet can have changed
    const chk = $("#acting-chk");
    if (chk) chk.checked = state.exclActing;
    const cut = fmtDate(DATA.meta.analysis_window_end || DATA.meta.built).replace(/\.$/, "");
    setText("#footer-note", STR[state.lang].footer(cut, rows.length, BAND_DAYS));
    setText("#footer-credit", t("credit"));
    const repo = $("#footer-repo");
    if (repo) repo.textContent = t("repo");
  }

  function renderAll() {
    ML.setLang(state.lang);
    const rows = build();
    renderChrome(rows);
    renderSplit(rows);
    renderScatter(rows);
    renderActing(rows);
    renderTrend();
    renderEraBars();
  }

  // -------------------------------------------------------------- events
  $("#lang-btn").addEventListener("click", () => {
    state.lang = state.lang === "uk" ? "en" : "uk";
    ML.saveLang(state.lang);
    renderAll();
  });
  $("#theme-btn").addEventListener("click", () => {
    ML.toggleTheme();
    renderAll();
  });
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
