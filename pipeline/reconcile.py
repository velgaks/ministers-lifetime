"""Compare researched minister lists (from Wikipedia) with the current dataset
and emit suggested patches for review.

Inputs:  research JSON files (each {"lineages": {id: {"ministers": [...], "sources": [...]}}}),
         data/ministers.json (run build.py first)
Output:  suggested_patches.json next to the research files.

Usage: python pipeline/reconcile.py <research_dir>
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATE_TOLERANCE_DAYS = 14
MATCH_WINDOW_DAYS = 400   # same-person spells paired if starts within this
SAME_SPELL_DAYS = 7       # same lineage + start within this = same record


def norm(s):
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r"[’'ʼ`´\-\.]", "", s)
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def tokens(s):
    return set(norm(s).split(" ")) - {""}


def same_person(a_uk, a_en, b_uk, b_en):
    """True if two (uk, en) name pairs plausibly denote the same person."""
    for a, b in ((a_uk, b_uk), (a_en, b_en), (a_uk, b_en), (a_en, b_uk)):
        ta, tb = tokens(a), tokens(b)
        if not ta or not tb:
            continue
        if norm(a) == norm(b):
            return True
        if len(ta & tb) >= 2:
            return True
    return False


def d(s):
    return date.fromisoformat(s) if s else None


def days_between(a, b):
    return abs((d(a) - d(b)).days) if a and b else 10 ** 6


def main():
    research_dir = Path(sys.argv[1])
    ministers = json.loads((ROOT / "data" / "ministers.json").read_text(encoding="utf-8"))
    # Compare against SUB-SPELLS, not merged tenures: build.py merges a person's
    # consecutive spells (e.g. acting then confirmed) into one tenure, while
    # research lists record them separately. Matching on parts keeps the two
    # views comparable — otherwise every acting->full promotion reads as a diff.
    ours_by_lineage = {}
    for t in ministers["tenures"]:
        for p in t["parts"]:
            ours_by_lineage.setdefault(t["lineage"], []).append({
                **t,
                "start": p["start"],
                "end": p["end"],
                "acting": p["acting"],
                "parts": [p],
                "_merged_span": (t["start"], t["end"]),
            })

    research, sources = {}, {}
    for f in sorted(research_dir.glob("*.json")):
        if f.name == "suggested_patches.json":
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        for lin_id, block in data.get("lineages", {}).items():
            research[lin_id] = block["ministers"]
            sources[lin_id] = block.get("sources", [])

    out = {"add": [], "set": [], "review_ours": [], "review_research": []}

    for lin_id, res_list in research.items():
        ours = ours_by_lineage.get(lin_id, [])
        # ---- pair research entries to our tenures ----
        pairs = {}  # id(our) -> [research entries]
        unmatched_research = []
        for rm in res_list:
            if not rm.get("start"):
                out["review_research"].append({"lineage": lin_id, "entry": rm, "why": "no start date"})
                continue
            cands = [
                t for t in ours
                if same_person(t["name_uk"], t["name_en"], rm.get("name_uk"), rm.get("name_en"))
                or days_between(t["start"], rm["start"]) <= SAME_SPELL_DAYS
            ]
            best = None
            if cands:
                best = min(cands, key=lambda t: days_between(t["start"], rm["start"]))
                if days_between(best["start"], rm["start"]) > MATCH_WINDOW_DAYS:
                    best = None
            if best is None:
                unmatched_research.append(rm)
            else:
                pairs.setdefault(id(best), []).append(rm)

        matched = set(pairs.keys())
        by_id = {id(t): t for t in ours}

        for oid, rms in pairs.items():
            our = by_id[oid]
            # research entry whose start is closest to ours anchors the 'set';
            # any additional entries for the same tenure become 'add' spells
            rms.sort(key=lambda rm: days_between(our["start"], rm["start"]))
            anchor, extras = rms[0], rms[1:]

            set_fields = {}
            if days_between(our["start"], anchor["start"]) > DATE_TOLERANCE_DAYS:
                set_fields["start"] = anchor["start"] + "T00:00:00Z"
            r_end, o_end = anchor.get("end"), our["end"]
            if r_end and o_end and days_between(o_end, r_end) > DATE_TOLERANCE_DAYS:
                set_fields["end"] = r_end + "T00:00:00Z"
            if r_end and o_end is None:
                set_fields["end"] = r_end + "T00:00:00Z"
            if bool(anchor.get("acting")) and not our["acting"]:
                set_fields["acting"] = True
            if set_fields:
                out["set"].append({
                    "action": "set",
                    "match": {"person": our["person"], "lineage": lin_id},
                    "start_was": our["parts"][0]["start"],
                    "set": set_fields,
                    "_ours": f"{our['name_en']} {our['start']}–{our['end']}",
                    "_research": f"{anchor.get('start')}–{anchor.get('end')} acting={anchor.get('acting')}",
                    "source": "; ".join(sources.get(lin_id, [])[:2]),
                })
            for rm in extras:
                unmatched_research.append(rm)

        for rm in unmatched_research:
            out["add"].append({
                "action": "add",
                "lineage": lin_id,
                "person": None,
                "name_en": rm.get("name_en"),
                "name_uk": rm.get("name_uk"),
                "start": rm.get("start"),
                "end": rm.get("end"),
                "acting": bool(rm.get("acting")),
                "source": "; ".join(sources.get(lin_id, [])[:2]),
                "note": rm.get("notes") or None,
            })

        for t in ours:
            if id(t) not in matched:
                out["review_ours"].append({
                    "lineage": lin_id,
                    "who": f"{t['name_en']} / {t['name_uk']}",
                    "person": t["person"],
                    "span": f"{t['start']}–{t['end']}",
                    "why": "in our data but not matched to any research entry",
                })

    dest = research_dir / "suggested_patches.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"wrote {dest}: add={len(out['add'])} set={len(out['set'])} "
        f"review_ours={len(out['review_ours'])} review_research={len(out['review_research'])}"
    )


if __name__ == "__main__":
    main()
