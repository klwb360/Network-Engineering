import assert from 'node:assert/strict';
import test from 'node:test';
import course from '../app/src/courses/http-cache.mjs';
import { httpMessage } from '../app/src/authoring/helpers.mjs';

// These assertions concern the authored wire trace and HTTP semantics, rather
// than renderer markup or the implementation of the authoring helpers.
// RFC 9111 §§4.2, 4.3.4, 5.2.2; RFC 9110 §§8.6, 13.1.2, 15.4.5.

const packets = course.lesson.steps.flatMap(step => step.events.flatMap(event => event.type === 'packet' ? [event] : event.type === 'stream' ? event.packets : []));
const httpPackets = packets.filter(packet => packet.row.proto === 'HTTP');

function inspectMessage(packet) {
  const data = packet.row.wire.tcp.data;
  assert(Array.isArray(data.text), 'The teaching message must expose its header lines.');
  assert.equal(data.text.at(-1), '', 'An empty final line must terminate the HTTP header section.');
  const [startLine, ...lines] = data.text.slice(0, -1);
  const headers = new Map();
  for (const line of lines) {
    const colon = line.indexOf(':');
    assert(colon > 0, `Malformed header: ${line}`);
    const name = line.slice(0, colon).toLowerCase();
    assert(!headers.has(name), `Unexpected duplicate header: ${name}`);
    headers.set(name, line.slice(colon + 1).trim());
  }
  return { startLine, headers, data, at: Number.parseFloat(packet.row.time), packet };
}

const messages = httpPackets.map(inspectMessage);
const exchanges = Array.from({ length: messages.length / 2 }, (_, i) => ({ request: messages[i * 2], response: messages[i * 2 + 1] }));
const cacheDirectives = response => new Map(response.headers.get('cache-control').split(',').map(part => {
  const [name, value] = part.trim().split('=');
  return [name, value ?? true];
}));

test('a fresh private-cache hit is local and does not manufacture a network response', () => {
  const step = course.lesson.steps[course.meta.expected.freshHitStep];
  assert(step.events.some(event => event.type === 'note'), 'The local cache action should still be explained.');
  assert.equal(step.events.filter(event => event.type === 'packet' || event.type === 'stream').length, 0);
  const policy = cacheDirectives(exchanges[0].response);
  assert.equal(policy.get('private'), true);
  assert.equal(policy.get('max-age'), '60');
  assert.equal(policy.get('must-revalidate'), true);
});

test('three GET exchanges distinguish first fetch, matching validation and a changed representation', () => {
  assert.equal(httpPackets.length, 6);
  assert.equal(exchanges.length, 3);
  const [first, validated, changed] = exchanges;
  for (const exchange of exchanges) {
    assert.equal(exchange.request.startLine, 'GET /cache-demo.txt HTTP/1.1');
    assert.equal(exchange.request.headers.get('host'), 'www.example.com');
    assert.equal(exchange.request.data.body, undefined);
    assert.equal(exchange.request.packet.from, 'client');
    assert.equal(exchange.response.packet.from, 'web');
  }
  assert.equal(first.request.headers.get('if-none-match'), undefined);
  assert.equal(first.response.startLine, 'HTTP/1.1 200 OK');
  const savedTag = first.response.headers.get('etag');
  assert.equal(savedTag, '"lesson-v1"');
  assert.equal(validated.request.headers.get('if-none-match'), savedTag);
  assert.equal(validated.response.startLine, 'HTTP/1.1 304 Not Modified');
  assert.equal(validated.response.headers.get('etag'), savedTag);
  assert.equal(changed.request.headers.get('if-none-match'), savedTag, 'A 304 must not invent a different saved validator.');
  assert.equal(changed.response.startLine, 'HTTP/1.1 200 OK');
  assert.equal(changed.response.headers.get('etag'), '"lesson-v2"');
  assert.notEqual(changed.response.headers.get('etag'), changed.request.headers.get('if-none-match'));
});

test('304 ends at its header section and preserves the applicable validation metadata', () => {
  // RFC 9110 §15.4.5: no content or trailers; relevant 200 metadata is sent.
  const response = exchanges[1].response;
  assert(!Object.hasOwn(response.data, 'body'));
  assert(!Object.hasOwn(response.data, 'trailers'));
  assert.equal(response.headers.get('date'), 'Fri, 13 Nov 2026 00:01:01 GMT');
  assert.equal(response.headers.get('etag'), '"lesson-v1"');
  assert.equal(response.headers.get('cache-control'), exchanges[0].response.headers.get('cache-control'));
  assert.equal(response.headers.get('content-length'), undefined, 'The sample omits Content-Length instead of pretending the stored representation has zero bytes.');
  const wire = response.data.text.map(line => `${line}\r\n`).join('');
  assert.equal(wire.indexOf('\r\n\r\n'), wire.length - 4);
});

test('200 bodies have known ASCII bytes, exact Content-Length and distinct representations', () => {
  const first = exchanges[0].response;
  const changed = exchanges[2].response;
  for (const response of [first, changed]) {
    const body = response.data.body;
    assert.equal(typeof body, 'string');
    assert.match(body, /^[\x00-\x7f]*$/);
    assert.equal(Buffer.byteLength(body, 'utf8'), 16);
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(body, 'utf8'));
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  }
  assert.equal(first.data.body, 'Cache lesson v1\n');
  assert.equal(changed.data.body, 'Cache lesson v2\n');
  assert.notEqual(first.data.body, changed.data.body);
});

test('Date and simulated packet time agree, and both validations happen after the current freshness interval', () => {
  // Date has whole-second precision. Model values deliberately avoid the exact
  // max-age boundary, so network delay does not affect the stale decisions.
  const epoch = Date.parse('2026-11-13T00:00:00Z');
  for (const { response } of exchanges) {
    const dateSeconds = (Date.parse(response.headers.get('date')) - epoch) / 1000;
    assert(Number.isFinite(dateSeconds));
    assert.equal(dateSeconds, Math.floor(response.at));
  }
  const [first, validated, changed] = exchanges;
  const lifetime = Number(cacheDirectives(first.response).get('max-age'));
  const latency = course.lesson.latency['client-web'];
  assert.equal(validated.request.at, 61);
  assert.equal(changed.request.at, 122);
  assert(validated.request.at - (first.response.at + latency) > lifetime);
  assert(changed.request.at - (validated.response.at + latency) > lifetime, 'The second expiration must follow the successful 304 validation, not the original fetch.');
  for (const { request, response } of exchanges) {
    assert(Math.abs(response.at - request.at - latency) < 1e-9);
  }
});

test('the script explicitly bounds connection lifetime and cache implementation claims', () => {
  const disclosures = [...course.meta.assumptions, ...course.lesson.steps.map(step => step.detail), course.lesson.outro.text].join('\n');
  assert.match(disclosures, /connection lifetime is illustrative/i);
  assert.match(disclosures, /reuse or reopen TCP connections/i);
  assert.match(disclosures, /playback compresses the long waits/i);
  assert.match(disclosures, /not a live browser-cache implementation/i);
  assert.match(disclosures, /must-revalidate prevents reuse until validation succeeds/i);
});

test('header CRLF injection is rejected before authoring a wire message', () => {
  assert.throws(() => httpMessage({ startLine: 'GET / HTTP/1.1\r\nInjected: yes' }), /single line/);
  assert.throws(() => httpMessage({ startLine: 'GET / HTTP/1.1', headers: ['Host: example.com\r\nInjected: yes'] }), /single line/);
  assert.throws(() => httpMessage({ startLine: 'GET / HTTP/1.1', headers: ['Host: example.com\nInjected: yes'] }), /single line/);
});

test('non-ASCII wire input requires a deliberate encoder instead of character-count lengths', () => {
  assert.throws(() => httpMessage({ startLine: 'GET /缓存 HTTP/1.1' }), /ASCII/);
  assert.throws(() => httpMessage({ startLine: 'GET / HTTP/1.1', headers: ['X-Title: 缓存'] }), /ASCII/);
  assert.throws(() => httpMessage({ startLine: 'HTTP/1.1 200 OK', body: '缓存' }), /ASCII/);
});

test('Content-Length must match an authored ASCII response body', () => {
  assert.throws(() => httpMessage({ startLine: 'HTTP/1.1 200 OK', headers: ['Content-Length: 15'], body: 'Cache lesson v1\n' }), /Content-Length/);
  assert.throws(() => httpMessage({ startLine: 'HTTP/1.1 200 OK', headers: ['Content-Length: 0'], body: 'x' }), /Content-Length/);
  const body = 'Cache lesson v1\n';
  const message = httpMessage({ startLine: 'HTTP/1.1 200 OK', headers: ['Content-Length: 16'], body });
  const wire = message.data.text.map(line => `${line}\r\n`).join('') + message.data.body;
  assert.equal(wire.slice(wire.indexOf('\r\n\r\n') + 4), body, 'The encoder must not append an extra CRLF to the body.');
});

test('304 rejects even an empty body field and does not equate body-free with Content-Length zero', () => {
  assert.throws(() => httpMessage({ startLine: 'HTTP/1.1 304 Not Modified', body: '' }), /304/);
  assert.throws(() => httpMessage({ startLine: 'HTTP/1.1 304 Not Modified', body: 'x' }), /304/);
  // RFC 9110 §8.6 permits a 304 Content-Length equal to the corresponding 200
  // representation length. The course omits that optional header altogether.
  const optionalLength = httpMessage({ startLine: 'HTTP/1.1 304 Not Modified', headers: ['Content-Length: 16'] });
  assert(!Object.hasOwn(optionalLength.data, 'body'));
  assert(optionalLength.data.text.includes('Content-Length: 16'));
});
