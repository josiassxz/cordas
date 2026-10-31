#!/bin/sh
# Servidor local do Corda. Abra http://localhost:8731 no Google Chrome.
cd "$(dirname "$0")" && exec python3 serve.py
