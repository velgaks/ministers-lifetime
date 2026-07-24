"""Fetch raw officeholder data for Ukrainian minister positions from Wikidata.

Reads data/positions.json for the curated position QIDs, queries the Wikidata
SPARQL endpoint (stdlib only), and writes data/raw.json.

Usage: python pipeline/fetch.py
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = "https://query.wikidata.org/sparql"
# Wikidata asks for a contact in the User-Agent. Set WIKIDATA_CONTACT to your
# own address or URL if you run this yourself.
UA = os.environ.get(
    "WIKIDATA_CONTACT",
    "UkraineMinistersTenure/0.1 (https://github.com/velgaks/ministers-lifetime)",
)

QUERY_TEMPLATE = """
SELECT ?pos ?person ?stmt ?nameEn ?nameUk ?start ?startPrec ?end ?endPrec
       ?nature ?natureLabel ?image ?ukwiki ?enwiki WHERE {{
  VALUES ?pos {{ {values} }}
  ?person p:P39 ?stmt .
  ?stmt ps:P39 ?pos ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL {{ ?stmt pqv:P580 ?sn . ?sn wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec . }}
  OPTIONAL {{ ?stmt pqv:P582 ?en . ?en wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec . }}
  OPTIONAL {{ ?stmt pq:P5102 ?nature . ?nature rdfs:label ?natureLabel FILTER(LANG(?natureLabel)="en") }}
  OPTIONAL {{ ?person rdfs:label ?nameEn FILTER(LANG(?nameEn)="en") }}
  OPTIONAL {{ ?person rdfs:label ?nameUk FILTER(LANG(?nameUk)="uk") }}
  OPTIONAL {{ ?person wdt:P18 ?image }}
  OPTIONAL {{ ?ukArt schema:about ?person ; schema:isPartOf <https://uk.wikipedia.org/> ; schema:name ?ukwiki }}
  OPTIONAL {{ ?enArt schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enwiki }}
}}
"""


def run_query(query: str) -> dict:
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"}
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def main() -> None:
    positions_cfg = json.loads((ROOT / "data" / "positions.json").read_text(encoding="utf-8"))
    pos_qids = sorted({p for lin in positions_cfg["lineages"] for p in lin["positions"]})
    print(f"querying {len(pos_qids)} positions...")

    values = " ".join(f"wd:{q}" for q in pos_qids)
    result = run_query(QUERY_TEMPLATE.format(values=values))

    # One record per P39 statement; multiple images/labels can duplicate rows.
    records: dict[str, dict] = {}
    for b in result["results"]["bindings"]:
        get = lambda k: b[k]["value"] if k in b else None
        stmt = get("stmt")
        rec = records.setdefault(
            stmt,
            {
                "stmt": stmt,
                "position": qid(get("pos")),
                "person": qid(get("person")),
                "name_en": None,
                "name_uk": None,
                "start": None,
                "start_precision": None,
                "end": None,
                "end_precision": None,
                "nature": None,
                "nature_label": None,
                "image": None,
                "ukwiki": None,
                "enwiki": None,
            },
        )
        for field, key in [
            ("name_en", "nameEn"), ("name_uk", "nameUk"),
            ("start", "start"), ("end", "end"),
            ("nature_label", "natureLabel"),
            ("image", "image"), ("ukwiki", "ukwiki"), ("enwiki", "enwiki"),
        ]:
            if rec[field] is None and get(key) is not None:
                rec[field] = get(key)
        for field, key in [("start_precision", "startPrec"), ("end_precision", "endPrec")]:
            if rec[field] is None and get(key) is not None:
                rec[field] = int(get(key))
        if rec["nature"] is None and get("nature") is not None:
            rec["nature"] = qid(get("nature"))

    out = sorted(records.values(), key=lambda r: (r["position"], r["start"] or ""))
    out_path = ROOT / "data" / "raw.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out_path} ({len(out)} statements)")

    by_pos: dict[str, int] = {}
    for r in out:
        by_pos[r["position"]] = by_pos.get(r["position"], 0) + 1
    for p in pos_qids:
        print(f"  {p}: {by_pos.get(p, 0)} statements")


if __name__ == "__main__":
    main()
