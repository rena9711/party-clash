const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const version = '1';
const title = 'PARTY CLASH大乱斗｜多人房间';
const description = '点击加入房间，和朋友一起开战！';
const roomPath = '/multiplayer.html';
const imagePath = `/assets/party-clash-invite-v${version}.png`;
const roomPage = readFileSync(join(__dirname, 'public', 'multiplayer.html'), 'utf8');

function escapeAttribute(value) {
  return value.replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]);
}

function inviteMeta(origin, code) {
  const image = new URL(imagePath, origin);
  const url = new URL(roomPath, origin);
  if (code) {
    url.searchParams.set('room', code);
    url.searchParams.set('invite', version);
  }

  return [
    `<meta name="description" content="${description}">`,
    `<meta name="party-clash:invite-version" content="${version}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="zh_CN">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${escapeAttribute(url.href)}">`,
    `<meta property="og:image" content="${escapeAttribute(image.href)}">`,
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="400">',
    '<meta property="og:image:height" content="400">',
    '<meta property="og:image:alt" content="PARTY CLASH">',
  ].join('\n');
}

module.exports = function mountRoomInvite(app) {
  app.get(['/', '/index.html', roomPath], (req, res, next) => {
    const room = req.query.room;
    const code = typeof room === 'string' && /^[a-f0-9]{6}$/i.test(room) ? room.toUpperCase() : '';
    if (!/^\/multiplayer\.html\/?$/i.test(req.path) && !code) return next();

    let origin;
    try {
      origin = new URL(process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).origin;
    } catch {
      return res.sendStatus(400);
    }

    res.set('Cache-Control', 'no-cache');
    res.type('html').send(roomPage.replace('</title>', `</title>\n${inviteMeta(origin, code)}\n`));
  });
};
