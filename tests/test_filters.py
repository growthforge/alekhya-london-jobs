"""Offline tests for fetch_jobs filters (run: python3 tests/test_filters.py)."""
import sys, datetime as dt, importlib.util
from collections import Counter
from pathlib import Path
spec = importlib.util.spec_from_file_location("fj", Path(__file__).resolve().parent.parent / "scripts" / "fetch_jobs.py")
fj = importlib.util.module_from_spec(spec); spec.loader.exec_module(fj)
today = fj.NOW
old = today - dt.timedelta(days=10)
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
 (J("Salesforce Business Analyst", company="Salesforce UK"), False),
 (J("Salesforce Business Analyst", loc="Manchester"), False),
 (J("Salesforce Business Analyst", loc="Remote"), False),
 (J("Salesforce Business Analyst", posted=old), False),
 (J("Salesforce Administrator", hours="part_time"), False),
 (J("Salesforce Business Analyst", contract="contract"), False),
 (J("Data Engineer"), False),
 (J("Salesforce Business Analyst Intern"), False),
]
fails = 0
for job, expect in cases:
    got = bool(fj.filter_jobs([dict(job)], Counter()))
    if got != expect:
        fails += 1; print("FAIL", job["title"], job["company"], job["location"], "expected", expect)
dups = fj.dedupe(fj.filter_jobs([J("Salesforce Business Analyst", "Acme Ltd", src="Adzuna", url="a"), J("Salesforce Business Analyst", "ACME Limited", src="Reed", url="b")], Counter()))
if len(dups) != 1 or dups[0]["source"] != "Reed" or dups[0].get("also_on") != ["Adzuna"]:
    fails += 1; print("FAIL dedupe", dups)
print(f"{len(cases)+1 - fails}/{len(cases)+1} passed"); sys.exit(1 if fails else 0)
