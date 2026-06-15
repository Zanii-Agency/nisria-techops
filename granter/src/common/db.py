"""SQLite database — schema, WAL mode, FTS5 full-text search, triggers."""

from __future__ import annotations

import json
import logging
import os
import sqlite3

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = "db/grants.db"


def get_db(path: str | None = None) -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and row_factory."""
    db_path = path or os.environ.get("DB_PATH", DEFAULT_DB_PATH)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_tables(conn: sqlite3.Connection) -> None:
    """Create all tables, FTS5 virtual tables, and triggers if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS grants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            source_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            agency TEXT DEFAULT '',
            amount_floor REAL,
            amount_ceiling REAL,
            currency TEXT DEFAULT 'USD',
            status TEXT DEFAULT 'posted',
            open_date TEXT DEFAULT '',
            close_date TEXT DEFAULT '',
            url TEXT DEFAULT '',
            categories_json TEXT DEFAULT '[]',
            eligibility_json TEXT DEFAULT '[]',
            sectors_json TEXT DEFAULT '[]',
            countries_json TEXT DEFAULT '[]',
            regions_json TEXT DEFAULT '[]',
            contact_name TEXT DEFAULT '',
            contact_email TEXT DEFAULT '',
            contact_phone TEXT DEFAULT '',
            raw_json TEXT DEFAULT '',
            relevance_score REAL DEFAULT 0.0,
            relevance_tier TEXT DEFAULT 'IRRELEVANT',
            first_seen_at TIMESTAMP DEFAULT (datetime('now')),
            last_updated_at TIMESTAMP DEFAULT (datetime('now')),
            UNIQUE(source, source_id)
        );

        CREATE TABLE IF NOT EXISTS funders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            ein TEXT DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            type TEXT DEFAULT '',
            assets REAL,
            annual_giving REAL,
            geographic_focus TEXT DEFAULT '',
            sector_focus TEXT DEFAULT '',
            website TEXT DEFAULT '',
            contact_name TEXT DEFAULT '',
            contact_email TEXT DEFAULT '',
            contact_phone TEXT DEFAULT '',
            top_grantees_json TEXT DEFAULT '[]',
            notes TEXT DEFAULT '',
            raw_json TEXT DEFAULT '',
            first_seen_at TIMESTAMP DEFAULT (datetime('now')),
            last_updated_at TIMESTAMP DEFAULT (datetime('now')),
            UNIQUE(source, ein)
        );

        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grant_id INTEGER REFERENCES grants(id),
            status TEXT DEFAULT 'identified',
            deadline TEXT DEFAULT '',
            amount_requested REAL,
            notes TEXT DEFAULT '',
            next_action TEXT DEFAULT '',
            next_action_date TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT (datetime('now')),
            updated_at TIMESTAMP DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS saved_searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            query TEXT NOT NULL,
            filters_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS org_profile (
            id INTEGER PRIMARY KEY,
            name TEXT DEFAULT '',
            mission TEXT DEFAULT '',
            ein TEXT DEFAULT '',
            sectors_json TEXT DEFAULT '[]',
            countries_json TEXT DEFAULT '[]',
            regions_json TEXT DEFAULT '[]',
            annual_budget REAL DEFAULT 0,
            grant_range_min REAL DEFAULT 5000,
            grant_range_max REAL DEFAULT 250000,
            org_type TEXT DEFAULT 'Nonprofit',
            taxonomy_json TEXT DEFAULT '{}',
            category_weights_json TEXT DEFAULT '{}',
            nur_founder_profile TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS http_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT UNIQUE NOT NULL,
            source TEXT NOT NULL,
            url TEXT NOT NULL,
            response_json TEXT NOT NULL,
            fetched_at TIMESTAMP DEFAULT (datetime('now')),
            expires_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_call_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            url TEXT NOT NULL,
            status_code INTEGER,
            called_at TIMESTAMP DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS source_status (
            source TEXT PRIMARY KEY,
            display_name TEXT DEFAULT '',
            is_enabled INTEGER DEFAULT 1,
            daily_budget INTEGER,
            calls_today INTEGER DEFAULT 0,
            grants_found INTEGER DEFAULT 0,
            last_refresh_at TIMESTAMP,
            last_error TEXT DEFAULT ''
        );

        -- Stage 3 Document Vault. PDFs, DOCX, brand sheets, certificates, etc.
        -- Files live on disk under granter/documents/; this table indexes them.
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            mime_type TEXT,
            size_bytes INTEGER,
            description TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_documents_category
            ON documents(category);
        CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at
            ON documents(uploaded_at);

        -- Stage 2 LLM re-rank cache. One row per grant. Refreshed when the
        -- scored_at value is older than the configured cache window (default
        -- 14 days). Written by src/scoring/llm_rerank.py.
        CREATE TABLE IF NOT EXISTS grant_llm_scores (
            grant_id INTEGER PRIMARY KEY REFERENCES grants(id) ON DELETE CASCADE,
            fit_score INTEGER,
            tier TEXT,
            lane TEXT,
            lead_program TEXT,
            tags_matched_json TEXT,
            commercial_criteria_json TEXT,
            hard_filter_triggered TEXT,
            top_3_alignment_reasons_json TEXT,
            top_2_risks_json TEXT,
            missing_info_needed_json TEXT,
            apply_recommendation TEXT,
            one_line_pitch TEXT,
            raw_json TEXT,
            scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_grant_llm_scores_tier
            ON grant_llm_scores(tier);
        CREATE INDEX IF NOT EXISTS idx_grant_llm_scores_scored_at
            ON grant_llm_scores(scored_at);

        -- Stage 6 single-user auth. Email + bcrypt-hashed password, bootstrapped
        -- once from NUR_EMAIL + NUR_PASSWORD env vars. After bootstrap, the
        -- hash in this table is authoritative, not the env var.
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login_at TIMESTAMP
        );

        -- FTS5 virtual tables for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS grants_fts USING fts5(
            title, description, agency,
            content='grants',
            content_rowid='id'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS funders_fts USING fts5(
            name, sector_focus, geographic_focus,
            content='funders',
            content_rowid='id'
        );

        -- Triggers to keep FTS in sync with grants table
        CREATE TRIGGER IF NOT EXISTS grants_ai AFTER INSERT ON grants BEGIN
            INSERT INTO grants_fts(rowid, title, description, agency)
            VALUES (new.id, new.title, new.description, new.agency);
        END;

        CREATE TRIGGER IF NOT EXISTS grants_ad AFTER DELETE ON grants BEGIN
            INSERT INTO grants_fts(grants_fts, rowid, title, description, agency)
            VALUES ('delete', old.id, old.title, old.description, old.agency);
        END;

        CREATE TRIGGER IF NOT EXISTS grants_au AFTER UPDATE ON grants BEGIN
            INSERT INTO grants_fts(grants_fts, rowid, title, description, agency)
            VALUES ('delete', old.id, old.title, old.description, old.agency);
            INSERT INTO grants_fts(rowid, title, description, agency)
            VALUES (new.id, new.title, new.description, new.agency);
        END;

        -- Triggers to keep FTS in sync with funders table
        CREATE TRIGGER IF NOT EXISTS funders_ai AFTER INSERT ON funders BEGIN
            INSERT INTO funders_fts(rowid, name, sector_focus, geographic_focus)
            VALUES (new.id, new.name, new.sector_focus, new.geographic_focus);
        END;

        CREATE TRIGGER IF NOT EXISTS funders_ad AFTER DELETE ON funders BEGIN
            INSERT INTO funders_fts(funders_fts, rowid, name, sector_focus, geographic_focus)
            VALUES ('delete', old.id, old.name, old.sector_focus, old.geographic_focus);
        END;

        CREATE TRIGGER IF NOT EXISTS funders_au AFTER UPDATE ON funders BEGIN
            INSERT INTO funders_fts(funders_fts, rowid, name, sector_focus, geographic_focus)
            VALUES ('delete', old.id, old.name, old.sector_focus, old.geographic_focus);
            INSERT INTO funders_fts(rowid, name, sector_focus, geographic_focus)
            VALUES (new.id, new.name, new.sector_focus, new.geographic_focus);
        END;
    """)

    # Idempotent column adds for org_profile (production DB has data, so we
    # can't drop and recreate). Each ALTER is wrapped in try/except so a
    # second run is a silent no-op once the column exists.
    _new_org_profile_columns = [
        ("taxonomy_json", "TEXT DEFAULT '{}'"),
        ("category_weights_json", "TEXT DEFAULT '{}'"),
        ("nur_founder_profile", "TEXT DEFAULT ''"),
    ]
    for col_name, col_decl in _new_org_profile_columns:
        try:
            conn.execute(f"ALTER TABLE org_profile ADD COLUMN {col_name} {col_decl}")
        except sqlite3.OperationalError:
            # Column already exists, ignore.
            pass

    conn.commit()
    logger.info("Database tables ensured")


def seed_org_profile(conn: sqlite3.Connection, config: dict) -> None:
    """Seed org_profile from config if not already present.

    Idempotent. On a fresh row, inserts all fields including the v2 lensed
    scorer fields (taxonomy_json, category_weights_json, nur_founder_profile).
    On an existing row, only backfills the v2 fields when they are still empty,
    so a re-seed never clobbers operator edits.
    """
    org = config.get("org_profile", {})
    taxonomy_json = json.dumps(org.get("taxonomy", {}))
    category_weights_json = json.dumps(org.get("category_weights", {}))
    nur_founder_profile = org.get("nur_founder_profile", "")

    existing = conn.execute("SELECT * FROM org_profile WHERE id = 1").fetchone()
    if existing:
        # Backfill v2 fields only when they are missing/empty. Never overwrite
        # operator-curated values.
        row = dict(existing)
        updates: list[str] = []
        params: list = []
        current_taxonomy = (row.get("taxonomy_json") or "").strip()
        if not current_taxonomy or current_taxonomy == "{}":
            updates.append("taxonomy_json = ?")
            params.append(taxonomy_json)
        current_weights = (row.get("category_weights_json") or "").strip()
        if not current_weights or current_weights == "{}":
            updates.append("category_weights_json = ?")
            params.append(category_weights_json)
        if not (row.get("nur_founder_profile") or "").strip():
            updates.append("nur_founder_profile = ?")
            params.append(nur_founder_profile)
        if updates:
            params.append(1)
            conn.execute(
                f"UPDATE org_profile SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
            logger.info("Backfilled org profile v2 fields")
        return

    conn.execute(
        """INSERT INTO org_profile (id, name, mission, ein, sectors_json, countries_json,
               regions_json, annual_budget, grant_range_min, grant_range_max, org_type,
               taxonomy_json, category_weights_json, nur_founder_profile)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            org.get("name", ""),
            org.get("mission", ""),
            org.get("ein", ""),
            json.dumps(org.get("sectors", [])),
            json.dumps(org.get("countries", [])),
            json.dumps(org.get("regions", [])),
            org.get("annual_budget", 0),
            org.get("grant_range_min", 5000),
            org.get("grant_range_max", 250000),
            org.get("org_type", "Nonprofit"),
            taxonomy_json,
            category_weights_json,
            nur_founder_profile,
        ),
    )
    conn.commit()
    logger.info("Seeded org profile")


def seed_source_status(conn: sqlite3.Connection, config: dict) -> None:
    """Seed source_status rows from config if missing."""
    display_names = {
        "grants_gov": "Grants.gov",
        "sam_gov": "SAM.gov",
        "usaspending": "USASpending",
        "worldbank": "World Bank",
        "propublica": "ProPublica",
        "iati": "IATI",
    }
    sources_cfg = config.get("sources", {})
    for source_name, source_cfg in sources_cfg.items():
        if not isinstance(source_cfg, dict):
            continue
        existing = conn.execute(
            "SELECT source FROM source_status WHERE source = ?", (source_name,)
        ).fetchone()
        if existing:
            continue
        conn.execute(
            """INSERT INTO source_status (source, display_name, is_enabled, daily_budget)
               VALUES (?, ?, ?, ?)""",
            (
                source_name,
                display_names.get(source_name, source_name),
                1 if source_cfg.get("enabled", True) else 0,
                source_cfg.get("daily_budget"),
            ),
        )
    conn.commit()
    logger.info("Seeded source status")
