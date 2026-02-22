import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mosques.db"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_database() -> None:
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS mosques (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                food_type TEXT NOT NULL CHECK(food_type IN ('biryani', 'muri', 'none')),
                verify_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


def row_to_api_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "foodType": row["food_type"],
        "verifyCount": row["verify_count"],
        "createdAt": row["created_at"],
    }


ensure_database()


def list_mosques():
    try:
        with get_db_connection() as connection:
            rows = connection.execute(
                """
                SELECT id, name, lat, lng, food_type, verify_count, created_at
                FROM mosques
                ORDER BY datetime(created_at) DESC
                """
            ).fetchall()
    except sqlite3.Error:
        return jsonify({"message": "Database read failed"}), 500

    return jsonify([row_to_api_dict(row) for row in rows])


def create_mosque():
    payload = request.get_json(silent=True) or {}

    name = payload.get("name")
    lat = payload.get("lat")
    lng = payload.get("lng")
    food_type = payload.get("foodType")

    if (
        not isinstance(name, str)
        or not name.strip()
        or not isinstance(lat, (int, float))
        or not isinstance(lng, (int, float))
        or food_type not in {"biryani", "muri", "none"}
    ):
        return jsonify({"message": "Invalid request body"}), 400

    new_entry = {
        "id": uuid.uuid4().hex,
        "name": name.strip(),
        "lat": float(lat),
        "lng": float(lng),
        "foodType": food_type,
        "verifyCount": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        with get_db_connection() as connection:
            connection.execute(
                """
                INSERT INTO mosques (id, name, lat, lng, food_type, verify_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_entry["id"],
                    new_entry["name"],
                    new_entry["lat"],
                    new_entry["lng"],
                    new_entry["foodType"],
                    new_entry["verifyCount"],
                    new_entry["createdAt"],
                ),
            )
            connection.commit()
    except sqlite3.Error:
        return jsonify({"message": "Database write failed"}), 500

    return jsonify(new_entry), 201


def verify_mosque(mosque_id: str):
    try:
        with get_db_connection() as connection:
            cursor = connection.execute(
                """
                UPDATE mosques
                SET verify_count = verify_count + 1
                WHERE id = ?
                """,
                (mosque_id,),
            )

            if cursor.rowcount == 0:
                return jsonify({"message": "Mosque not found"}), 404

            row = connection.execute(
                """
                SELECT id, name, lat, lng, food_type, verify_count, created_at
                FROM mosques
                WHERE id = ?
                """,
                (mosque_id,),
            ).fetchone()
            connection.commit()
    except sqlite3.Error:
        return jsonify({"message": "Database verify failed"}), 500

    return jsonify(row_to_api_dict(row))


@app.route("/api/mosques", methods=["GET", "POST"])
@app.route("/api/mosques/", methods=["GET", "POST"])
def mosques_route():
    if request.method == "GET":
        return list_mosques()

    return create_mosque()


@app.route("/api/mosques/<mosque_id>/verify", methods=["POST"])
@app.route("/api/mosques/<mosque_id>/verify/", methods=["POST"])
def verify_route(mosque_id: str):
    return verify_mosque(mosque_id)


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    file_path = BASE_DIR / filename
    if file_path.is_file():
        return send_from_directory(BASE_DIR, filename)
    return send_from_directory(BASE_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    app.run(host="0.0.0.0", port=port, debug=False)
