// Private-network smoke test from rod-mai-rod's frontend container.
const https = require('https');
// Usage: node probe-caddy.cjs <site-domain> <caddy-container>
const [host, container] = process.argv.slice(2);
if (!host || !container) { console.error('usage: node probe-caddy.cjs <site-domain> <caddy-container>'); process.exit(2); }
https.get({
  hostname: container, port: 443, servername: host, path: '/',
  headers: { Host: host }, rejectUnauthorized: false,
  timeout: 5000,
}, response => {
  console.log(`${host} ${response.statusCode}`);
  response.resume();
}).on('error', error => { console.error(error.message); process.exitCode = 1; });
