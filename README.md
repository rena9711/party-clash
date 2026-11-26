# PARTY CLASH browser MVP

A runnable 2–10-player browser multiplayer prototype using Express and Socket.IO.

## Start

```bash
npm install
npm start
```

Open `http://localhost:3000`. To test with several phones, deploy to an HTTPS Node.js host (Render, Railway, Fly.io, etc.) or expose port 3000 on your local network and visit the computer's LAN IP from phones on the same Wi-Fi.

One player creates a room; other players join with the 6-character code or invite URL. The host chooses among 8 games and starts a synchronized round. Each player submits a score; the server ranks players and keeps cumulative points. One attack per player per round.

## Prototype limitations

- Rooms are stored in memory; server restart loses all rooms.
- No durable reconnect, authentication, or persistence.
- Several game mechanics use local scoring and are not cheat-resistant. Reaction timing across devices is approximate.
- Some attacks are visual prototypes rather than full deterministic multiplayer effects.
- Bomb passing and RPS are simplified local interactions rather than fully server-authoritative multiplayer mechanics.
- Not production-ready. Implement server-authoritative validation, reconnect tokens, Redis persistence, anti-cheat, and comprehensive cross-device tests before public launch.

## Room passes

Set `ROOM_PASS_MODE=qa` on the QA service with `DATABASE_URL` configured to test checkout without charging. `ROOM_PASS_MODE` is off by default. Trial counts and payments are tracked separately by mode. In QA mode and WeChat mode, the host can close the room page and return via the lobby while the room is valid.

A pass powers the room that bought it for 24 hours from confirmed payment. Without a pass, beginning a multiplayer game uses one of each participating player's three trials. Browser storage supplies the player identity for the web beta.

For real WeChat Native payments, use a merchant account enabled for Native payments and linked to an AppID. Configure the following as environment variables or secret values before setting `ROOM_PASS_MODE=wechat`:

- `WECHAT_PAY_APP_ID`, `WECHAT_PAY_MERCHANT_ID`, `WECHAT_PAY_MERCHANT_SERIAL`
- `WECHAT_PAY_PRIVATE_KEY` with the merchant API private key in PEM format
- `WECHAT_PAY_PUBLIC_KEY_ID`, `WECHAT_PAY_PUBLIC_KEY` with the WeChat Pay verification key in PEM format
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_NOTIFY_URL` with the service's HTTPS origin followed by `/api/room-pass/wechat-notify`

The website displays a WeChat Native QR code and provides a server-side order status check. Confirm merchant onboarding, order creation, payment callback and delivery with the intended deployment before enabling real checkout for players.

Run `ROOM_PASS_TEST_DATABASE_URL=... node --test test/room-pass.test.js` against a disposable PostgreSQL database to test trials and restart recovery.
