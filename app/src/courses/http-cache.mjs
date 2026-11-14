import { asciiBytes, httpMessage, tcpHandshake, tcpPacket } from '../authoring/helpers.mjs';
import zh from '../locales/http-cache.zh.mjs';

const client = { id: 'client', ip: '192.168.1.10', port: 52400 };
const server = { id: 'web', ip: '203.0.113.10', port: 80 };
const path = '/cache-demo.txt';
const policy = 'private, max-age=60, must-revalidate';
const v1 = 'Cache lesson v1\n';
const v2 = 'Cache lesson v2\n';
const tag1 = '"lesson-v1"';
const tag2 = '"lesson-v2"';

function request(tag) {
  return httpMessage({
    startLine: `GET ${path} HTTP/1.1`,
    headers: ['Host: www.example.com', ...(tag ? [`If-None-Match: ${tag}`] : [])],
  });
}

function okResponse(body, tag, date) {
  return httpMessage({
    startLine: 'HTTP/1.1 200 OK',
    headers: [`Date: ${date}`, `Cache-Control: ${policy}`, `ETag: ${tag}`, 'Content-Type: text/plain; charset=utf-8', `Content-Length: ${asciiBytes(body)}`],
    body,
  });
}

const initialRequest = request();
const initialResponse = okResponse(v1, tag1, 'Fri, 13 Nov 2026 00:00:00 GMT');
const conditionalRequest = request(tag1);
const notModified = httpMessage({
  startLine: 'HTTP/1.1 304 Not Modified',
  headers: ['Date: Fri, 13 Nov 2026 00:01:01 GMT', `Cache-Control: ${policy}`, `ETag: ${tag1}`],
});
const changedResponse = okResponse(v2, tag2, 'Fri, 13 Nov 2026 00:02:02 GMT');

const note = (text, at = 'client', tone = 'green') => ({ type: 'note', at, text, tone });
const getPacket = (at, message, label, payload) => tcpPacket({ from: client, to: server, at, message, label, payload });
const responsePacket = (at, message, label, payload) => tcpPacket({ from: server, to: client, at, message, label, payload });

export const lesson = {
  id: 'http-cache',
  name: 'HTTP Cache',
  title: 'Caching and Conditional Requests',
  layer: 7,
  nodes: ['client', 'router', 'internet', 'web'],
  lifelines: ['client', 'web'],
  latency: { 'client-web': 0.017 },
  legend: [['green', 'TCP'], ['amber', 'Request'], ['violet', 'Response'], [null, 'Data ACKs not shown'], [null, 'Cache hit adds no packets']],
  overview: {
    full: 'HTTP caching and conditional requests',
    description: 'A browser can reuse a saved response while it is fresh. When it needs validation, an ETag lets the server answer without sending the same body again. This lesson compares a local cache hit, a 304 validation response, and a changed 200 response.',
    facts: [
      ['Layer', 'Application (Layer 7)'],
      ['Transport', 'HTTP/1.1 over TCP'],
      ['Cache location', 'Private browser cache'],
      ['Freshness', 'Cache-Control: max-age=60'],
      ['Validator', 'ETag / If-None-Match'],
      ['Defined In', 'RFC 9110, RFC 9111'],
    ],
  },
  start: { nodes: ['client', 'router', 'internet', 'web'], frame: 'path' },
  steps: [
    {
      title: 'Store the First Response',
      desc: '200 OK brings a body and its cache policy',
      detail: 'The browser has no saved copy of /cache-demo.txt. After the TCP handshake it sends a GET. The server returns 16 body bytes, ETag "lesson-v1", and Cache-Control: private, max-age=60, must-revalidate. The browser stores the body and metadata in its own cache. DNS is already resolved; plain HTTP keeps the message bytes visible.',
      facts: [['Status', '200 OK'], ['Body size', '16 bytes'], ['Stored validator', '"lesson-v1"'], ['Policy', 'private, max-age=60, must-revalidate']],
      events: [
        { type: 'show', nodes: ['client', 'router', 'internet', 'web'], frame: 'path' },
        ...tcpHandshake({ client, server }),
        getPacket(0.040, initialRequest, 'FIRST GET', ['GET /cache-demo.txt', 'No saved representation']),
        responsePacket(0.057, initialResponse, '200 + BODY v1', ['ETag: "lesson-v1"', 'max-age=60 · 16 body bytes']),
        note('BODY v1 + ETAG SAVED'),
      ],
    },
    {
      title: 'Reuse While Fresh',
      desc: 'A local cache hit sends no HTTP packets',
      detail: 'Ten simulated seconds later, the browser needs the same resource again. With the same cache key and no request directive requiring validation, the saved response is still fresh. The browser uses its saved body without contacting the origin. Nothing new appears in the packet table: a cache hit is a local action, not a 304 response.',
      facts: [['Simulated elapsed time', '10 seconds'], ['Response age', 'About 10 seconds, below max-age=60'], ['Additional packets', '0'], ['Body source', 'Saved response v1']],
      events: [note('10 S LATER: LOCAL CACHE HIT'), note('NO NETWORK PACKET NEEDED')],
    },
    {
      title: 'Validate After Expiry',
      desc: 'If-None-Match asks whether the saved copy still matches',
      detail: 'At simulated time 61 seconds the saved response is stale. This policy requires successful validation before reuse. The browser sends If-None-Match: "lesson-v1". The current representation still matches, so the server replies 304 Not Modified with updated Date and cache metadata. A 304 has no body: the browser keeps its saved 16 bytes and updates the response metadata.',
      facts: [['Request validator', 'If-None-Match: "lesson-v1"'], ['Server result', '304 Not Modified'], ['Transferred response body', '0 bytes'], ['Browser action', 'Keep body v1; update metadata']],
      events: [
        note('61 S: VALIDATION REQUIRED'),
        getPacket(61.000, conditionalRequest, 'CONDITIONAL GET', ['If-None-Match: "lesson-v1"']),
        responsePacket(61.017, notModified, '304: NO BODY', ['ETag: "lesson-v1"', 'Reuse the saved body']),
        note('KEEP BODY v1; REFRESH METADATA'),
      ],
    },
    {
      title: 'Fetch the Changed Representation',
      desc: 'A different ETag means a new 200 response',
      detail: 'The origin changes the resource to version 2. At simulated time 122 seconds, more than 60 seconds after the successful validation, the browser validates again using its saved ETag. The selected representation now has ETag "lesson-v2", which does not match. The server therefore returns 200 OK with the new 16-byte body. The browser replaces its stored body and validator.',
      facts: [['Simulated elapsed time', '122 seconds'], ['Sent validator', '"lesson-v1"'], ['Current validator', '"lesson-v2"'], ['Result', '200 OK with body v2']],
      events: [
        note('ORIGIN CHANGED TO v2', 'web', 'navy'),
        getPacket(122.000, conditionalRequest, 'VALIDATE AGAIN', ['If-None-Match: "lesson-v1"']),
        responsePacket(122.017, changedResponse, '200 + BODY v2', ['ETag: "lesson-v2"', 'Replace the saved body']),
        note('BODY v2 + ETAG SAVED'),
      ],
    },
    {
      title: 'Read the Cache Directives',
      desc: 'no-cache and no-store have different jobs',
      detail: 'These are policy comparisons, not extra exchanges in the trace. An unqualified no-cache response may be stored, but it must be successfully validated before reuse. In the usual case, no-store tells a cache not to store the response. private permits this browser cache but excludes shared-cache storage. max-age sets freshness; it does not schedule deletion of the body.',
      facts: [['no-cache', 'Validate before reuse; storage is allowed'], ['no-store', 'Do not intentionally store this response'], ['private', 'Private cache allowed; shared cache excluded'], ['max-age', 'Freshness lifetime, not a deletion timer']],
      events: [note('NO-CACHE: VALIDATE BEFORE REUSE'), note('NO-STORE: DO NOT STORE', 'client', 'navy')],
    },
    {
      title: 'Know the Failure Boundary',
      desc: 'A required validation cannot be skipped when offline',
      detail: 'Once this response is stale, must-revalidate prevents reuse until validation succeeds. If the browser cannot reach the origin, it cannot silently treat the stale body as fresh under this policy. The exact browser error display is outside this lesson. Times and messages are scripted examples; playback compresses the long waits. Real browsers can reuse or reopen TCP connections, and HTTPS uses the same HTTP cache semantics.',
      facts: [['Offline and stale', 'No reuse until successful validation'], ['ETag meaning', 'Opaque validator; not necessarily a hash'], ['Timing', 'Simulated seconds; compressed playback'], ['Scope', 'One resource and one private cache']],
      events: [note('STALE + OFFLINE: CANNOT REUSE', 'client', 'navy')],
    },
  ],
  outro: {
    title: 'Three Ways to Reuse a Resource',
    desc: 'Local hit, validation, or replacement',
    text: 'The browser reused a fresh response locally, validated a stale response with a body-free 304, and fetched a new body when the ETag changed. These scripted messages teach HTTP cache decisions; the application is not a live browser-cache implementation. Press REPLAY to follow the same deterministic trace again.',
    facts: [['HTTP exchanges', '3 requests and 3 responses'], ['Fresh local hit', '0 additional network packets'], ['304 response', 'Headers only; keep the stored body'], ['Changed representation', '200 with a new body and ETag']],
  },
};

export const navigation = { id: lesson.id, name: lesson.name, full: 'Caching and conditional requests', group: 'application' };
export const meta = {
  version: 1,
  owner: 'Project course authors',
  objectives: ['Distinguish local freshness from validation.', 'Trace ETag, If-None-Match, 304 and changed 200.', 'Inspect known HTTP bytes and map headers to offsets.', 'Explain no-cache, no-store and offline must-revalidate.'],
  standards: [
    { title: 'RFC 9111 §4.2 — Freshness', url: 'https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2' },
    { title: 'RFC 9111 §4.3.4 — Freshening upon Validation', url: 'https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3.4' },
    { title: 'RFC 9110 §13.1.2 — If-None-Match', url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2' },
    { title: 'RFC 9110 §15.4.5 — 304 Not Modified', url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4.5' },
    { title: 'RFC 9111 §5.2.2 — Response Directives', url: 'https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2' },
  ],
  assumptions: ['DNS is already resolved.', 'Windows-style no-timestamp TCP options match the reused encoder.', 'No Vary variants, ranges, Service Workers or shared caches are simulated.', 'Long waits are compressed; connection lifetime is illustrative.'],
  expected: { steps: 6, packetRows: 9, httpRows: 6, freshHitStep: 1, validationStep: 2, changedStep: 3, notModifiedPacketIndex: 6 },
};

export default { lesson, navigation, translations: { zh }, meta };
