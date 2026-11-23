#!/usr/bin/env python3
"""Fresh jobs feed for Alekhya Bheema (London, full-time, permanent).

Runs daily in GitHub Actions and writes data/jobs.json.
Keyless sources (always on):
  - Company careers boards: public posting APIs of Greenhouse, Lever, Ashby, Workable, SmartRecruiters
    (verified employers in data/ats_companies.json) and Workday (data/workday_companies.json)
  - Workable job search (jobs.workable.com public search, thousands of UK employers)
  - Reed RSS search feed (+ the advert's schema.org JobPosting data for employer / location / type)
  - NHS Jobs public XML search API
Keyed sources (activate when repo secrets are added; skipped and reported "inactive" otherwise):
  - Adzuna API          ADZUNA_APP_ID + ADZUNA_APP_KEY  (https://developer.adzuna.com)
  - Reed Jobseeker API  REED_API_KEY                   (https://www.reed.co.uk/developers/jobseeker)
  - Jooble API          JOOBLE_API_KEY (optional)      (https://jooble.org/api/about)
Filters: target titles only; full-time permanent; London + ~20 miles; posted within MAX_DAYS;
excludes senior/lead/principal/manager-level, contract/interim/fixed-term/part-time, developer/architect,
internships, security-clearance roles, and sales jobs AT Salesforce. Deduplicated on title+company.
Standard library only.
"""
import base64, datetime as dt, html, json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "jobs.json"
ATS = ROOT / "data" / "ats_companies.json"
WORKDAY = ROOT / "data" / "workday_companies.json"
MAX_DAYS = int(os.environ.get("MAX_DAYS", "14"))
KEEP_DAYS = 7
UA = "alekhya-london-jobs/1.0 (+https://growthforge.github.io/alekhya-london-jobs/)"
NOW = dt.datetime.now(dt.timezone.utc)

# ---------- role definitions (title patterns) ----------
ROLES = [
 ("P1", "Salesforce Business Analyst", ["salesforce business analyst", "crm business analyst"], r"\b(salesforce|crm)\b.*\b(business|functional|systems) analyst\b|\bsalesforce (ba|analyst)\b|\bbusiness analyst\b.*\b(salesforce|crm)\b", False),
 ("P2", "Salesforce Functional Consultant", ["salesforce consultant", "salesforce functional consultant"], r"\bsalesforce\b.*\bconsultant\b|\b(sales|service) cloud consultant\b", False),
 ("P3", "Salesforce Administrator", ["salesforce administrator", "crm administrator"], r"\bsalesforce\b.*\badmin(istrator)?\b|\bcrm admin(istrator)?\b|\bsalesforce (specialist|coordinator|co-ordinator|officer|executive|support analyst)\b", False),
 ("P4", "Salesforce Field Service", ["field service lightning", "salesforce field service"], r"\bfield service (lightning|consultant)\b|\bfsl\b|\bsalesforce field service\b", False),
 ("P5", "CRM Systems Analyst", ["crm analyst", "crm systems analyst"], r"\bcrm (systems |data )?(analyst|specialist)\b|\bcrm systems (officer|specialist)\b", True),
 ("B1", "Business Analyst", ["business analyst", "business systems analyst"], r"\b(it |digital |technical |business systems |systems )?business analyst\b|\bbusiness systems analyst\b", False),
 ("B2", "Project Coordinator / PMO", ["project coordinator", "pmo analyst", "project analyst"], r"\bproject co-?ordinator\b|\bpmo (analyst|officer|coordinator|co-ordinator)\b|\bproject (analyst|support officer|administrator|support analyst)\b|\bpmo (support|administrator)\b|\bjunior project manager\b", False),
 ("B3", "UAT / Test Analyst", ["uat analyst", "test analyst", "salesforce tester"], r"\buat (analyst|tester|test analyst)\b|\btest analyst\b|\bqa analyst\b|\bsalesforce (tester|qa)\b", False),
 ("B4", "Implementation Consultant", ["implementation consultant", "implementation specialist"], r"\bimplementation (consultant|specialist|analyst)\b|\bonboarding (consultant|specialist)\b", False),
 ("B5", "CRM / Database Officer", ["crm officer", "database officer", "crm executive"], r"\bcrm (officer|executive|coordinator|co-ordinator|assistant)\b|\bdatabase officer\b|\bbusiness systems officer\b", False),
 ("B6", "Sales / RevOps Analyst", ["sales operations analyst", "revenue operations analyst"], r"\b(sales|revenue) op(eration)?s analyst\b|\brevops analyst\b", True),
]
ROLE_RE = [(rid, label, re.compile(rx, re.I), needs_sf) for rid, label, _, rx, needs_sf in ROLES]
ALLOW_DESPITE_EXCLUDE = re.compile(r"\bjunior project manager\b", re.I)
EXCLUDE_TITLE = re.compile(
  r"\b(senior|snr|sr\.?|lead|principal|head|director|manager|vp|avp|svp|vice president|chief|architect|developer|engineer|apex|lwc|"
  r"intern|internship|apprentice|apprenticeship|placement|graduate scheme|trainee|"
  r"contract|contractor|interim|fixed[- ]term|ftc|temporary|temp|freelance|part[- ]time|"
  r"sc cleared|dv cleared|security clear|clearance|"
  r"account executive|sales executive|account director|account manager|customer success|business development|sdr|bdr|"
  r"evangelist|band [89]|nurse|clinical|pharmacist|personal assistant|executive assistant|pa)\b", re.I)
CONTRACT_TEXT = re.compile(
  r"\b(per day|day rate|p/d|£\s?\d{3,4}\s?(pd|/day|per day|a day)|inside ir35|outside ir35|ir35|fixed[- ]term|ftc|maternity cover|"
  r"temporary (role|position|contract)|interim|\d+[- ]months?( initial| rolling)? contract|initial \d+[- ]months?|"
  r"contract (role|position|opportunity|basis|assignment)|on a contract|^contract\b|\bcontract\s*[-–|:]|contract (salesforce|business|crm|test|project))\b", re.I)
CLEARANCE_TEXT = re.compile(r"\b(sc|dv|edv|npvv|nppv)\s*(clearance|cleared)\b|\bsecurity clearance (is )?(required|essential)\b|\bmust (hold|have) (active )?(sc|dv)\b", re.I)
SALESFORCE_EMPLOYER = re.compile(r"^\s*salesforce(\.com)?(,? inc\.?| uk| ltd| limited)?\s*$", re.I)
NEAR = ["london", "city of london", "westminster", "canary wharf", "stratford", "croydon", "kingston", "richmond", "wimbledon",
        "harrow", "wembley", "uxbridge", "ealing", "hammersmith", "chiswick", "brentford", "hounslow", "heathrow", "twickenham",
        "sutton", "bromley", "lewisham", "greenwich", "woolwich", "ilford", "romford", "barking", "enfield", "barnet", "watford",
        "st albans", "borehamwood", "potters bar", "hatfield", "staines", "epsom", "leatherhead", "redhill", "reigate", "dartford",
        "brentwood", "orpington", "slough"]
UK_REMOTE = re.compile(r"\b(remote|home[- ]based|work from home)\b", re.I)
UK_WORD = re.compile(r"\b(uk|u\.k\.|united kingdom|england|great britain|gb)\b", re.I)
NON_UK = re.compile(r"\b(usa|united states|us|canada|ireland|dublin|india|germany|berlin|france|paris|spain|madrid|barcelona|"
                    r"netherlands|amsterdam|poland|portugal|lisbon|emea only|singapore|australia|new york|london,? ontario|ontario|ohio|kentucky)\b", re.I)


def get(url, headers=None, data=None, timeout=30, raw=False):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, data=data)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
                return body if raw else json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(6 * (attempt + 1)); continue
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
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(s or ""))).strip()


def near_london(loc):
    """'London' for London + ~20 miles, 'Remote (UK)' for UK-wide remote roles, None otherwise."""
    l = (loc or "").lower()
    if not l:
        return None
    if re.search(r"london,? (on|ontario|ky|kentucky|oh|ohio)\b|ontario|kentucky", l):
        return None
    if any(re.search(r"\b" + re.escape(n) + r"\b", l) for n in NEAR):
        return "London"
    if UK_REMOTE.search(l) and UK_WORD.search(l) and not NON_UK.search(l):
        return "Remote (UK)"
    return None


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
                desc=clean_html(desc)[:4000], salary_min=smin, salary_max=smax, salary_text=salary_text,
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


def _sr_url(tok, r):
    return f"https://jobs.smartrecruiters.com/{tok}/{r.get('id')}"


def src_ats(log):
    """Public posting APIs of company careers boards (no key)."""
    try:
        companies = json.loads(ATS.read_text())
    except FileNotFoundError:
        return [], "inactive: data/ats_companies.json missing"
    out, errs, ok = [], [], 0
    for c in companies:
        name, kind, tok = c["name"], c["ats"], c["token"]
        src = f"{name} (careers)"
        try:
            if kind == "greenhouse":
                d = get(f"https://boards-api.greenhouse.io/v1/boards/{tok}/jobs?content=true")
                for r in d.get("jobs", []):
                    out.append(make(src, r.get("title"), name, (r.get("location") or {}).get("name"), r.get("absolute_url"),
                                    parse_date(r.get("first_published") or r.get("updated_at")), r.get("content")))
            elif kind in ("lever", "lever_eu"):
                host = "api.eu.lever.co" if kind == "lever_eu" else "api.lever.co"
                d = get(f"https://{host}/v0/postings/{tok}?mode=json")
                for r in d:
                    cat = r.get("categories") or {}
                    locs = " / ".join([cat.get("location") or ""] + list(cat.get("allLocations") or []))
                    out.append(make(src, r.get("text"), name, locs, r.get("hostedUrl"), parse_date(r.get("createdAt")),
                                    r.get("descriptionPlain"), hours=(cat.get("commitment") or "").lower()))
            elif kind == "ashby":
                d = get(f"https://api.ashbyhq.com/posting-api/job-board/{tok}")
                for r in d.get("jobs", []):
                    locs = " / ".join([r.get("location") or ""] + [x.get("location", "") for x in (r.get("secondaryLocations") or []) if isinstance(x, dict)])
                    if r.get("isRemote") and "remote" not in locs.lower():
                        locs += " / Remote"
                    out.append(make(src, r.get("title"), name, locs, r.get("jobUrl"), parse_date(r.get("publishedAt")),
                                    r.get("descriptionPlain"), hours=(r.get("employmentType") or "").lower()))
            elif kind == "workable":
                d = get(f"https://apply.workable.com/api/v1/widget/accounts/{tok}")
                for r in d.get("jobs", []):
                    loc = ", ".join(x for x in [r.get("city"), r.get("country")] if x)
                    if str(r.get("telecommuting")).lower() == "true":
                        loc += " (remote)"
                    out.append(make(src, r.get("title"), name, loc, r.get("url"), parse_date(r.get("published_on") or r.get("created_at")),
                                    "", hours=(r.get("employment_type") or "").lower()))
            elif kind == "smartrecruiters":
                d = get(f"https://api.smartrecruiters.com/v1/companies/{tok}/postings?limit=100&country=gb")
                for r in d.get("content", []):
                    L = r.get("location") or {}
                    loc = ", ".join(x for x in [L.get("city"), L.get("region"), (L.get("country") or "").upper()] if x)
                    if L.get("remote"):
                        loc += " (remote)"
                    emp = ((r.get("typeOfEmployment") or {}).get("label") or "").lower()
                    out.append(make(src, r.get("name"), name, loc, _sr_url(tok, r), parse_date(r.get("releasedDate")), "", hours=emp))
            ok += 1
        except Exception as e:  # one broken board must not stop the run
            errs.append(f"{name}: {e.__class__.__name__}")
        time.sleep(0.15)
    status = f"ok ({ok}/{len(companies)} boards, {len(out)} adverts)" + (f"; unavailable: {', '.join(errs[:8])}" if errs else "")
    return out, status


WD_AGE = re.compile(r"posted (today|yesterday|(\d+)\+? days? ago)", re.I)

def wd_posted(txt):
    m = WD_AGE.search(txt or "")
    if not m:
        return None
    if m.group(1).lower() == "today":
        n = 0
    elif m.group(1).lower() == "yesterday":
        n = 1
    else:
        n = int(m.group(2)) + (1 if "+" in m.group(0) else 0)
    return NOW - dt.timedelta(days=n)


def src_workday(log):
    """Workday public careers-site JSON (the same endpoint the careers page itself uses)."""
    try:
        companies = json.loads(WORKDAY.read_text())
    except FileNotFoundError:
        return [], "inactive: data/workday_companies.json missing"
    out, errs = [], []
    for c in companies:
        base = f"https://{c['host']}/wday/cxs/{c['tenant']}/{c['site']}/jobs"
        try:
            offset, total = 0, 1
            while offset < min(total, 200):
                body = json.dumps({"appliedFacets": {}, "limit": 20, "offset": offset, "searchText": "London"}).encode()
                for attempt in range(3):
                    try:
                        d = get(base, headers={"Content-Type": "application/json"}, data=body); break
                    except urllib.error.HTTPError as e:
                        if e.code != 429 or attempt == 2:
                            raise
                        time.sleep(30)
                total = d.get("total") or 0
                for r in d.get("jobPostings", []):
                    out.append(make(f"{c['name']} (careers)", r.get("title"), c["name"], r.get("locationsText"),
                                    f"https://{c['host']}/en-US/{c['site']}{r.get('externalPath', '')}", wd_posted(r.get("postedOn"))))
                offset += 20
                time.sleep(1.5)
        except Exception as e:
            errs.append(f"{c['name']}: {e.__class__.__name__} {getattr(e, 'code', '')}".strip())
        time.sleep(2)
    return out, f"ok ({len(companies) - len(errs)}/{len(companies)} sites, {len(out)} adverts)" + (f"; unavailable: {', '.join(errs)}" if errs else "")


EXTRA_SEARCH = ["salesforce", "crm", "pmo", "project support", "uat"]

def search_phrases():
    seen = list(EXTRA_SEARCH)
    for _, _, phrases, _, _ in ROLES:
        for ph in phrases:
            if ph not in seen:
                seen.append(ph)
    return seen


def src_workable_search(log):
    """jobs.workable.com public search across all employers that hire through Workable."""
    out = []
    for ph in search_phrases():
        token, pages = None, 0
        while pages < 3:
            q = {"query": ph, "location": "London"}
            if token:
                q["pageToken"] = token
            d = get("https://jobs.workable.com/api/v1/jobs?" + urllib.parse.urlencode(q))
            for r in d.get("jobs", []):
                L = r.get("location") or {}
                loc = ", ".join(x for x in [L.get("city"), L.get("subregion"), L.get("countryName")] if x)
                if (r.get("workplace") or "").lower() == "remote":
                    loc += " (remote)"
                out.append(make("Workable", r.get("title"), (r.get("company") or {}).get("title"), loc, r.get("url"),
                                parse_date(r.get("created")), r.get("description"), hours=(r.get("employmentType") or "").lower()))
            token, pages = d.get("nextPageToken"), pages + 1
            if not token or not d.get("jobs"):
                break
            time.sleep(0.8)
        time.sleep(0.8)
    return out, f"ok ({len(out)} adverts)"


def reed_jsonld(url):
    """Return (schema.org JobPosting dict, Reed's own job-type flags) for one advert page."""
    page = get(url, headers={"Accept": "text/html"}, raw=True, timeout=25)
    flags = {}
    i = page.find('"consolidatedJobDetails":{"jobDetails"')
    if i >= 0:
        m = re.search(r'"isTemp":(true|false),"isPermanent":(true|false),"isContract":(true|false)', page[i:])
        if m:
            flags = dict(temp=m.group(1) == "true", permanent=m.group(2) == "true", contract=m.group(3) == "true")
    for blob in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(blob)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("@type") == "JobPosting":
            return d, flags
    return None, flags


AGGREGATOR_POSTERS = re.compile(r"^(efinancialcareers|efinancial careers|jobserve|cwjobs|totaljobs)\b", re.I)

def split_poster(title, company):
    """Reed lists some adverts under the board that re-posts them (e.g. eFinancialCareers) with the real
    employer or agency appended to the title: 'Business Analyst - CRISIL'. Put it back in the company field."""
    if company and AGGREGATOR_POSTERS.match(company) and " - " in (title or ""):
        head, tail = title.rsplit(" - ", 1)
        if 1 <= len(tail.split()) <= 6:
            return head.strip(), tail.strip()
    return title, company


def src_reed_rss(log):
    """Reed's public RSS search feed. Each title-matched advert is then read once for its schema.org
    JobPosting block (employer, location, employment type), which Reed publishes for search engines."""
    items = {}
    for ph in search_phrases():
        for page in range(1, 5):
            q = {"keywords": ph, "location": "london", "proximity": 20, "permanent": "True", "fullTime": "True"}
            if page > 1:
                q["pageno"] = page
            xml = get("https://www.reed.co.uk/jobs/rss?" + urllib.parse.urlencode(q), headers={"Accept": "application/rss+xml"}, raw=True)
            n = 0
            for it in ET.fromstring(xml).iter("item"):
                n += 1
                link = (it.findtext("link") or "").replace("http://", "https://")
                items.setdefault(link, dict(title=it.findtext("title"), desc=it.findtext("description") or "",
                                            updated=it.findtext("{http://www.w3.org/2005/Atom}updated")))
            time.sleep(0.8)
            if n < 25:
                break
    out, fetched = [], 0
    for link, it in items.items():
        roles, _ = classify(it["title"], it["desc"])
        p = parse_date(it["updated"])
        if not roles or not p or (NOW - p).days > MAX_DAYS:
            continue  # skip page reads for adverts that cannot pass anyway
        try:
            d, flags = reed_jsonld(link); fetched += 1
        except Exception:
            d, flags = None, {}
        time.sleep(0.8)
        if not d:
            continue
        L = d.get("jobLocation") or {}
        L = L[0] if isinstance(L, list) and L else L
        A = (L.get("address") or {}) if isinstance(L, dict) else {}
        loc = ", ".join(x for x in [A.get("addressLocality"), A.get("addressRegion"), A.get("addressCountry")] if x)
        if (d.get("jobLocationType") or "").upper() == "TELECOMMUTE":
            loc += " (remote)"
        emp = d.get("employmentType") or ""
        emp = " ".join(emp) if isinstance(emp, list) else emp
        sal = d.get("baseSalary") or {}
        val = sal.get("value") or {} if isinstance(sal, dict) else {}
        if flags.get("contract") or flags.get("temp"):
            emp += " contract"
        t, co = split_poster(d.get("title") or it["title"], (d.get("hiringOrganization") or {}).get("name"))
        out.append(make("Reed", t, co, loc, link,
                        parse_date(d.get("datePosted")) or p, it["desc"] + " " + clean_html(d.get("description") or ""),
                        val.get("minValue"), val.get("maxValue"), hours=emp.lower().replace("_", "-")))
    return out, f"ok ({len(items)} in feed, {fetched} adverts read)"


def src_nhs(log):
    """NHS Jobs public XML search API (London + 20 miles)."""
    out = []
    for ph in search_phrases():
        for page in (1, 2):
            q = urllib.parse.urlencode({"keyword": ph, "location": "London", "distance": 20, "page": page})
            root = ET.fromstring(get(f"https://www.jobs.nhs.uk/api/v1/search_xml?{q}", headers={"Accept": "application/xml"}, raw=True))
            vs = root.findall("vacancyDetails")
            for v in vs:
                typ = (v.findtext("type") or "").lower()
                sal = v.findtext("salary") or ""
                nums = [float(x) for x in re.findall(r"£\s?([\d.]+)", sal)]
                out.append(make("NHS Jobs", v.findtext("title"), v.findtext("employer"), (v.findtext("locations") or "London (NHS search, 20 miles)"),
                                v.findtext("url"), parse_date(v.findtext("postDate")), v.findtext("description"),
                                min(nums) if nums else None, max(nums) if nums else None, salary_text=sal,
                                contract=("contract" if any(w in typ for w in ("fixed", "secondment", "bank", "locum")) else None), hours=typ))
            if len(vs) < 10:
                break
            time.sleep(0.5)
        time.sleep(0.5)
    return out, f"ok ({len(out)} adverts)"

# ---------- pipeline ----------

ROLE_LABEL = {rid: label for rid, label, *_ in ROLES}

def filter_jobs(raw, stats):
    keep = []
    for j in raw:
        title, desc = j["title"], j["desc"]
        roles, why = classify(title, desc)
        if not roles:
            stats[why] += 1; continue
        if j.get("contract") == "contract" or CONTRACT_TEXT.search(title + " " + desc):
            stats["contract / fixed-term"] += 1; continue
        h = (j.get("hours") or "").lower()
        if any(w in h for w in ("part", "intern", "contract", "temporary", "temp", "fixed", "freelance", "secondment", "bank", "locum")):
            stats["not full-time permanent"] += 1; continue
        if CLEARANCE_TEXT.search(desc):
            stats["security clearance"] += 1; continue
        where = near_london(j["location"])
        if not where:
            stats["outside London area"] += 1; continue
        p = parse_date(j["posted"]) if j["posted"] else None
        if p and (NOW - p).days > MAX_DAYS:
            stats["older than %d days" % MAX_DAYS] += 1; continue
        if j.get("salary_max") and j["salary_max"] < 25000:
            stats["salary below £25k (likely not full-time)"] += 1; continue
        j["roles"] = roles
        j["role"] = ROLE_LABEL[roles[0]]
        j["where"] = where
        j["age_days"] = (NOW - p).days if p else None
        keep.append(j)
    return keep


PRIORITY = {"careers": 0, "Reed": 1, "NHS Jobs": 1, "Workable": 2, "Adzuna": 3, "Jooble": 4}

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
    sources = {"Company careers boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters)": src_ats,
               "Company careers (Workday: Salesforce, LSEG, RELX, Aviva)": src_workday,
               "Workable job search": src_workable_search,
               "Reed (RSS feed)": src_reed_rss,
               "NHS Jobs": src_nhs,
               "Adzuna API": src_adzuna, "Reed API": src_reed, "Jooble API": src_jooble}
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
    per_source = Counter(j["source"] if "(careers)" not in j["source"] else "Company careers" for j in jobs)
    payload = {"generated_at": NOW.isoformat(), "max_days": MAX_DAYS, "sources": status, "per_source": dict(per_source),
               "raw_count": len(raw), "excluded": dict(stats), "count": len(jobs), "jobs": jobs,
               "filters": ["Target titles only (11 role families from her CV)", "Full-time, permanent",
                           "London + ~20 miles, or UK-wide remote", f"Posted in the last {MAX_DAYS} days (where the advert gives a date)",
                           "Excludes senior / lead / principal / head / director / manager / architect / developer / engineer",
                           "Excludes contract, fixed-term, part-time, internships, secondments", "Excludes security-clearance roles",
                           "Excludes sales roles (account executive, business development)", "Deduplicated by title + company"]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
    print(f"wrote {OUT} with {len(jobs)} jobs (raw {len(raw)}); excluded: {dict(stats)}")


if __name__ == "__main__":
    main()
