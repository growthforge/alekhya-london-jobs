# Alekhya Bheema · London job search

A static, mobile-first job-search cockpit (GitHub Pages, no build step, no tracking).
Live URL once published: https://growthforge.github.io/alekhya-london-jobs/

| Tab | What it does |
|---|---|
| Today | Open-all hot links (Primary / Backup, 24 h · 3 days · 7 days), daily checklist, outreach-timing calculator |
| Fresh jobs | Auto-refreshed list from `data/jobs.json` (GitHub Action, weekdays 06:15 UTC) |
| Roles & links | 11 target roles × 18 UK sources, date-sorted, London + ~20 miles |
| Process | 9 stages, each with its copy-ready prompts |
| Prompts | 16 prompts incl. the exact Notion master tailor prompt and Alekhya's version |
| Outreach | 12 strategies with templates; next UK working day 08:00–09:00 calculator (.ics / Google Calendar) |
| Tracker | Browser-only tracker, CSV export/import; Excel (formulas), CSV and Notion templates |
| CV | Two CV versions (PDF / Word) with previews |
| LinkedIn | Profile rewrite, step by step |
| Toolkit | AI hygiene, tools, communities, recruiters, downloads, Flux Career (coming soon) |

## Settings
`config.js`: `SHOW_CONTACT` (phone/email + full CV files), `FLUX_URL` (null = "coming soon").

## Fresh jobs feed
`scripts/fetch_jobs.py` (stdlib only) queries Adzuna, Reed, Jooble and public company careers boards
(Greenhouse / Lever / Ashby in `data/ats_companies.json`), then filters: target titles only, full-time
permanent, London + ~20 miles, posted in the last 3 days, no senior/lead/manager/architect/developer,
no contract/part-time/intern, no clearance roles, no jobs at Salesforce itself, deduplicated.

Repository secrets (Settings → Secrets and variables → Actions):
- `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (https://developer.adzuna.com/signup)
- `REED_API_KEY` (https://www.reed.co.uk/developers/jobseeker)
- `JOOBLE_API_KEY` optional (https://jooble.org/api/about)

Without keys only the company careers boards run. Tests: `python3 tests/test_filters.py`.

## Local preview
`python3 -m http.server 8000` in this folder, then open http://localhost:8000/
