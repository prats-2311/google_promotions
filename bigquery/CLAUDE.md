# BigQuery — tour_intelligence dataset conventions

Dataset `tour_intelligence`, `US` multi-region, project `liifecalling-academy`. 7 tables: `cities`, `culture_notes`, `fan_signals`, `local_delight`, `campaigns`, `campaign_stops`, `city_briefs`. Schema in `schema.sql`, seed data in `seed/*.jsonl` (5 demo cities: Mumbai, London, Tokyo, São Paulo, New York), loaded via `load_seed_data.sh <project_id>`.

## Streaming inserts, not batch load
`city_briefs` rows are written via `insert_rows_json` (streaming insert), not a batch load job. This means:
- A row that was just inserted sits in the **streaming buffer for up to ~90 minutes**, during which `UPDATE`/`DELETE` against it fails with `would affect rows in the streaming buffer, which is not supported`. This is a normal, temporary BigQuery limitation — don't try to "fix" it by switching insert mode without a real reason; just wait, or query around it.
- Reruns can produce **more than one row per `(campaign_id, city_id)`** — always query with `QUALIFY ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY generated_at DESC) = 1` (see the `/city_briefs` GET route in `tour_data_api/main.py`) rather than assuming one row per city. A `NULL generated_at` (e.g. a malformed test row) sorts after real timestamps in `DESC` order, so it won't accidentally win the "most recent" comparison — but don't rely on that as a substitute for cleaning up stray rows.

## IAM — dataset-level ACL, not project-level roles
- `tour-data-api-sa` gets a **custom minimal role** (`projects/liifecalling-academy/roles/tourDataApiDataAccess`: `bigquery.datasets.get`, `bigquery.tables.get`, `bigquery.tables.getData`, `bigquery.tables.updateData` — no schema create/delete/alter/export), applied via the dataset's `access` array, not a predefined role like `roles/bigquery.dataEditor` or `WRITER`. The predefined roles are broader than this service ever needs (it only ever runs `SELECT`s and one streaming `INSERT`).
- `bq add-iam-policy-binding` at the **dataset level** isn't allowlisted for this project ("This feature requires allowlisting") — instead manipulate the dataset's `access` array directly: `bq show --format=prettyjson <project>:<dataset>` → edit the `access` list → `bq update <project>:<dataset> <edited-json-file>`.
- `roles/bigquery.jobUser` at the **project level** is the one unavoidable project-level grant for `tour-data-api-sa` — BigQuery query jobs are project-scoped by nature, there's no resource-level equivalent.

## Adding a new demo city
1. Insert a row into `cities` (and `campaign_stops` if it's part of a campaign's route).
2. Curated `culture_notes`/`fan_signals`/`local_delight` rows are optional — if omitted, the live system correctly falls back to Parallel Search via `tour_data_api`'s `/live_culture_search` route (see `/cloud_run/tour_data_api/CLAUDE.md`) rather than failing or hallucinating. Don't feel obligated to hand-curate every new city; that fallback is the point of the Parallel integration.
