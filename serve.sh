#!/bin/sh
# Servidor local do Corda. Abra http://localhost:8731 no Google Chrome.
cd "$(dirname "$0")" && exec python3 -m http.server 8731 --bind 127.0.0.1
