"""Scan Git content without printing secret values. Run with --history for reachable blobs."""
import argparse
import base64
import io
import json
from pathlib import Path
import re
import subprocess

PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "github-token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "google-api-key": re.compile(r"\bAIza[A-Za-z0-9_-]{35}\b"),
    "private-api-key": re.compile(r"\b(?:sb_secret_|sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}\b"),
}
JWT = re.compile(r"\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+")
ASSIGNMENT = re.compile(
    r"""(?:EVOLUTION_INSTANCE_TOKEN|EVOLUTION_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']([A-Za-z0-9_.-]{20,})["']"""
)
ENV_ASSIGNMENT = re.compile(
    r"^\s*(?:export\s+)?(?:EVOLUTION_INSTANCE_TOKEN|EVOLUTION_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*([A-Za-z0-9_.-]{20,})\s*$",
    re.MULTILINE,
)
TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".py", ".sh", ".ps1",
                 ".md", ".yml", ".yaml", ".toml", ".txt", ".sql", ".conf", ".example", ".pem", ".key", ".p12", ".pfx", ".dump"}


def git(*args):
    return subprocess.check_output(["git", *args])


def candidate(path):
    name = Path(path)
    return name.suffix.lower() in TEXT_SUFFIXES or ".env" in name.name or name.name.endswith(".sql.gz") or name.name == "Dockerfile"


def findings(content):
    text = content.decode("utf-8", errors="replace")
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(text):
            yield kind, text.count("\n", 0, match.start()) + 1
    for match in JWT.finditer(text):
        try:
            payload = json.loads(base64.urlsafe_b64decode(match[1] + "=" * (-len(match[1]) % 4)))
            if payload.get("role") == "service_role":
                yield "privileged-supabase-jwt", text.count("\n", 0, match.start()) + 1
        except (ValueError, AttributeError, UnicodeError):
            pass
    for match in list(ASSIGNMENT.finditer(text)) + list(ENV_ASSIGNMENT.finditer(text)):
        if not any(word in match[1].lower() for word in ("placeholder", "example", "replace", "dummy", "test", "your")):
            yield "literal-secret-assignment", text.count("\n", 0, match.start()) + 1


def current_files():
    paths = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").decode().split("\0")
    for name in sorted(set(paths)):
        path = Path(name)
        if name and candidate(name) and path.is_file() and path.stat().st_size <= 2_000_000:
            yield name, path.read_bytes()


def history_files():
    names = {}
    for line in git("rev-list", "--objects", "--all").decode().splitlines():
        oid, _, name = line.partition(" ")
        if name and candidate(name):
            names.setdefault(oid, name)
    object_ids = list(names)
    sizes = subprocess.check_output(
        ["git", "cat-file", "--batch-check"], input="".join(oid + "\n" for oid in object_ids).encode()
    ).decode()
    selected = [line.split()[0] for line in sizes.splitlines()
                if len(line.split()) == 3 and line.split()[1] == "blob" and int(line.split()[2]) <= 2_000_000]
    stream = io.BytesIO(subprocess.check_output(
        ["git", "cat-file", "--batch"], input="".join(oid + "\n" for oid in selected).encode()
    ))
    for oid in selected:
        header = stream.readline().split()
        content = stream.read(int(header[2]))
        stream.read(1)
        yield oid[:12] + ":" + names[oid], content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    count = 0
    scanned = 0
    for name, content in history_files() if args.history else current_files():
        scanned += 1
        if Path(name).suffix in {".p12", ".pfx", ".dump"} or name.endswith(".sql.gz"):
            count += 1
            print(json.dumps({"path": name, "line": 0, "kind": "private-archive-file"}, ensure_ascii=True))
        for kind, line in findings(content):
            count += 1
            # Never emit matching content, credentials, or JWT payloads.
            print(json.dumps({"path": name, "line": line, "kind": kind}, ensure_ascii=True))
    print(json.dumps({"scope": "reachable-history" if args.history else "working-tree",
                      "files_scanned": scanned, "findings": count}))
    return 1 if count else 0


if __name__ == "__main__":
    raise SystemExit(main())
