# Corda — estúdio de guitarra para a AeroBand AG01

1. Feche o app da Aeroband (só um app conecta por vez) e ligue a guitarra.
2. `./serve.sh` e abra **http://localhost:8731 no Google Chrome** (Web Bluetooth).
3. Conectar guitarra → escolha "AeroBand Midi". Sem guitarra: "Experimentar sem guitarra" (Espaço = ↓, ↑ = ↑, X = errar).

`npm test` roda os testes (sem navegador e sem hardware). A arquitetura e os contratos estão em `docs/ARCHITECTURE.md`;
limitações do hardware em `docs/ARCHITECTURE.md §3`, `docs/TONES.md` e na tela Laboratório. A v1 está preservada em `~/Desktop/corda-v1-backup`.
