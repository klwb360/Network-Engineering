// Small authoring primitives for the original Ethernet / IPv4 / TCP renderer.
// These helpers describe teaching messages; they do not create network traffic.

export function asciiBytes(text) {
  if (typeof text !== 'string' || /[^\x00-\x7f]/.test(text)) {
    throw new TypeError('Teaching wire text must be ASCII; add an explicit UTF-8 encoder before using other characters.');
  }
  return text.length;
}

export function httpMessage({ startLine, headers = [], body }) {
  const lines = [startLine, ...headers];
  for (const line of lines) {
    asciiBytes(line);
    if (/[\r\n]/.test(line)) throw new TypeError('Each HTTP header must be a single line.');
  }
  if (!startLine) throw new TypeError('An HTTP start line is required.');
  if (body !== undefined) asciiBytes(body);
  if (/^HTTP\/1\.[01] 304(?: |$)/.test(startLine) && body !== undefined) {
    throw new TypeError('A 304 response cannot contain a body.');
  }
  const lengthHeader = headers.find(line => /^Content-Length:/i.test(line));
  if (lengthHeader && body !== undefined && Number(lengthHeader.split(':')[1].trim()) !== asciiBytes(body)) {
    throw new TypeError('Content-Length does not match the ASCII body bytes.');
  }
  // Ch() adds CRLF to every text item. The final empty item terminates the
  // header section. zw() appends data.body verbatim, with no extra CRLF.
  const text = [...lines, ''];
  const data = { text, ...(body === undefined ? {} : { body }) };
  return {
    data,
    firstLine: startLine,
    byteLength: text.reduce((count, line) => count + asciiBytes(line) + 2, 0) + (body === undefined ? 0 : asciiBytes(body)),
  };
}

export function tcpPacket({ from, to, at, flags = 'PA', label, payload = [], message, quick = false }) {
  if (!Number.isFinite(at) || at < 0) throw new TypeError('Packet time must be a nonnegative number of seconds.');
  if (!from?.id || !to?.id || !from.ip || !to.ip || !from.port || !to.port) {
    throw new TypeError('TCP endpoints need id, ip and port.');
  }
  if (message && (!Number.isInteger(message.byteLength) || message.byteLength < 0 || message.byteLength > 1460)) {
    throw new RangeError('This helper supports a single TCP payload of at most 1460 bytes; add a segmentation strategy for larger messages.');
  }
  // This authoring primitive uses the existing Windows-style, no-timestamp
  // handshake: SYN headers are 32 bytes; later TCP headers are 20 bytes.
  // Add a dedicated size strategy before authoring Linux/timestamp/SACK cases.
  const tcpHeaderBytes = flags.includes('S') ? 32 : 20;
  const frameLength = Math.max(60, 14 + 20 + tcpHeaderBytes + (message?.byteLength ?? 0));
  const response = flags === 'SA' || (message && from.port === 80);
  return {
    type: 'packet', from: from.id, to: to.id,
    color: message ? (response ? 'violet' : 'amber') : 'green',
    label, payload, quick,
    row: {
      time: `${at.toFixed(3)}s`, src: from.ip, dst: to.ip,
      proto: message ? 'HTTP' : 'TCP',
      info: message?.firstLine ?? `${from.port} → ${to.port} [${flags === 'SA' ? 'SYN, ACK' : flags === 'S' ? 'SYN' : 'ACK'}]`,
      len: `${frameLength} B`,
      wire: { tcp: { sport: from.port, dport: to.port, flags, ...(message ? { data: message.data } : {}) } },
    },
  };
}

export function tcpHandshake({ client, server, at = 0, latency = 0.017 }) {
  return [
    tcpPacket({ from: client, to: server, at, flags: 'S', label: 'SYN', payload: ['seq=0'], quick: true }),
    tcpPacket({ from: server, to: client, at: at + latency, flags: 'SA', label: 'SYN-ACK', payload: ['seq=0 ack=1'], quick: true }),
    tcpPacket({ from: client, to: server, at: at + latency * 2, flags: 'A', label: 'ACK', payload: ['seq=1 ack=1'], quick: true }),
  ];
}
