#!/usr/bin/env python3
"""Fresh jobs feed for Alekhya Bheema (London, full-time, permanent).

Runs daily in GitHub Actions and writes data/jobs.json.
Sources (all official APIs or public job-board APIs, no scraping):
  - Adzuna API          needs secrets ADZUNA_APP_ID + ADZUNA_APP_KEY  (https://developer.adzuna.com)
  - Reed Jobseeker API  needs secret  REED_API_KEY                   (https://www.reed.co.uk/developers/jobseeker)
  - Jooble API          optional secret JOOBLE_API_KEY                (https://jooble.org/api/about)
  - Company ATS boards  no key: Greenhouse, Lever, Ashby public posting APIs (companies in data/ats_companies.json)
A source without its keys is skipped and reported as "inactive" in jobs.json.
Filters: target titles only; full-time permanent; London + ~20 miles; posted within MAX_DAYS;
excludes senior/lead/principal/manager-level, contract/interim/fixed-term/part-time, developer/architect,
internships, security-clearance roles, and sales jobs AT Salesforce. Deduplicated on title+company.
Standard library only.
"""
import base64, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "jobs.json"
ATS = ROOT / "data" / "ats_companies.json"
MAX_DAYS = int(os.environ.get("MAX_DAYS", "3"))
KEEP_DAYS = 7
UA = "alekhya-london-jobs/1.0 (+https://growthforge.github.io/alekhya-london-jobs/)"
NOW = dt.datetime.now(dt.timezone.utc)

# ---------- role definitions (title patterns) ----------
ROLES = [
 ("P1", "Salesforce Business Analyst", ["salesforce business analyst", "crm business analyst"], r"\b(salesforce|crm)\b.*\b(business|functional) analyst\b|\bsalesforce ba\b|\bbusiness analyst\b.*\b(salesforce|crm)\b", False),
 ("P2", "Salesforce Functional Consultant", ["salesforce consultant", "salesforce functional consultant"], r"\bsalesforce\b.*\bconsultant\b|\b(sales|service) cloud consultant\b", False),
 ("P3", "Salesforce Administrator", ["salesforce administrator", "crm administrator"], r"\bsalesforce\b.*\badmin(istrator)?\b|\bcrm admin(istrator)?\b", False),
 ("P4", "Salesforce Field Service", ["field service lightning", "salesforce field service"], r"\bfield service (lightning|consultant)\b|\bfsl\b|\bsalesforce field service\b", False),
 ("P5", "CRM Systems Analyst", ["crm analyst", "crm systems analyst"], r"\bcrm (systems )?analyst\b|\bcrm systems (officer|specialist)\b", True),
 ("B1", "Business Analyst", ["business analyst", "business systems analyst"], r"\b(it |digital |technical |business systems |systems )?business analyst\b|\bbusiness systems analyst\b", False),
 ("B2", "Project Coordinator / PMO", ["project coordinator", "pmo analyst", "project analyst"], r"\bproject co-?ordinator\b|\bpmo (analyst|officer|coordinator|co-ordinator)\b|\bproject (analyst|support officer)\b|\bjunior project manager\b", False),
 ("B3", "UAT / Test Analyst", ["uat analyst", "test analyst", "salesforce tester"], r"\buat (analyst|tester|test analyst)\b|\btest analyst\b|\bqa analyst\b|\bsalesforce (tester|qa)\b", False),
 ("B4", "Implementation Consultant", ["implementation consultant", "implementation specialist"], r"\bimplementation (consultant|specialist|analyst)\b|\bonboarding (consultant|specialist)\b", False),
 ("B5", "CRM / Database Officer", ["crm officer", "database officer", "crm executive"], r"\bcrm (officer|executive|coordinator|co-ordinator|assistant)\b|\bdatabase officer\b|\bbusiness systems officer\b", False),
 ("B6", "Sales / RevOps Analyst", ["sales operations analyst", "revenue operations analyst"], r"\b(sales|revenue) op(eration)?s analyst\b|\brevops analyst\b", True),
]
ROLE_RE = [(rid, label, re.compile(rx, re.I), needs_sf) for rid, label, _, rx, needs_sf in ROLES]
ALLOW_DESPITE_EXCLUDE = re.compile(r"\bjunior project manager\b", re.I)
EXCLUDE_TITLE = re.compile(
  r"\b(senior|snr|sr\.?|lead|principal|head|director|manager|vp|chief|architect|developer|engineer|apex|lwc|"
  r"intern|internship|apprentice|apprenticeship|placement|graduate scheme|trainee|"
  r"contract|contractor|interim|fixed[- ]term|ftc|temporary|temp|freelance|part[- ]time|"
  r"sc cleared|dv cleared|security clear|clearance|"
  r"account executive|sales executive|account director|account manager|customer success|business development|sdr|bdr)\b", re.I)
CONTRACT_TEXT = re.compile(r"\b(per day|day rate|p/d|£\s?\d{3,4}\s?(pd|/day|per day)|inside ir35|outside ir35|fixed[- ]term|ftc|maternity cover|\d+[- ]month contract)\b", re.I)
CLEARANCE_TEXT = re.compile(r"\b(sc|dv|edv|npvv|nppv)\s*(clearance|cleared)\b|\bsecurity clearance (is )?(required|essential)\b|\bmust (hold|have) (active )?(sc|dv)\b", re.I)
SALESFORCE_EMPLOYER = re.compile(r"^\s*salesforce(\.com)?(,? inc\.?| uk| ltd| limited)?\s*$", re.I)
NEAR = ["london", "city of london", "westminster", "canary wharf", "stratford", "croydon", "kingston", "richmond", "wimbledon",
        "harrow", "wembley", "uxbridge", "ealing", "hammersmith", "chiswick", "brentford", "hounslow", "heathrow", "twickenham",
        "sutton", "bromley", "lewisham", "greenwich", "woolwich", "ilford", "romford", "barking", "enfield", "barnet", "watford",
        "st albans", "borehamwood", "potters bar", "hatfield", "staines", "epsom", "leatherhead", "redhill", "reigate", "dartford",
        "brentwood", "orpington", "slough"]
FAR_REMOTE_ONLY = re.compile(r"^\s*(remote|united kingdom|uk|england)\s*$", re.I)


def get(url, headers=None, data=None, timeout=30):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, data=data)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(3 * (attempt + 1)); continue
            raise
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(3); continue
            raise


def parse_date(v):
    if not v:
        return None
    v = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(v[:10], fmt).replace(tzinfo=dt.timezone.utc)
        except ValueError:
            pass
    try:
        if re.fullmatch(r"\d{12,13}", v):
            return dt.datetime.fromtimestamp(int(v) / 1000, dt.timezone.utc)
        return dt.datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except ValueError:
        return None


def clean_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def near_london(loc):
    l = (loc or "").lower()
    if not l or FAR_REMOTE_ONLY.match(l):
        return False
    return any(re.search(r"\b" + re.escape(n) + r"\b", l) for n in NEAR)


def classify(title, desc):
    t = title or ""
    if EXCLUDE_TITLE.search(t) and not ALLOW_DESPITE_EXCLUDE.search(t):
        return None, "excluded title"
    hits = []
    for rid, label, rx, needs_sf in ROLE_RE:
        if rx.search(t):
            if needs_sf and not re.search(r"salesforce", t + " " + (desc or ""), re.I):
                continue
            hits.append(rid)
    if not hits:
        return None, "not a target title"
    return hits, None


def norm_company(c):
    c = (c or "").lower()
    c = re.sub(r"\b(ltd|limited|plc|llp|inc|group|uk|recruitment|the)\b|[^a-z0-9 ]", " ", c)
    return re.sub(r"\s+", " ", c).strip()


def norm_title(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (t or "").lower())).strip()


def make(source, title, company, location, url, posted, desc="", smin=None, smax=None, salary_text="", contract=None, hours=None):
    return dict(source=source, title=(title or "").strip(), company=(company or "").strip() or "Not stated",
                location=(location or "").strip(), url=url, posted=posted.isoformat() if posted else None,
                desc=clean_html(desc)[:600], salary_min=smin, salary_max=smax, salary_text=salary_text,
                contract=contract, hours=hours)

# ---------- sources ----------

def src_adzuna(log):
    app_id, key = os.environ.get("ADZUNA_APP_ID"), os.environ.get("ADZUNA_APP_KEY")
    if not (app_id and key):
        return [], "inactive: add repo secrets ADZUNA_APP_ID and ADZUNA_APP_KEY"
    out = []
    for _, _, phrases, _, _ in ROLES:
        for ph in phrases:
            q = urllib.parse.urlencode({"app_id": app_id, "app_key": key, "what_phrase": ph, "where": "London",
                                        "distance": 32, "max_days_old": MAX_DAYS, "sort_by": "date", "full_time": 1,
                                        "permanent": 1, "results_per_page": 50, "content-type": "application/json"})
            d = get(f"https://api.adzuna.com/v1/api/jobs/gb/search/1?{q}")
            for r in d.get("results", []):
                if r.get("contract_type") == "contract" or r.get("contract_time") == "part_time":
                    continue
                out.append(make("Adzuna", r.get("title"), (r.get("company") or {}).get("display_name"),
                                (r.get("location") or {}).get("display_name"), r.get("redirect_url"), parse_date(r.get("created")),
                                r.get("description"), r.get("salary_min"), r.get("salary_max"),
                                contract=r.get("contract_type"), hours=r.get("contract_time")))
            time.sleep(1.2)
    return out, f"ok ({len(out)} raw)"


def src_reed(log):
    key = os.environ.get("REED_API_KEY")
    if not key:
        return [], "inactive: add repo secret REED_API_KEY"
    auth = "Basic " + base64.b64encode(f"{key}:".encode()).decode()
    out = []
    for _, _, phrases, _, _ in ROLES:
        for ph in phrases:
            q = urllib.parse.urlencode({"keywords": ph, "locationName": "London", "distanceFromLocation": 20,
                                        "permanent": "true", "fullTime": "true", "resultsToTake": 100})
            d = get(f"https://www.reed.co.uk/api/1.0/search?{q}", headers={"Authorization": auth})
            for r in d.get("results", []):
                smin, smax = r.get("minimumSalary"), r.get("maximumSalary")
                out.append(make("Reed", r.get("jobTitle"), r.get("employerName"), r.get("locationName"), r.get("jobUrl"),
                                parse_date(r.get("date")), r.get("jobDescription"), smin, smax,
                                contract="permanent", hours="full_time"))
            time.sleep(0.6)
    return out, f"ok ({len(out)} raw)"


def src_jooble(log):
    key = os.environ.get("JOOBLE_API_KEY")
    if not key:
        return [], "inactive (optional): add repo secret JOOBLE_API_KEY"
    out = []
    for _, _, phrases, _, _ in ROLES:
        for ph in phrases:
            body = json.dumps({"keywords": ph, "location": "London", "radius": "30", "page": "1"}).encode()
            d = get(f"https://jooble.org/api/{key}", headers={"Content-Type": "application/json"}, data=body)
            for r in d.get("jobs", []):
                typ = (r.get("type") or "").lower()
                if typ and ("full" not in typ and "perm" not in typ):
                    continue
                out.append(make("Jooble", r.get("title"), r.get("company"), r.get("location"), r.get("link"),
                                parse_date(r.get("updated")), r.get("snippet"), salary_text=r.get("salary") or ""))
            time.sleep(1)
    return out, f"ok ({len(out)} raw)"


def src_ats(log):
    try:
        companies = json.loads(ATS.read_text())
    except FileNotFoundError:
        return [], "inactive: data/ats_companies.json missing"
    out, errs = [], []
    for c in companies:
        name, kind, tok = c["name"], c["ats"], c["token"]
        try:
            if kind == "greenhouse":
                d = get(f"https://boards-api.greenhouse.io/v1/boards/{tok}/jobs?content=true")
                for r in d.get("jobs", []):
                    out.append(make(f"{name} (careers)", r.get("title"), name, (r.get("location") or {}).get("name"),
                                    r.get("absolute_url"), parse_date(r.get("updated_at")), r.get("content")))
            elif kind == "lever":
                d = get(f"https://api.lever.co/v0/postings/{tok}?mode=json")
                for r in d:
                    cat = r.get("categories") or {}
                    out.append(make(f"{name} (careers)", r.get("text"), name, cat.get("location"), r.get("hostedUrl"),
                                    parse_date(r.get("createdAt")), r.get("descriptionPlain"), hours=(cat.get("commitment") or "").lower()))
            elif kind == "ashby":
                d = get(f"https://api.ashbyhq.com/posting-api/job-board/{tok}")
                for r in d.get("jobs", []):
                    out.append(make(f"{name} (careers)", r.get("title"), name, r.get("location"), r.get("jobUrl"),
                                    parse_date(r.get("publishedAt")), r.get("descriptionPlain"), hours=(r.get("employmentType") or "").lower()))
        except Exception as e:  # one broken board must not stop the run
            errs.append(f"{name}: {e.__class__.__name__}")
    status = f"ok ({len(out)} raw from {len(companies)} boards)" + (f"; errors: {', '.join(errs)}" if errs else "")
    return out, status

# ---------- pipeline ----------

def filter_jobs(raw, stats):
    keep = []
    for j in raw:
        title, desc = j["title"], j["desc"]
        if SALESFORCE_EMPLOYER.match(j["company"]):
            stats["jobs at Salesforce"] += 1; continue
        roles, why = classify(title, desc)
        if not roles:
            stats[why] += 1; continue
        if j.get("contract") == "contract" or CONTRACT_TEXT.search(title + " " + desc[:400]):
            stats["contract / fixed-term"] += 1; continue
        h = (j.get("hours") or "").lower()
        if "part" in h or "intern" in h or "contract" in h or "temporary" in h:
            stats["not full-time permanent"] += 1; continue
        if CLEARANCE_TEXT.search(desc):
            stats["security clearance"] += 1; continue
        if not near_london(j["location"]):
            stats["outside London area"] += 1; continue
        p = parse_date(j["posted"]) if j["posted"] else None
        if not p or (NOW - p).days > MAX_DAYS:
            stats["older than %d days" % MAX_DAYS] += 1; continue
        if j.get("salary_max") and j["salary_max"] < 25000:
            stats["salary below £25k (likely not full-time)"] += 1; continue
        j["roles"] = roles
        j["age_days"] = (NOW - p).days
        keep.append(j)
    return keep


PRIORITY = {"careers": 0, "Reed": 1, "Adzuna": 2, "Jooble": 3}

def prio(j):
    return 0 if "(careers)" in j["source"] else PRIORITY.get(j["source"], 9)


def dedupe(jobs):
    seen = {}
    for j in sorted(jobs, key=lambda x: (prio(x), x["posted"] or "")):
        k = (norm_title(j["title"]), norm_company(j["company"]))
        if k in seen:
            seen[k].setdefault("also_on", [])
            if j["source"] not in seen[k]["also_on"] and j["source"] != seen[k]["source"]:
                seen[k]["also_on"].append(j["source"])
            continue
        seen[k] = j
    urls, out = set(), []
    for j in seen.values():
        if j["url"] in urls:
            continue
        urls.add(j["url"]); out.append(j)
    return sorted(out, key=lambda x: x["posted"] or "", reverse=True)


def fmt_salary(j):
    a, b = j.get("salary_min"), j.get("salary_max")
    if a and b and a != b:
        return f"£{int(a):,} – £{int(b):,}"
    if a or b:
        return f"£{int(a or b):,}"
    return j.get("salary_text") or ""


def main():
    from collections import Counter
    sources = {"Adzuna": src_adzuna, "Reed": src_reed, "Jooble": src_jooble, "Company careers (Greenhouse/Lever/Ashby)": src_ats}
    raw, status = [], {}
    for name, fn in sources.items():
        try:
            items, st = fn(print)
        except Exception as e:
            items, st = [], f"error: {e.__class__.__name__}: {str(e)[:120]}"
        status[name] = st; raw += items
        print(f"[{name}] {st}")
    stats = Counter()
    jobs = dedupe(filter_jobs(raw, stats))
    for j in jobs:
        j["salary"] = fmt_salary(j)
        j["id"] = re.sub(r"[^a-z0-9]+", "-", (norm_company(j["company"]) + "-" + norm_title(j["title"])))[:80]
        j.pop("desc", None)
    payload = {"generated_at": NOW.isoformat(), "max_days": MAX_DAYS, "sources": status,
               "raw_count": len(raw), "excluded": dict(stats), "count": len(jobs), "jobs": jobs,
               "filters": ["Target titles only (11 role families)", "Full-time, permanent", "London + ~20 miles",
                           f"Posted in the last {MAX_DAYS} days", "Excludes senior / lead / manager / architect / developer",
                           "Excludes contract, fixed-term, part-time, internships", "Excludes security-clearance roles",
                           "Excludes sales jobs at Salesforce itself", "Deduplicated by title + company"]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
    print(f"wrote {OUT} with {len(jobs)} jobs (raw {len(raw)}); excluded: {dict(stats)}")


if __name__ == "__main__":
    main()
