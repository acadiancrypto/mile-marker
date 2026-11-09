"""Headless test runner: serves the project on :8081, opens tests/ in headless Edge,
waits for the page to POST its result to /__report, prints it, exits 0 only on "All N passed".
Usage (from the project root): python tests/run.py
"""
import http.server, os, subprocess, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8081
EDGE = os.environ.get("EDGE", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
report = {}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        if self.path == "/__report":
            n = int(self.headers.get("Content-Length", 0))
            report["text"] = self.rfile.read(n).decode("utf-8", "replace")
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="mm-test-")
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
                             "--user-data-dir=" + profile, f"http://localhost:{PORT}/tests/"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 45
    while "text" not in report and time.time() < deadline:
        time.sleep(0.2)
    edge.kill()
    srv.shutdown()
    text = report.get("text", "NO RESULT (timed out waiting for the test page)")
    print(text)
    first = text.splitlines()[-1] if text else ""
    sys.exit(0 if first.startswith("All ") and first.endswith(" passed") else 1)


if __name__ == "__main__":
    main()
