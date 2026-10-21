// Private-network smoke test from rod-mai-rod's frontend container.
const https = require('https');
const host = process.argv[2] || 'rod-mai-rod.tntproduction.tech';
https.get({
  hostname: 'copie-caddy-1', port: 443, servername: host, path: '/',
  headers: { Host: host }, rejectUnauthorized: false,
  timeout: 5000,
}, response => {
  console.log(`${host} ${response.statusCode}`);
  response.resume();
}).on('error', error => { console.error(error.message); process.exitCode = 1; });
