"""Look up Wikidata QID, photo and Wikipedia links for manually-added ministers.

Reads data/ministers.json (run build.py first), finds tenures without a person
QID, searches Wikidata by Ukrainian name, and writes data/enrich.json which
build.py merges on the next run.

Usage: python pipeline/enrich.py
"""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://www.wikidata.org/w/api.php"
# Wikidata asks for a contact in the User-Agent. Set WIKIDATA_CONTACT to your
# own address or URL if you run this yourself.
UA = os.environ.get(
    "WIKIDATA_CONTACT",
    "UkraineMinistersTenure/0.1 (https://github.com/velgaks/ministers-lifetime)",
)


def api_get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    ministers = json.loads((ROOT / "data" / "ministers.json").read_text(encoding="utf-8"))
    enrich_path = ROOT / "data" / "enrich.json"
    enrich = (
        json.loads(enrich_path.read_text(encoding="utf-8")) if enrich_path.exists() else {}
    )

    names = {}
    for t in ministers["tenures"]:
        if not t["person"] and t["name_uk"]:
            cached = enrich.get(t["name_uk"])
            if cached and cached.get("person"):
                continue
            names[t["name_uk"]] = t["name_en"]
    print(f"{len(names)} names to look up")

    for name, name_en in sorted(names.items()):
        # Wikidata uk labels are usually 'Surname Firstname Patronymic';
        # research lists often use 'Firstname Surname' — try several variants.
        toks = name.split()
        variants = [name]
        if len(toks) == 2:
            variants.append(f"{toks[1]} {toks[0]}")
        elif len(toks) == 3:
            variants += [f"{toks[1]} {toks[0]}", f"{toks[0]} {toks[1]}"]
        if name_en:
            variants.append(name_en)
        found = []
        for i, (variant, lang) in enumerate(
            [(v, "uk") for v in variants if v != name_en] + ([(name_en, "en")] if name_en else [])
        ):
            try:
                found = api_get(
                    {
                        "action": "wbsearchentities",
                        "search": variant,
                        "language": lang,
                        "type": "item",
                        "limit": 5,
                    }
                )["search"]
            except Exception as e:
                print(f"  !! search failed for {variant}: {e}")
                found = []
            if found:
                break
            time.sleep(0.2)
        picked = None
        for cand in found:
            try:
                ent = api_get(
                    {
                        "action": "wbgetentities",
                        "ids": cand["id"],
                        "props": "claims|sitelinks|labels",
                        "languages": "en|uk",
                    }
                )["entities"][cand["id"]]
            except Exception:
                continue
            claims = ent.get("claims", {})
            instance = {
                s["mainsnak"]["datavalue"]["value"]["id"]
                for s in claims.get("P31", [])
                if s["mainsnak"].get("datavalue")
            }
            if "Q5" not in instance:
                continue
            image = None
            if claims.get("P18"):
                snak = claims["P18"][0]["mainsnak"]
                if snak.get("datavalue"):
                    fname = snak["datavalue"]["value"]
                    image = (
                        "http://commons.wikimedia.org/wiki/Special:FilePath/"
                        + urllib.parse.quote(fname.replace(" ", "_"))
                    )
            sl = ent.get("sitelinks", {})
            picked = {
                "person": cand["id"],
                "name_en": ent.get("labels", {}).get("en", {}).get("value"),
                "image": image,
                "ukwiki": sl.get("ukwiki", {}).get("title"),
                "enwiki": sl.get("enwiki", {}).get("title"),
                "_desc": cand.get("description"),
            }
            break
        enrich[name] = picked or {"person": None, "_desc": "NOT FOUND"}
        state = picked["person"] if picked else "not found"
        print(f"  {name} -> {state}")
        time.sleep(0.4)

    enrich_path.write_text(json.dumps(enrich, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {enrich_path}")


if __name__ == "__main__":
    main()
