#!/usr/bin/env bash
# End-to-end tests for Arena.ai Agent Mode tool mapping and hosted-preview brainstorm server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPERPOWERS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MAPPING="$SUPERPOWERS_ROOT/skills/using-superpowers/references/arena-tools.md"
SKILL="$SUPERPOWERS_ROOT/skills/using-superpowers/SKILL.md"
HELPER="$SUPERPOWERS_ROOT/skills/brainstorming/scripts/helper.js"
SERVER="$SUPERPOWERS_ROOT/skills/brainstorming/scripts/server.cjs"
START_SCRIPT="$SUPERPOWERS_ROOT/skills/brainstorming/scripts/start-server.sh"

fail() { echo "  FAIL: $*" >&2; exit 1; }
pass() { echo "  PASS: $*"; }

echo "=== Arena.ai Superpowers Integration Tests ==="

[[ -f "$MAPPING" ]] || fail "arena-tools.md missing at $MAPPING"
for token in read_file write_file edit_file bash start_process get_process_output stop_process ask_user present_file --hosted-preview; do
  grep -q -- "$token" "$MAPPING" || fail "arena-tools.md missing '$token'"
done
grep -q "arena-tools.md" "$SKILL" || fail "SKILL.md Platform Adaptation missing arena-tools.md link"
pass "arena-tools.md mapping complete and linked from using-superpowers/SKILL.md"

node - "$HELPER" <<'NODE'
const assert = require('assert');
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function bootWithProtocol(protocol, host, sessionKey) {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
    send() {}
    close() {}
  }
  FakeWS.OPEN = 1;
  const env = {
    module: { exports: {} },
    window: {
      location: { protocol, host, reload() {}, replace() {} },
      sessionStorage: { getItem: (k) => k === 'brainstorm-session-key' ? sessionKey : null }
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      createElement: () => ({ style: {}, id: '' }),
      addEventListener() {},
      body: { appendChild() {} }
    },
    WebSocket: FakeWS,
    setTimeout: () => 1,
    clearTimeout() {},
    Date,
    console
  };
  new Function(...Object.keys(env), src)(...Object.values(env));
  return sockets[0].url;
}

assert.strictEqual(
  bootWithProtocol('https:', '54321-sandbox.e2b.app', null),
  'wss://54321-sandbox.e2b.app'
);
assert.strictEqual(
  bootWithProtocol('http:', 'localhost:54321', 'abc'),
  'ws://localhost:54321/?key=abc'
);
NODE
pass "helper.js upgrades to wss:// over https: and keeps ws:// over http:"

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/arena-hosted-preview-XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT

node - "$SERVER" "$TEST_DIR" <<'NODE'
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const [serverPath, testDir] = process.argv.slice(2);
const contentDir = path.join(testDir, 'content');
fs.mkdirSync(contentDir, { recursive: true });
fs.writeFileSync(path.join(contentDir, 'layout.html'), '<h2>Popup Layout Options</h2>');

const proc = spawn('node', [serverPath], {
  env: {
    ...process.env,
    BRAINSTORM_DIR: testDir,
    BRAINSTORM_HOST: '127.0.0.1',
    BRAINSTORM_HOSTED_PREVIEW: '1'
  }
});

function maskClientFrame(payloadStr) {
  const payload = Buffer.from(payloadStr, 'utf8');
  const mask = crypto.randomBytes(4);
  const header = Buffer.alloc(6);
  header[0] = 0x81;
  header[1] = 0x80 | payload.length;
  mask.copy(header, 2);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, masked]);
}

(async () => {
  try {
    const info = await new Promise((resolve, reject) => {
      let buf = '';
      proc.stdout.on('data', (d) => {
        buf += d.toString();
        const line = buf.split('\n').find((l) => l.includes('server-started'));
        if (line) resolve(JSON.parse(line));
      });
      proc.on('error', reject);
      setTimeout(() => reject(new Error('timeout starting hosted-preview server')), 5000);
    });

    // 1. Bare GET / without ?key= succeeds with 200 and NO X-Frame-Options / frame-ancestors block
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${info.port}/`, (r) => {
        let body = '';
        r.on('data', (c) => body += c);
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
      }).on('error', reject);
    });
    assert.strictEqual(res.status, 200);
    assert(res.body.includes('Popup Layout Options'));
    assert.strictEqual(res.headers['x-frame-options'], undefined);
    assert.strictEqual(res.headers['content-security-policy'], undefined);
    assert(/SameSite=None;\s*Secure/i.test((res.headers['set-cookie'] || []).join('; ')));

    // 2. WebSocket upgrade with HTTPS proxy Origin succeeds without key and logs user click to state/events
    await new Promise((resolve, reject) => {
      const sock = net.connect(info.port, '127.0.0.1', () => {
        const wsKey = crypto.randomBytes(16).toString('base64');
        const proxyHost = `${info.port}-sandbox.e2b.app`;
        sock.write(
          `GET / HTTP/1.1\r\n` +
          `Host: ${proxyHost}\r\n` +
          `Origin: https://${proxyHost}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${wsKey}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
        );
      });
      let head = '';
      sock.on('data', (chunk) => {
        head += chunk.toString('latin1');
        if (head.includes('101 Switching Protocols')) {
          sock.write(maskClientFrame(JSON.stringify({ type: 'click', choice: 'option-b', text: 'Option B' })));
          setTimeout(() => { sock.end(); resolve(); }, 150);
        }
      });
      sock.on('error', reject);
      setTimeout(() => reject(new Error('WS upgrade failed: ' + head)), 4000);
    });

    const events = fs.readFileSync(path.join(testDir, 'state', 'events'), 'utf8');
    assert(events.includes('"choice":"option-b"'), 'Expected click event in state/events');
  } finally {
    proc.kill();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
pass "server.cjs --hosted-preview serves iframe-safe 200 OK and records HTTPS-origin WebSocket clicks"

echo "ALL ARENA INTEGRATION TESTS PASSED"
