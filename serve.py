#!/usr/bin/env python3
"""Dev server: static files with Cache-Control: no-cache.

Plain `python3 -m http.server` sends no caching headers, so Chrome's memory
cache can serve a stale ES module next to a fresh one after edits — the page
runs a mixed build and behaves impossibly. no-cache forces revalidation on
every request (304s when unchanged, so it stays fast).
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8631
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'  # pass 0.0.0.0 for phone-on-LAN testing
    print(f'Serving on http://{host}:{port}')
    HTTPServer((host, port), NoCacheHandler).serve_forever()
