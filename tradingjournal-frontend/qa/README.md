# QA Playwright scripts

Plain `.mjs` scripts driven by the `playwright` npm package directly (no test runner).
Headed mode, real browser, run against a real backend — not mocks.

## Setup

1. `QA_PASSWORD` env var must be set to the real password for the `qa@wisenancial.test` /
   `qafree@wisenancial.test` accounts before running `auth.setup.mjs`. Never hardcode it in
   a script — it's read from the environment on purpose so it can't end up committed.

   ```
   QA_PASSWORD=... node qa/auth.setup.mjs
   ```

   This logs in both accounts via the real UI and saves `storageState` to `qa/.auth/`
   (`.gitignore`d — contains live JWTs) so the other scripts can reuse the session instead
   of logging in every time. The access token is short-lived (~15 min); rerun
   `auth.setup.mjs` if a script starts failing with 401s.

2. Run any other script directly, e.g. `node qa/1-priority-sell.mjs`.

## Notes

- `qa/logs/` and `qa/screenshots/` are run output, `.gitignore`d — may contain real qa@
  account data, not meant to be committed.
- `qa/fixtures/*.csv` are small synthetic CSVs for import testing — safe to commit, no
  real data.
- Data mutations from these scripts must stay restricted to `qa@wisenancial.test` /
  `qafree@wisenancial.test` — the backend is connected to the production database.
