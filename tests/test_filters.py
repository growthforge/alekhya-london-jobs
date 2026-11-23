"""Offline tests for fetch_jobs filters (run: python3 tests/test_filters.py)."""
import sys, datetime as dt, importlib.util
from collections import Counter
from pathlib import Path
spec = importlib.util.spec_from_file_location("fj", Path(__file__).resolve().parent.parent / "scripts" / "fetch_jobs.py")
fj = importlib.util.module_from_spec(spec); spec.loader.exec_module(fj)
today = fj.NOW
old = today - dt.timedelta(days=20)
recent = today - dt.timedelta(days=10)
def J(title, company="Acme Ltd", loc="London", posted=today, desc="", contract=None, hours=None, smax=None, src="Reed", url=None):
    return fj.make(src, title, company, loc, url or f"https://x/{title}/{company}", posted, desc, None, smax, contract=contract, hours=hours)
cases = [
 (J("Salesforce Business Analyst"), True),
 (J("Salesforce Administrator", loc="Croydon, Surrey"), True),
 (J("Salesforce Functional Consultant", loc="Canary Wharf"), True),
 (J("Business Analyst", loc="Watford"), True),
 (J("Project Coordinator", loc="London Bridge"), True),
 (J("Junior Project Manager"), True),
 (J("CRM Officer", company="Charity Trust"), True),
 (J("Sales Operations Analyst", desc="Own our Salesforce reporting"), True),
 (J("Sales Operations Analyst", desc="HubSpot and Excel"), False),
 (J("Senior Salesforce Administrator"), False),
 (J("Salesforce Lead Consultant"), False),
 (J("Salesforce Developer"), False),
 (J("Salesforce Solution Architect"), False),
 (J("Salesforce Business Analyst - Contract"), False),
 (J("Salesforce Administrator", desc="£450 per day, outside IR35"), False),
 (J("Business Analyst", desc="Must hold active SC clearance"), False),
 (J("Account Executive", company="Salesforce"), False),
 (J("Salesforce Business Analyst", company="Salesforce UK"), True),
 (J("Salesforce Business Analyst", posted=recent), True),
 (J("Business Analyst", posted=None, src="Acme (careers)"), True),
 (J("Salesforce Administrator", loc="Remote, United Kingdom"), True),
 (J("Salesforce Administrator", loc="United Kingdom (remote)"), True),
 (J("Salesforce Administrator", loc="Remote - US"), False),
 (J("Salesforce Administrator", loc="Dublin, Ireland"), False),
 (J("Business Analyst", loc="London, Ontario, Canada"), False),
 (J("Business Analyst", loc="London (NHS search, 20 miles)", src="NHS Jobs"), True),
 (J("Business Analyst", hours="contractor"), False),
 (J("Business Analyst", hours="fixed term"), False),
 (J("Salesforce Technical Evangelist"), False),
 (J("Head of CRM"), False),
 (J("Implementation Consultant", loc="London / Remote"), True),
 (J("Salesforce Analyst"), True),
 (J("Permanent Personal Assistant / Project Coordinator"), False),
 (J("Project Administrator"), True),
 (J("Salesforce Business Analyst", desc="Contract Salesforce Business Analyst, hybrid London"), False),
 (J("Business Analyst", desc="Initial 6 months, inside IR35"), False),
 (J("Business Analyst", desc="We are hiring a permanent BA. You will support contract management workflows."), True),
 (J("QA Analyst Risk IT - AVP - SMBC"), False),
 (J("Salesforce Specialist"), True),
 (J("CRM Specialist", desc="HubSpot only"), False),
 (J("Salesforce Business Analyst", loc="Manchester"), False),
 (J("Salesforce Business Analyst", loc="Remote"), False),
 (J("Salesforce Business Analyst", posted=old), False),
 (J("Salesforce Administrator", hours="part_time"), False),
 (J("Salesforce Business Analyst", contract="contract"), False),
 (J("Data Engineer"), False),
 (J("Salesforce Business Analyst Intern"), False),
]
fails = 0
if fj.split_poster("Business Analyst - Market Risk - CRISIL", "eFinancialCareers") != ("Business Analyst - Market Risk", "CRISIL"):
    fails += 1; print("FAIL split_poster")
if fj.split_poster("Business Analyst - CRM", "Acme Ltd") != ("Business Analyst - CRM", "Acme Ltd"):
    fails += 1; print("FAIL split_poster keep")
for txt, days in [("Posted Today", 0), ("Posted Yesterday", 1), ("Posted 3 Days Ago", 3), ("Posted 30+ Days Ago", 31)]:
    got = fj.wd_posted(txt)
    if not got or abs((fj.NOW - got).days - days) > 0:
        fails += 1; print("FAIL wd_posted", txt, got)
for job, expect in cases:
    got = bool(fj.filter_jobs([dict(job)], Counter()))
    if got != expect:
        fails += 1; print("FAIL", job["title"], job["company"], job["location"], "expected", expect)
dups = fj.dedupe(fj.filter_jobs([J("Salesforce Business Analyst", "Acme Ltd", src="Adzuna", url="a"), J("Salesforce Business Analyst", "ACME Limited", src="Reed", url="b")], Counter()))
if len(dups) != 1 or dups[0]["source"] != "Reed" or dups[0].get("also_on") != ["Adzuna"]:
    fails += 1; print("FAIL dedupe", dups)
print(f"{len(cases)+7 - fails}/{len(cases)+7} passed"); sys.exit(1 if fails else 0)
