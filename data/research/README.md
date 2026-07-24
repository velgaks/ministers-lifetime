# Research source files

Raw output from the Wikipedia research pass that filled the gaps in Wikidata.
These are the **provenance** for `../patches.json`: nine parallel research
agents each covered a group of ministry lineages, reading Ukrainian Wikipedia
list-articles and navbox templates (cross-checked against English Wikipedia and,
for 2025–2026 events, news reports).

Kept because they carry context that did not survive the merge into
`patches.json` — most importantly per-entry `notes` and per-lineage `caveats`
recording **where sources disagree**, which dates are month-precision guesses,
and which gaps are real vacancies versus a ministry that did not exist.

| File | Lineages covered |
|---|---|
| `pm_defense_small.json` | PM, defense, veterans, strategic industries, digital, reintegration, information policy |
| `interior_finance_justice.json` | internal affairs, finance, justice |
| `economy_industry.json` | economy, industrial policy |
| `energy_coal.json` | energy, coal industry |
| `transport_regional_housing.json` | transport/infrastructure, regional development, housing |
| `agrarian_environment.json` | agrarian policy, environment |
| `culture_emergencies_cabmin.json` | culture, emergencies, minister of the Cabinet |
| `education_health.json` | education & science, healthcare |
| `social_youth.json` | social policy, youth & sports |

Schema per file: `{"lineages": {<id>: {"ministers": [{name_uk, name_en, start,
end, acting, notes}], "sources": [url], "caveats": "..."}}}`.

`suggested_patches.json` is not research — it is the generated diff from
`pipeline/reconcile.py` comparing these lists against the dataset (`add` /
`set` / `review_ours` buckets). It is kept as an audit trail of what was
auto-suggested; regenerate any time with:

```bash
python pipeline/reconcile.py data/research
```

Note that not every suggestion was accepted. The reconciler pairs records by
name and date proximity, which mis-paired a handful of cases (e.g. matching a
successor to a predecessor's record); those were dropped or hand-corrected, and
the reasoning is recorded in the corresponding `patches.json` entries.
