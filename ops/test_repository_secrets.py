"""Synthetic cases for the credential scanner; no real secrets or network."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("repository_secrets", Path(__file__).with_name("check-repository-secrets.py"))
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class ScannerTests(unittest.TestCase):
    def test_public_and_privileged_jwts_are_distinguished(self):
        def jwt(role):
            encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
            return (encode({"alg": "HS256"}) + "." + encode({"role": role}) + ".fixture").encode()
        self.assertEqual(list(scanner.findings(jwt("anon"))), [])
        self.assertEqual(list(scanner.findings(jwt("service_role"))), [("privileged-supabase-jwt", 1)])

    def test_known_token_shape_reports_only_type_and_line(self):
        value = "ghp_" + "a" * 36
        self.assertEqual(list(scanner.findings(("\n" + value).encode())), [("github-token", 2)])

    def test_private_key_headers_are_detected(self):
        value = "-----BEGIN " + "OPENSSH PRIVATE KEY-----"
        self.assertEqual(list(scanner.findings(value.encode())), [("private-key", 1)])

    def test_plain_env_secret_and_source_literal_are_detected(self):
        secret = "a" * 32
        for value in ["CRON_SECRET=" + secret, 'const CRON_SECRET = "' + secret + '";']:
            self.assertEqual(list(scanner.findings(value.encode())), [("literal-secret-assignment", 1)])

    def test_placeholders_and_runtime_environment_lookups_are_allowed(self):
        self.assertEqual(list(scanner.findings(b"CRON_SECRET=replace-with-your-secret")), [])
        self.assertEqual(list(scanner.findings(b'const CRON_SECRET = Deno.env.get("CRON_SECRET");')), [])


if __name__ == "__main__":
    unittest.main()
