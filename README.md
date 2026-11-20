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
