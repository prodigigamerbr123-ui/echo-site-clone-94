"""Import the legacy semicolon CSV on the VM; default is a rolled-back dry run.

Run as root: python3 import-student-csv.py SOURCE.csv [--apply]
Keep the source, reports and rollback SQL in a private directory outside Git.
No welcome helpers, message queue inserts or external requests are executed.
"""
import argparse
import csv
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import unicodedata
import uuid

os.umask(0o077)


def normalized(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", value)
                           if not unicodedata.combining(c)).lower().split())


def phones(value):
    values = []
    for part in re.split(r"[,;/]", value):
        number = re.sub(r"\D", "", part).lstrip("0")
        if len(number) in (10, 11):
            number = "55" + number
        if number.startswith("55") and len(number) in (12, 13):
            values.append(number)
    return list(dict.fromkeys(values))


def sql_literal(value):
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def sql(statement):
    result = subprocess.run([
        "docker", "exec", "-i", "workout-supabase-db", "psql", "-U",
        "supabase_admin", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-f", "-",
    ], input=statement.encode(), capture_output=True)
    if result.returncode:
        (pathlib.Path(__file__).parent / "import-error.log").write_bytes(result.stderr)
        raise RuntimeError("Database operation refused; transaction rolled back (private output withheld)")
    return result.stdout.decode().strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--shared-phone-migration", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.apply and (args.source.parent / "import-applied.json").exists():
        raise ValueError("This batch already has an applied report; inspect before retrying")
    raw = args.source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    rows = list(csv.DictReader(raw.decode("utf-8-sig").splitlines(), delimiter=";"))
    if not rows or set(rows[0]) != {"Cliente", "Telefones", "", "Planos", "Cadastro", "Cidade"}:
        raise ValueError("Unexpected source columns")
    existing = json.loads(sql("SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM (SELECT id,name,phone FROM students) s;"))
    known = {(normalized(s["name"]), number) for s in existing for number in phones(s["phone"])}
    existing_by_name = {}
    existing_ids = {student["id"] for student in existing}
    for student in existing:
        existing_by_name.setdefault(normalized(student["name"]), []).append(student)
    accepted, seen, skipped = [], set(), []
    for line, row in enumerate(rows, 2):
        name = " ".join(row["Cliente"].split())
        if not name:
            skipped.append({"line": line, "reason": "empty_name"})
            continue
        candidates = phones(row["Telefones"])
        # Exact name alone can be a homonym: never merge conflicting phones.
        key = (normalized(name), tuple(sorted(candidates)), row["Telefones"].strip() if not candidates else "")
        if key in seen:
            skipped.append({"line": line, "reason": "duplicate_source_identity"})
            continue
        seen.add(key)
        student_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "workout-legacy:" + digest + ":" + str(line)))
        if student_id in existing_ids:
            skipped.append({"line": line, "reason": "already_imported_source_row"})
            continue
        if any((normalized(name), number) in known for number in candidates):
            skipped.append({"line": line, "reason": "existing_name_and_phone"})
            continue
        if normalized(name) in existing_by_name:
            raise ValueError("Existing name with conflicting contact; review privately before importing")
        original_date = datetime.datetime.strptime(row["Cadastro"].strip(), "%d/%m/%Y").date()
        if original_date > datetime.datetime.now(datetime.timezone.utc).date():
            raise ValueError("Future source registration date")
        accepted.append({"id": student_id, "name": name,
                         "phone": candidates[0] if candidates else row["Telefones"].strip(),
                         "city": row["Cidade"].strip() or None, "plan": row["Planos"].strip() or None,
                         "created_at": str(original_date) + "T00:00:00-03:00"})
    payload = sql_literal(json.dumps(accepted, ensure_ascii=False))
    migration = args.shared_phone_migration.read_text(encoding="utf-8")
    statement = """BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE students IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE scheduled_messages IN SHARE ROW EXCLUSIVE MODE;
""" + migration + """
INSERT INTO supabase_migrations.schema_migrations(version,name)
VALUES ('20261027030000','allow_shared_student_phones') ON CONFLICT(version) DO NOTHING;
CREATE TEMP TABLE import_before ON COMMIT DROP AS SELECT id,md5(row_to_json(s)::text) hash FROM students s;
CREATE TEMP TABLE queue_before ON COMMIT DROP AS SELECT id,md5(row_to_json(m)::text) hash FROM scheduled_messages m;
CREATE TEMP TABLE import_result ON COMMIT DROP AS
WITH added AS (
 INSERT INTO students(id,name,phone,city,plan,created_at,status,messages_enabled,had_evaluation)
 SELECT id,name,phone,city,plan,created_at,'active',false,NULL
 FROM jsonb_to_recordset(""" + payload + """::jsonb)
 AS r(id uuid,name text,phone text,city text,plan text,created_at timestamptz)
 ON CONFLICT(id) DO NOTHING RETURNING id
) SELECT id FROM added;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM import_before b LEFT JOIN students s USING(id) WHERE s.id IS NULL OR b.hash IS DISTINCT FROM md5(row_to_json(s)::text)) THEN RAISE EXCEPTION 'Existing students changed'; END IF;
 IF EXISTS((SELECT id,hash FROM queue_before EXCEPT SELECT id,md5(row_to_json(m)::text) FROM scheduled_messages m) UNION ALL (SELECT id,md5(row_to_json(m)::text) FROM scheduled_messages m EXCEPT SELECT id,hash FROM queue_before)) THEN RAISE EXCEPTION 'Message queue changed'; END IF;
END $$;
SELECT json_build_object('inserted',(SELECT count(*) FROM import_result),'total_students',(SELECT count(*) FROM students),'active_without_messages',(SELECT count(*) FROM students WHERE id IN (SELECT id FROM import_result) AND status='active' AND messages_enabled=false));
""" + ("COMMIT;" if args.apply else "ROLLBACK;")
    result = json.loads(sql(statement))
    result.update(applied=args.apply, source_sha256=digest, source_rows=len(rows),
                  skipped=skipped, prepared=len(accepted))
    report = args.source.parent / ("import-applied.json" if args.apply else "import-dry-run.json")
    report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    if args.apply:
        result["imported_ids"] = [student["id"] for student in accepted]
        report.write_text(json.dumps(result, indent=2), encoding="utf-8")
        rollback = "BEGIN;\nDELETE FROM students WHERE id IN (" + ",".join(sql_literal(s["id"]) for s in accepted) + ");\nCOMMIT;\n"
        if accepted:
            (args.source.parent / "rollback-import.sql").write_text(rollback, encoding="utf-8")
    print(json.dumps({**{key: value for key, value in result.items() if key != "imported_ids"}, "skipped": len(skipped)}))


if __name__ == "__main__":
    main()
