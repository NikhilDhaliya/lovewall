// Preloaded with `node --require` by `pnpm start` and the Docker image. Puts the TCP peer address of every request in
// the x-lovewall-ip header, replacing anything a client sent, so rate limits use the real connection address when no
// reverse proxy sits in front. Behind a proxy that sets X-Real-IP / X-Forwarded-For, set TRUST_PROXY=1 instead.
const http = require("node:http");

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, ...rest) {
  if (event === "request" && req && req.headers) {
    req.headers["x-lovewall-ip"] = (req.socket && req.socket.remoteAddress) || "";
  }
  return emit.call(this, event, req, ...rest);
};

process.env.LOVEWALL_SOCKET_IP = "1";
