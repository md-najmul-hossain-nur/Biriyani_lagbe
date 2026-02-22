import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mosques.db"
UPLOAD_DIR = BASE_DIR / "uploads"

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024


def get_db_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA journal_mode=DELETE")
    except sqlite3.OperationalError:
        pass
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def ensure_database() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS mosques (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                food_type TEXT NOT NULL CHECK(food_type IN ('biryani', 'muri', 'jilapi', 'none')),
                prayer_slot TEXT,
                verify_count INTEGER NOT NULL DEFAULT 0,
                disagree_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                event_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                proof_image TEXT,
                status TEXT NOT NULL DEFAULT 'pending'
            )
            """
        )

        table_sql_row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mosques'"
        ).fetchone()
        table_sql = (table_sql_row["sql"] or "").lower() if table_sql_row else ""

        if "food_type in ('biryani', 'muri', 'jilapi', 'none')" not in table_sql:
            connection.executescript(
                """
                CREATE TABLE mosques_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    food_type TEXT NOT NULL CHECK(food_type IN ('biryani', 'muri', 'jilapi', 'none')),
                    prayer_slot TEXT,
                    verify_count INTEGER NOT NULL DEFAULT 0,
                    disagree_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    event_date TEXT NOT NULL,
                    start_time TEXT,
                    end_time TEXT,
                    proof_image TEXT,
                    status TEXT NOT NULL DEFAULT 'pending'
                );

                INSERT INTO mosques_new (
                    id, name, lat, lng, food_type, prayer_slot, verify_count, disagree_count,
                    created_at, updated_at, event_date, start_time, end_time, proof_image, status
                )
                SELECT
                    id, name, lat, lng, food_type, prayer_slot, verify_count, 0,
                    created_at, updated_at, event_date, start_time, end_time, proof_image, status
                FROM mosques;

                DROP TABLE mosques;
                ALTER TABLE mosques_new RENAME TO mosques;
                """
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS mosque_votes (
                id TEXT PRIMARY KEY,
                mosque_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                vote_type TEXT NOT NULL DEFAULT 'agree' CHECK(vote_type IN ('agree', 'disagree')),
                created_at TEXT NOT NULL,
                UNIQUE(mosque_id, client_id)
            )
            """
        )

        vote_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(mosque_votes)").fetchall()
        }

        if "vote_type" not in vote_columns:
            connection.execute(
                "ALTER TABLE mosque_votes ADD COLUMN vote_type TEXT NOT NULL DEFAULT 'agree'"
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS moderation_requests (
                id TEXT PRIMARY KEY,
                mosque_id TEXT NOT NULL,
                request_type TEXT NOT NULL CHECK(request_type IN ('edit', 'delete')),
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL
            )
            """
        )

        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(mosques)").fetchall()
        }

        migration_statements = [
            ("updated_at", "ALTER TABLE mosques ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"),
            ("event_date", "ALTER TABLE mosques ADD COLUMN event_date TEXT NOT NULL DEFAULT ''"),
            ("prayer_slot", "ALTER TABLE mosques ADD COLUMN prayer_slot TEXT"),
            ("disagree_count", "ALTER TABLE mosques ADD COLUMN disagree_count INTEGER NOT NULL DEFAULT 0"),
            ("start_time", "ALTER TABLE mosques ADD COLUMN start_time TEXT"),
            ("end_time", "ALTER TABLE mosques ADD COLUMN end_time TEXT"),
            ("proof_image", "ALTER TABLE mosques ADD COLUMN proof_image TEXT"),
            ("status", "ALTER TABLE mosques ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"),
        ]

        for column_name, statement in migration_statements:
            if column_name not in columns:
                connection.execute(statement)

        connection.execute(
            """
            UPDATE mosques
            SET event_date = CASE
                WHEN event_date = '' OR event_date IS NULL THEN substr(created_at, 1, 10)
                ELSE event_date
            END
            """
        )

        connection.execute(
            """
            UPDATE mosques
            SET updated_at = CASE
                WHEN updated_at = '' OR updated_at IS NULL THEN created_at
                ELSE updated_at
            END
            """
        )

        connection.execute(
            """
            UPDATE mosques
            SET status = CASE
                WHEN status IS NULL OR status = '' THEN 'approved'
                ELSE status
            END
            """
        )

        connection.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip()

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def is_valid_date(date_text: str) -> bool:
    try:
        datetime.strptime(date_text, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def is_valid_time(time_text: str | None) -> bool:
    if time_text is None or time_text == "":
        return True

    try:
        datetime.strptime(time_text, "%H:%M")
        return True
    except ValueError:
        return False


def cleanup_expired_data(connection: sqlite3.Connection) -> None:
    threshold = datetime.now(timezone.utc) - timedelta(hours=24)

    expired_ids: list[str] = []
    rows = connection.execute("SELECT id, created_at FROM mosques").fetchall()

    for row in rows:
        created_at = parse_iso_datetime(row["created_at"])
        if created_at is None:
            continue

        if created_at <= threshold:
            expired_ids.append(row["id"])

    if expired_ids:
        placeholders = ",".join(["?"] * len(expired_ids))
        connection.execute(
            f"DELETE FROM mosque_votes WHERE mosque_id IN ({placeholders})", expired_ids
        )
        connection.execute(
            f"DELETE FROM moderation_requests WHERE mosque_id IN ({placeholders})", expired_ids
        )
        connection.execute(
            f"DELETE FROM mosques WHERE id IN ({placeholders})", expired_ids
        )


def safe_cleanup_expired_data(connection: sqlite3.Connection) -> None:
    try:
        cleanup_expired_data(connection)
    except sqlite3.Error as error:
        app.logger.warning("Skipping cleanup due to sqlite error: %s", error)


def trust_score(verify_count: int, updated_at: str) -> int:
    base_score = min(verify_count * 12, 70)
    freshness_bonus = 0

    try:
        updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        days_old = max((datetime.now(timezone.utc) - updated).days, 0)
        freshness_bonus = max(30 - min(days_old, 30), 0)
    except ValueError:
        freshness_bonus = 10

    return min(base_score + freshness_bonus, 100)


def row_to_api_dict(row: sqlite3.Row) -> dict:
    verify_count = int(row["verify_count"])
    disagree_count = int(row["disagree_count"])
    updated_at = row["updated_at"]

    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "foodType": row["food_type"],
        "prayerSlot": row["prayer_slot"],
        "verifyCount": verify_count,
        "disagreeCount": disagree_count,
        "createdAt": row["created_at"],
        "updatedAt": updated_at,
        "eventDate": row["event_date"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "proofImage": row["proof_image"],
        "status": row["status"],
        "trustScore": trust_score(verify_count, updated_at),
    }


def save_uploaded_image(file_obj) -> str | None:
    if not file_obj or file_obj.filename is None or file_obj.filename.strip() == "":
        return None

    filename = secure_filename(file_obj.filename)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Only jpg, jpeg, png, webp files are allowed")

    unique_name = f"{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / unique_name
    file_obj.save(file_path)
    return f"uploads/{unique_name}"


def parse_mosque_payload() -> tuple[dict | None, int, str]:
    content_type = request.content_type or ""

    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        source = request.form
        proof_file = request.files.get("proofImage")
    else:
        source = request.get_json(silent=True) or {}
        proof_file = None

    name = source.get("name")
    lat = source.get("lat")
    lng = source.get("lng")
    food_type = source.get("foodType")
    prayer_slot = source.get("prayerSlot")
    event_date = source.get("eventDate")
    start_time = source.get("startTime")
    end_time = source.get("endTime")

    if isinstance(name, str):
        name = name.strip()

    if isinstance(food_type, str):
        food_type = food_type.strip().lower()

    if isinstance(prayer_slot, str):
        prayer_slot = prayer_slot.strip().lower()

    prayer_slot_aliases = {
        "juma": "juma",
        "jumuah": "juma",
        "jumu'ah": "juma",
        "zuhr": "juma",
        "johor": "juma",
        "asr": "asor",
        "asor": "asor",
        "maghrib": "magrib",
        "magrib": "magrib",
        "isha": "esha",
        "esha": "esha",
    }

    if not prayer_slot:
        prayer_slot = "juma"
    else:
        prayer_slot = prayer_slot_aliases.get(prayer_slot)

    valid_prayer_slots = {"juma", "johor", "asor", "magrib", "esha"}

    if not event_date:
        event_date = today_str()

    if isinstance(event_date, str):
        event_date = event_date.strip()

    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return None, 400, "Invalid latitude/longitude"

    if not isinstance(name, str) or not name:
        return None, 400, "Mosque name is required"

    if food_type not in {"biryani", "muri", "jilapi", "none"}:
        return None, 400, "Invalid food type"

    if prayer_slot not in valid_prayer_slots:
        return None, 400, "Invalid prayer slot"

    if not isinstance(event_date, str) or not is_valid_date(event_date):
        return None, 400, "Invalid event date"

    if not is_valid_time(start_time):
        return None, 400, "Invalid start time"

    if not is_valid_time(end_time):
        return None, 400, "Invalid end time"

    if start_time and end_time and start_time > end_time:
        return None, 400, "Start time cannot be after end time"

    try:
        proof_image = save_uploaded_image(proof_file)
    except ValueError:
        return None, 415, "Invalid image format"

    payload = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "foodType": food_type,
        "prayerSlot": prayer_slot,
        "eventDate": event_date,
        "startTime": start_time or None,
        "endTime": end_time or None,
        "proofImage": proof_image,
    }

    return payload, 200, "ok"


ensure_database()


@app.route("/api/mosques", methods=["GET", "POST"])
@app.route("/api/mosques/", methods=["GET", "POST"])
def mosques_route():
    if request.method == "GET":
        selected_date = request.args.get("date", "").strip()
        query_text = request.args.get("q", "").strip().lower()
        quick_food = request.args.get("quickFood", "all").strip().lower()
        if selected_date and not is_valid_date(selected_date):
            return jsonify({"message": "Invalid date format"}), 400

        if quick_food not in {"all", "biryani", "muri", "jilapi", "none"}:
            quick_food = "all"

        try:
            with get_db_connection() as connection:
                safe_cleanup_expired_data(connection)

                sql = """
                    SELECT id, name, lat, lng, food_type, prayer_slot, verify_count, disagree_count, created_at, updated_at,
                           event_date, start_time, end_time, proof_image, status
                    FROM mosques
                    WHERE status = 'approved'
                """
                params: list = []

                if selected_date:
                    sql += " AND event_date = ?"
                    params.append(selected_date)

                if quick_food != "all":
                    sql += " AND food_type = ?"
                    params.append(quick_food)

                if query_text:
                    sql += " AND lower(name) LIKE ?"
                    params.append(f"%{query_text}%")

                sql += " ORDER BY datetime(updated_at) DESC"

                rows = connection.execute(sql, params).fetchall()
                connection.commit()
        except sqlite3.Error as error:
            app.logger.exception("Database read failed: %s", error)
            return jsonify({"message": "Database read failed"}), 500

        return jsonify([row_to_api_dict(row) for row in rows])

    parsed_payload, status_code, error_message = parse_mosque_payload()
    if parsed_payload is None:
        return jsonify({"message": error_message}), status_code

    new_entry = {
        "id": uuid.uuid4().hex,
        "name": parsed_payload["name"],
        "lat": parsed_payload["lat"],
        "lng": parsed_payload["lng"],
        "foodType": parsed_payload["foodType"],
        "prayerSlot": parsed_payload["prayerSlot"],
        "verifyCount": 0,
        "disagreeCount": 0,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "eventDate": parsed_payload["eventDate"],
        "startTime": parsed_payload["startTime"],
        "endTime": parsed_payload["endTime"],
        "proofImage": parsed_payload["proofImage"],
        "status": "approved",
    }

    try:
        with get_db_connection() as connection:
            safe_cleanup_expired_data(connection)
            connection.execute(
                """
                INSERT INTO mosques (
                    id, name, lat, lng, food_type, prayer_slot, verify_count, disagree_count,
                    created_at, updated_at, event_date, start_time, end_time, proof_image, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_entry["id"],
                    new_entry["name"],
                    new_entry["lat"],
                    new_entry["lng"],
                    new_entry["foodType"],
                    new_entry["prayerSlot"],
                    new_entry["verifyCount"],
                    new_entry["disagreeCount"],
                    new_entry["createdAt"],
                    new_entry["updatedAt"],
                    new_entry["eventDate"],
                    new_entry["startTime"],
                    new_entry["endTime"],
                    new_entry["proofImage"],
                    new_entry["status"],
                ),
            )
            connection.commit()
    except sqlite3.Error as error:
        app.logger.exception("Database write failed: %s", error)
        text = str(error).lower()
        if "locked" in text or "busy" in text:
            return jsonify({"message": "Database busy, please try again"}), 503
        if "readonly" in text:
            return jsonify({"message": "Database is read-only on server"}), 500
        return jsonify({"message": "Database write failed"}), 500

    return jsonify(new_entry), 201


@app.route("/api/mosques/<mosque_id>/verify", methods=["POST"])
@app.route("/api/mosques/<mosque_id>/verify/", methods=["POST"])
def verify_route(mosque_id: str):
    return vote_route(mosque_id, "agree")


@app.route("/api/mosques/<mosque_id>/disagree", methods=["POST"])
@app.route("/api/mosques/<mosque_id>/disagree/", methods=["POST"])
def disagree_route(mosque_id: str):
    return vote_route(mosque_id, "disagree")


def vote_route(mosque_id: str, vote_type: str):
    client_id = (
        request.headers.get("X-Client-Id")
        or request.args.get("clientId")
        or (request.get_json(silent=True) or {}).get("clientId")
    )

    if not isinstance(client_id, str) or not client_id.strip():
        return jsonify({"message": "Missing client id"}), 400

    clean_client_id = client_id.strip()

    try:
        with get_db_connection() as connection:
            safe_cleanup_expired_data(connection)

            exists = connection.execute(
                "SELECT id FROM mosques WHERE id = ? AND status = 'approved'", (mosque_id,)
            ).fetchone()

            if exists is None:
                return jsonify({"message": "Mosque not found"}), 404

            duplicate_vote = connection.execute(
                "SELECT id FROM mosque_votes WHERE mosque_id = ? AND client_id = ?",
                (mosque_id, clean_client_id),
            ).fetchone()

            if duplicate_vote is not None:
                return jsonify({"message": "You already voted"}), 409

            connection.execute(
                """
                INSERT INTO mosque_votes (id, mosque_id, client_id, vote_type, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (uuid.uuid4().hex, mosque_id, clean_client_id, vote_type, now_iso()),
            )

            if vote_type == "disagree":
                connection.execute(
                    """
                    UPDATE mosques
                    SET disagree_count = disagree_count + 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (now_iso(), mosque_id),
                )
            else:
                connection.execute(
                    """
                    UPDATE mosques
                    SET verify_count = verify_count + 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (now_iso(), mosque_id),
                )

            row = connection.execute(
                """
                SELECT id, name, lat, lng, food_type, prayer_slot, verify_count, disagree_count, created_at, updated_at,
                       event_date, start_time, end_time, proof_image, status
                FROM mosques
                WHERE id = ?
                """,
                (mosque_id,),
            ).fetchone()
            connection.commit()
    except sqlite3.Error as error:
        text = str(error).lower()
        if "locked" in text or "busy" in text:
            return jsonify({"message": "Database busy, please try again"}), 503
        if "readonly" in text:
            return jsonify({"message": "Database is read-only on server"}), 500
        return jsonify({"message": "Database vote failed"}), 500

    return jsonify(row_to_api_dict(row))





@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    file_path = BASE_DIR / filename
    if file_path.is_file():
        return send_from_directory(BASE_DIR, filename)
    return send_from_directory(BASE_DIR, "index.html")


application = app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    app.run(host="0.0.0.0", port=port, debug=False)
