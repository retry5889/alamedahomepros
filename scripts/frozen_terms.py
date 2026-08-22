"""Frozen Google Trends term set v1 (A6), standalone copy for the fetcher repo.

Keep in sync with cartesian-yacht claims_forecast/ingestion/google_trends.py.
"""

TERM_SET_VERSION = "v1.0"

FROZEN_TERMS_V1 = {
    "F1_filing_intent": ["file for unemployment", "file unemployment", "file unemployment claim", "apply for unemployment", "unemployment application", "claim unemployment", "unemployment claim", "how to file for unemployment", "unemployment file", "sign up for unemployment"],
    "F2_benefits_status": ["unemployment benefits", "unemployment payment", "unemployment check", "unemployment deposit", "when will unemployment be paid", "unemployment status", "unemployment pending", "unemployment approved"],
    "F3_portal_access": ["unemployment login", "unemployment sign in", "unemployment website", "unemployment office near me", "unemployment phone number"],
    "F4_job_loss_event": ["laid off", "lost my job", "got fired", "let go", "terminated from job", "job loss", "furloughed", "furlough"],
    "F5_severance_warn": ["severance", "severance pay", "severance package", "WARN notice", "WARN act", "plant closing", "mass layoff"],
    "F6_state_portals": ["edd login", "ui online", "twc unemployment", "ui texasworkforce", "ny unemployment login", "connect unemployment", "florida unemployment login", "uc pa", "pa unemployment login", "unemployment ohio gov", "ides unemployment", "miwam", "georgia unemployment", "nj unemployment", "mylaimonen"],
    "F7_spanish": ["desempleo", "solicitar desempleo", "beneficios de desempleo", "seguro de desempleo"],
    "F8_anxiety_leading": ["layoffs coming", "will I be laid off", "company layoffs", "recession jobs", "job cuts"],
    "F9_employer_side": ["how to lay off employees", "reduction in force", "furlough employees"],
    "F10_negative_controls": ["lunar phase", "horoscope today", "nfl scores", "weather mars"],
}


def all_terms():
    return [t for terms in FROZEN_TERMS_V1.values() for t in terms]


def term_family(term):
    for fam, terms in FROZEN_TERMS_V1.items():
        if term in terms:
            return fam
    return None
