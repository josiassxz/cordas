# Servidor local do Corda sem cache (para sempre carregar o código mais novo).
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
http.server.test(HandlerClass=H, port=8731, bind='127.0.0.1')
