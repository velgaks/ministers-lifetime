"""Build the clean ministers dataset from raw Wikidata data + curated files.

Inputs:  data/raw.json, data/positions.json, data/eras.json, data/patches.json
Outputs: data/ministers.json, data/report.md, viz/data.js

Usage: python pipeline/build.py
"""
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEPENDENCE = date(1991, 8, 24)
TODAY = date.today()
MERGE_GAP_DAYS = 31          # same person, same lineage: gaps <= this merge into one tenure
OVERLAP_FLAG_DAYS = 14       # overlaps longer than this are flagged
GAP_FLAG_DAYS = 90           # vacancies longer than this are flagged
ACTING_QIDS = {"Q4676846", "Q96943145"}  # acting, caretaker


def parse_date(value):
    """Wikidata time value '1994-09-16T00:00:00Z' -> date."""
    if not value:
        return None
    return date.fromisoformat(value[:10])


def https(url):
    """Wikidata and Commons hand back http:// image URLs. The published page is
    served over HTTPS, where http subresources are mixed content and some
    browsers refuse them, so normalise on the way out."""
    if url and url.startswith("http://"):
        return "https://" + url[len("http://"):]
    return url


def iso(d):
    return d.isoformat() if d else None


def load_json(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def match_record(rec, match, rec_lineage=None):
    """Does a patch 'match' block select this raw record?"""
    if "stmt" in match and rec["stmt"] != match["stmt"]:
        return False
    if "person" in match and rec["person"] != match["person"]:
        return False
    if "persons" in match and rec["person"] not in match["persons"]:
        return False
    if "position" in match and rec["position"] != match["position"]:
        return False
    if "lineage" in match and rec_lineage != match["lineage"]:
        return False
    return True


def main():
    raw = load_json("raw.json")
    positions_cfg = load_json("positions.json")
    eras = load_json("eras.json")
    # Single source of truth for the analysis cutoff, shared with viz/app.js and
    # analysis/tenure_trends.R so the three cannot drift apart.
    WINDOW_END = date.fromisoformat(eras["analysis_window_end"])
    patches_path = ROOT / "data" / "patches.json"
    patches = (
        json.loads(patches_path.read_text(encoding="utf-8"))["patches"]
        if patches_path.exists()
        else []
    )

    lineages = sorted(positions_cfg["lineages"], key=lambda l: l["order"])
    pos_to_lineage = {p: lin["id"] for lin in lineages for p in lin["positions"]}
    lin_by_id = {lin["id"]: lin for lin in lineages}

    flags = []  # (kind, flag_id, message)
    acks = {p["flag"]: p for p in patches if p["action"] == "ack"}
    used_patches = set()

    def flag(kind, flag_id, message):
        if flag_id in acks:
            used_patches.add(flag_id)
            return
        flags.append((kind, flag_id, message))

    # ---- 1. raw statements -> spells, applying set/remove patches ----------
    spells = []
    for rec in raw:
        rec_lineage = pos_to_lineage.get(rec["position"])
        removed = False
        for p in patches:
            if p["action"] == "remove" and match_record(rec, p["match"], rec_lineage):
                if "start_was" in p and (rec["start"] or "")[:10] != p["start_was"]:
                    continue
                used_patches.add(json.dumps(p["match"], sort_keys=True))
                removed = True
                break
        if removed:
            continue
        rec = dict(rec)
        for p in patches:
            if p["action"] == "set" and match_record(rec, p["match"], rec_lineage):
                # 'set' may pin a specific spell via start_was when a person
                # has several statements for the same position
                if "start_was" in p and (rec["start"] or "")[:10] != p["start_was"]:
                    continue
                rec.update(p["set"])
                if "start" in p["set"]:
                    rec["start_precision"] = 11
                if "end" in p["set"]:
                    rec["end_precision"] = 11
                used_patches.add(json.dumps(p["match"], sort_keys=True))

        lineage = rec.get("lineage") or rec_lineage
        if lineage is None:
            continue  # excluded position
        start, end = parse_date(rec["start"]), parse_date(rec["end"])
        spells.append(
            {
                "lineage": lineage,
                "person": rec["person"],
                "name_en": rec["name_en"],
                "name_uk": rec["name_uk"],
                "start": start,
                "end": end,
                "start_precision": rec.get("start_precision"),
                "end_precision": rec.get("end_precision"),
                "acting": bool(rec.get("acting"))
                or (rec.get("nature") in ACTING_QIDS),
                "image": rec.get("image"),
                "ukwiki": rec.get("ukwiki"),
                "enwiki": rec.get("enwiki"),
                "source": "wikidata",
                "stmt": rec.get("stmt"),
            }
        )

    # ---- 2. 'add' patches (enriched with QID/photo/wiki links if known) -----
    enrich_path = ROOT / "data" / "enrich.json"
    enrich = (
        json.loads(enrich_path.read_text(encoding="utf-8")) if enrich_path.exists() else {}
    )
    for p in patches:
        if p["action"] != "add":
            continue
        extra = enrich.get(p["name_uk"]) or {}
        spells.append(
            {
                "lineage": p["lineage"],
                "person": p.get("person") or extra.get("person"),
                "name_en": p["name_en"] or extra.get("name_en"),
                "name_uk": p["name_uk"],
                "start": date.fromisoformat(p["start"]) if p.get("start") else None,
                "end": date.fromisoformat(p["end"]) if p.get("end") else None,
                "start_precision": 11,
                "end_precision": 11,
                "acting": bool(p.get("acting")),
                "image": p.get("image") or extra.get("image"),
                "ukwiki": p.get("ukwiki") or extra.get("ukwiki"),
                "enwiki": p.get("enwiki") or extra.get("enwiki"),
                "source": p.get("source", "manual"),
                "stmt": None,
            }
        )

    # ---- 3. filter to post-independence ------------------------------------
    kept = []
    for s in spells:
        if s["start"] is None and s["end"] is None:
            flag(
                "undatable",
                f"undatable:{s['lineage']}:{s['person']}",
                f"{s['lineage']}: {s['name_en']} ({s['person']}) has no dates — "
                f"add a 'set' patch with dates or a 'remove' patch",
            )
            continue
        if s["end"] and s["end"] < INDEPENDENCE:
            continue  # pre-independence
        if s["start"] and s["start"] > TODAY:
            continue
        if s["start"] and s["start"] < INDEPENDENCE:
            if s["end"] is None and s["start"] < date(1990, 1, 1):
                continue  # ancient record with no end: pre-independence
            s["clipped_start"] = True
            s["start"] = INDEPENDENCE
        kept.append(s)

    # ---- 4. resolve missing ends: ongoing vs missing-data -------------------
    by_lineage = {}
    for s in kept:
        by_lineage.setdefault(s["lineage"], []).append(s)
    for lin_id, group in by_lineage.items():
        lin = lin_by_id[lin_id]
        max_start = max((s["start"] for s in group if s["start"]), default=None)
        for s in group:
            if s["end"] is None:
                if not lin["defunct"] and s["start"] == max_start:
                    s["ongoing"] = True
                else:
                    flag(
                        "missing-end",
                        f"missing-end:{lin_id}:{s['person']}:{iso(s['start'])}",
                        f"{lin_id}: {s['name_en']} started {iso(s['start'])} but has "
                        f"no end date and is not the current officeholder",
                    )
                    s["drop"] = True
            if s["start"] is None:
                flag(
                    "missing-start",
                    f"missing-start:{lin_id}:{s['person']}:{iso(s['end'])}",
                    f"{lin_id}: {s['name_en']} ended {iso(s['end'])} but has no start date",
                )
                s["drop"] = True
    kept = [s for s in kept if not s.get("drop")]

    # ---- 5. merge continuous same-person spells into tenures ----------------
    def person_key(s):
        return (s["lineage"], s["person"] or s["name_en"])

    def someone_else_between(lin_id, key, gap_start, gap_end):
        """True if another person's spell starts inside the gap (e.g. an acting
        minister served between two spells of the same person)."""
        for o in kept:
            if o["lineage"] != lin_id or person_key(o) == key:
                continue
            if o["start"] and gap_start <= o["start"] <= gap_end:
                return True
        return False

    tenures = []
    by_person_lineage = {}
    for s in kept:
        by_person_lineage.setdefault(person_key(s), []).append(s)
    for (lin_id, _person), group in by_person_lineage.items():
        key = (lin_id, _person)
        group.sort(key=lambda s: s["start"])
        current = None
        for s in group:
            s_end_eff = s["end"] or TODAY
            if current is not None:
                cur_end_eff = current["end"] or TODAY
                gap = (s["start"] - cur_end_eff).days
                if gap <= MERGE_GAP_DAYS and not (
                    gap > 0 and someone_else_between(lin_id, key, cur_end_eff, s["start"])
                ):
                    current["parts"].append(s)
                    if s["end"] is None or (current["end"] is not None and s_end_eff > current["end"]):
                        current["end"] = s["end"] if s["end"] else None
                        current["ongoing"] = s.get("ongoing", False)
                    if current["end"] is not None and s["end"] is not None:
                        current["end"] = max(current["end"], s["end"])
                    continue
                tenures.append(current)
            current = {**s, "parts": [s]}
        if current is not None:
            tenures.append(current)

    for t in tenures:
        # Duplicate raw statements for the same span collapse to one part. Key on
        # the span alone, not the acting flag: an identical span IS the same spell,
        # and Wikidata sometimes carries it twice with the flag set on only one
        # copy. OR the flag so a stale non-acting duplicate cannot mask it.
        by_span = {}
        for p in t["parts"]:
            k = (p["start"], p["end"])
            if k in by_span:
                by_span[k]["acting"] = by_span[k]["acting"] or p["acting"]
            else:
                by_span[k] = dict(p)
        t["parts"] = sorted(by_span.values(), key=lambda p: (p["start"] or "", p["end"] or ""))
        t["acting"] = all(p["acting"] for p in t["parts"])
        t["has_acting_part"] = any(p["acting"] for p in t["parts"])
        t["reappointments"] = len(t["parts"]) - 1
        end_eff = t["end"] or TODAY
        t["days"] = (end_eff - t["start"]).days
        t["ongoing"] = bool(t.get("ongoing"))
        if t["days"] <= 0:
            t["days"] = 1

    # ---- 6. auto-checks ------------------------------------------------------
    by_lineage = {}
    for t in tenures:
        by_lineage.setdefault(t["lineage"], []).append(t)

    for lin in lineages:
        lin_id = lin["id"]
        group = sorted(by_lineage.get(lin_id, []), key=lambda t: t["start"])
        if not group:
            flag("empty", f"empty:{lin_id}", f"{lin_id}: lineage has no records at all")
            continue
        expected_from = (
            date.fromisoformat(lin["expected_from"]) if lin["expected_from"] else group[0]["start"]
        )
        expected_until = (
            date.fromisoformat(lin["expected_until"]) if lin["expected_until"] else TODAY
        )
        # leading gap
        lead = (group[0]["start"] - expected_from).days
        if lead > GAP_FLAG_DAYS:
            flag(
                "gap",
                f"gap:{lin_id}:{iso(expected_from)}",
                f"{lin_id}: first record starts {iso(group[0]['start'])} but ministry "
                f"expected from {iso(expected_from)} ({lead} days uncovered)",
            )
        # pairwise
        for a, b in zip(group, group[1:]):
            a_end = a["end"] or TODAY
            delta = (b["start"] - a_end).days
            if delta < -OVERLAP_FLAG_DAYS:
                flag(
                    "overlap",
                    f"overlap:{lin_id}:{a['person']}:{b['person']}",
                    f"{lin_id}: {a['name_en']} (ends {iso(a['end'])}) overlaps "
                    f"{b['name_en']} (starts {iso(b['start'])}) by {-delta} days",
                )
            elif delta > GAP_FLAG_DAYS:
                flag(
                    "gap",
                    f"gap:{lin_id}:{iso(a_end)}",
                    f"{lin_id}: {delta}-day gap between {a['name_en']} "
                    f"(ends {iso(a['end'])}) and {b['name_en']} (starts {iso(b['start'])})",
                )
        # trailing gap
        last = group[-1]
        last_end = last["end"] or TODAY
        trail = (expected_until - last_end).days
        if trail > GAP_FLAG_DAYS and not last["ongoing"]:
            flag(
                "gap",
                f"gap:{lin_id}:{iso(last_end)}:tail",
                f"{lin_id}: last record ends {iso(last['end'])} but ministry expected "
                f"until {iso(expected_until)} ({trail} days uncovered)",
            )
        # suspicious durations / precision
        for t in group:
            if t["days"] < 7:
                flag(
                    "short",
                    f"short:{lin_id}:{t['person']}:{iso(t['start'])}",
                    f"{lin_id}: {t['name_en']} served only {t['days']} days "
                    f"({iso(t['start'])} – {iso(t['end'])})",
                )
            if t["days"] > 12 * 365:
                flag(
                    "long",
                    f"long:{lin_id}:{t['person']}",
                    f"{lin_id}: {t['name_en']} served {t['days'] / 365.25:.1f} years "
                    f"({iso(t['start'])} – {iso(t['end'])}) — verify",
                )
            for p in t["parts"]:
                if (p.get("start_precision") or 11) < 11 or (
                    p.get("end_precision") or 11
                ) < 11:
                    flag(
                        "precision",
                        f"precision:{lin_id}:{t['person']}:{iso(p['start'])}",
                        f"{lin_id}: {t['name_en']} has non-day date precision "
                        f"(start {p['start_precision']}, end {p['end_precision']})",
                    )

    # unused patches = stale
    for p in patches:
        if p["action"] in ("set", "remove"):
            key = json.dumps(p["match"], sort_keys=True)
            if key not in used_patches:
                flags.append(("stale-patch", f"stale:{key}", f"patch matched nothing: {p}"))
        if p["action"] == "ack" and p["flag"] not in used_patches:
            flags.append(
                ("stale-patch", f"stale-ack:{p['flag']}", f"ack matched no flag: {p['flag']}")
            )

    # ---- 7. stats ------------------------------------------------------------
    # These must agree with analysis/tenure_trends.R. Both apply the same three
    # rules: stop at the analysis window end rather than the collection date,
    # exclude the intake seated on that date, and attribute an appointment to the
    # president whose term began most recently before it.
    presidents = eras["presidents"]

    def era_of(d):
        """The president in office on date d. Take the term that began most
        recently before d - matching start-and-end and returning the first hit
        credited anyone appointed exactly on a transition day (Avakov, 22 Feb
        2014) to the OUTGOING president."""
        hit = None
        for pr in presidents:
            if date.fromisoformat(pr["start"]) <= d:
                hit = pr["id"]
        return hit or presidents[0]["id"]

    def median(xs):
        xs = sorted(xs)
        n = len(xs)
        if n == 0:
            return None
        return (xs[n // 2] if n % 2 == 1 else (xs[n // 2 - 1] + xs[n // 2]) / 2)

    # Recompute duration against the window end, not TODAY: a tenure still
    # running at the cutoff is measured to the cutoff.
    def windowed(t):
        end_eff = min(t["end"] or WINDOW_END, WINDOW_END)
        return {
            **t,
            "days": max(1, (end_eff - t["start"]).days),
            "ongoing": not (t["end"] and t["end"] <= WINDOW_END),
        }

    # Drop tenures whose length is not yet knowable: still running at the cutoff
    # AND begun within the final year, so they could not have reached a year even
    # in principle. Same rule as analysis/tenure_trends.R's `resolved`, so the two
    # report identical n.
    minister_tenures = [
        w
        for w in (
            windowed(t)
            for t in tenures
            if t["lineage"] != "pm" and t["start"] < WINDOW_END
        )
        if not (w["ongoing"] and w["start"] > WINDOW_END - timedelta(days=365))
    ]

    def block(sel):
        days = [t["days"] for t in sel]
        return {
            "n": len(sel),
            "n_censored": sum(1 for t in sel if t["ongoing"]),
            "median_days": median(days),
            "mean_days": round(sum(days) / len(days), 1) if days else None,
        }

    stats = {
        "_comment": (
            "Ministers only (prime ministers excluded). Window ends "
            f"{iso(WINDOW_END)}; tenures beginning on or after that date are "
            "excluded and ones still running at it are measured to it. Matches "
            "analysis/output/q1_by_president.csv."
        ),
        "window_end": iso(WINDOW_END),
        "by_president": [
            {"id": pr["id"], **block([t for t in minister_tenures
                                     if era_of(t["start"]) == pr["id"]])}
            for pr in presidents
        ],
        "by_period": [
            {"id": p["id"], **block([
                t for t in minister_tenures
                if date.fromisoformat(p["start"]) <= t["start"]
                and (p["end"] is None or t["start"] < date.fromisoformat(p["end"]))
            ])}
            for p in eras.get("periods", [])
        ],
        "overall": block(minister_tenures),
    }

    # ---- 8. outputs ------------------------------------------------------------
    def tenure_out(t):
        return {
            "lineage": t["lineage"],
            "person": t["person"],
            "name_en": t["name_en"],
            "name_uk": t["name_uk"],
            "start": iso(t["start"]),
            "end": iso(t["end"]),
            "days": t["days"],
            "ongoing": t["ongoing"],
            "acting": t["acting"],
            "has_acting_part": t["has_acting_part"],
            "reappointments": t["reappointments"],
            "clipped_start": bool(t.get("clipped_start")),
            "image": https(t["image"]),
            "ukwiki": t["ukwiki"],
            "enwiki": t["enwiki"],
            "source": t["source"],
            "parts": [
                {
                    "start": iso(p["start"]),
                    "end": iso(p["end"]),
                    "acting": p["acting"],
                }
                for p in t["parts"]
            ],
        }

    tenures_sorted = sorted(
        tenures, key=lambda t: (lin_by_id[t["lineage"]]["order"], t["start"])
    )
    out = {
        "meta": {
            "built": iso(TODAY),
            "independence": iso(INDEPENDENCE),
            # Consumers should prefer this over 'built' when computing
            # statistics; see eras.analysis_window_end for why it exists.
            "analysis_window_end": iso(WINDOW_END),
            "n_tenures": len(tenures),
            "n_flags": len(flags),
            "source": "Wikidata + manual patches (see data/patches.json)",
        },
        "lineages": [
            {
                "id": l["id"],
                "order": l["order"],
                "name_en": l["name_en"],
                "name_uk": l["name_uk"],
                "defunct": l["defunct"],
                "note_en": l.get("note_en"),
                "note_uk": l.get("note_uk"),
            }
            for l in lineages
        ],
        "eras": eras,
        "stats": stats,
        "tenures": [tenure_out(t) for t in tenures_sorted],
    }
    (ROOT / "data" / "ministers.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (ROOT / "viz" / "data.js").parent.mkdir(exist_ok=True)
    (ROOT / "viz" / "data.js").write_text(
        "window.MINISTERS_DATA = " + json.dumps(out, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    # report
    lines = [
        "# Data audit report",
        "",
        f"Built {iso(TODAY)}. {len(tenures)} tenures, {len(flags)} open flags.",
        "",
    ]
    order = ["empty", "undatable", "missing-start", "missing-end", "overlap", "gap",
             "short", "long", "precision", "stale-patch"]
    for kind in order:
        sel = [f for f in flags if f[0] == kind]
        if not sel:
            continue
        lines.append(f"## {kind} ({len(sel)})")
        lines.append("")
        for _, fid, msg in sel:
            lines.append(f"- `{fid}`\n  {msg}")
        lines.append("")
    if not flags:
        lines.append("No open flags. ✔")
    (ROOT / "data" / "report.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"tenures: {len(tenures)} | flags: {len(flags)}")
    by_kind = {}
    for k, _, _ in flags:
        by_kind[k] = by_kind.get(k, 0) + 1
    for k, n in sorted(by_kind.items()):
        print(f"  {k}: {n}")


if __name__ == "__main__":
    main()
