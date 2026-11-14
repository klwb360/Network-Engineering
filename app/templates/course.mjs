// Copy to app/src/courses/<id>.mjs, then replace every teaching placeholder.
// Imports are relative to that destination; this template is not registered.
import {asciiBytes,httpMessage,tcpHandshake,tcpPacket} from '../authoring/helpers.mjs';

const client={id:'client',ip:'192.168.1.10',port:52410};
const server={id:'web',ip:'203.0.113.10',port:80};
const body='Template body\n';
const request=httpMessage({startLine:'GET /template.txt HTTP/1.1',headers:['Host: www.example.com']});
const response=httpMessage({
  startLine:'HTTP/1.1 200 OK',
  headers:['Content-Type: text/plain; charset=utf-8',`Content-Length: ${asciiBytes(body)}`,'Cache-Control: no-store'],
  body,
});

export const lesson={
  id:'replace-me',
  name:'Example HTTP',
  title:'A Minimal HTTP Exchange',
  layer:7,
  nodes:['client','router','internet','web'],
  lifelines:['client','web'],
  latency:{'client-web':0.017},
  legend:[['green','TCP'],['amber','Request'],['violet','Response'],[null,'Data ACKs not shown']],
  overview:{
    full:'An editable course template',
    description:'Follow one small HTTP request and response. Replace this example with a specific learning goal, a standards-backed explanation, and tested messages.',
    facts:[['Layer','Application (Layer 7)'],['Transport','HTTP/1.1 over TCP'],['Scope','One deterministic teaching exchange']],
  },
  start:{nodes:['client','router','internet','web'],frame:'path'},
  steps:[
    {
      title:'Open a TCP Connection',
      desc:'Establish the connection before sending HTTP',
      detail:'DNS is already resolved in this example. The client and server exchange SYN, SYN-ACK and ACK. The trace uses the existing no-timestamp TCP encoding strategy.',
      facts:[['Server port','80'],['Handshake','SYN → SYN-ACK → ACK']],
      events:[{type:'show',nodes:['client','router','internet','web'],frame:'path'},...tcpHandshake({client,server})],
    },
    {
      title:'Exchange a Small Resource',
      desc:'Inspect known header and body bytes',
      detail:'The client requests /template.txt. The server returns 200 OK with a short ASCII body and a matching Content-Length. This is a scripted message; the application does not send it to a real origin.',
      facts:[['Status','200 OK'],['Body length',`${asciiBytes(body)} bytes`],['Cache policy','no-store']],
      events:[
        tcpPacket({from:client,to:server,at:0.040,message:request,label:'EXAMPLE GET',payload:['GET /template.txt','No request body']}),
        tcpPacket({from:server,to:client,at:0.057,message:response,label:'EXAMPLE 200',payload:['Known ASCII body','Inspect Content-Length and body offsets']}),
        {type:'note',at:'client',text:'KNOWN BODY BYTES',tone:'green'},
      ],
    },
  ],
  outro:{
    title:'One Trace, Several Views',
    desc:'The same events drive the network, sequence and inspector',
    text:'Review the packet list, select a message, and hover a field to inspect its byte range. Replace this summary with the concrete outcome of your own course.',
    facts:[['Teaching packets','3 TCP handshake packets and 2 HTTP messages'],['Next action','Replace the example before registering it']],
  },
};

export const navigation={id:lesson.id,name:lesson.name,full:'Minimal exchange template',group:'application'};

// Move a larger table to app/src/locales/<id>.zh.mjs. Wire bytes stay ASCII and
// are never translated; exact English interface text is the translation key.
export const translations={zh:{strings:{
  'A Minimal HTTP Exchange':'最小 HTTP 交换',
  'An editable course template':'可编辑的课程模板',
  'Follow one small HTTP request and response. Replace this example with a specific learning goal, a standards-backed explanation, and tested messages.':'跟随一次简短的 HTTP 请求和响应。请把示例替换为明确的教学目标、符合标准的讲解和经过验证的报文。',
  'One deterministic teaching exchange':'一次确定性的教学交换',
  'Open a TCP Connection':'建立 TCP 连接',
  'Establish the connection before sending HTTP':'发送 HTTP 前先建立连接',
  'DNS is already resolved in this example. The client and server exchange SYN, SYN-ACK and ACK. The trace uses the existing no-timestamp TCP encoding strategy.':'本示例已完成 DNS 解析。客户端与服务器交换 SYN、SYN-ACK 和 ACK，采用现有的不带时间戳的 TCP 编码策略。',
  'Exchange a Small Resource':'交换一个小资源',
  'Inspect known header and body bytes':'检查已知的头部和正文字节',
  'The client requests /template.txt. The server returns 200 OK with a short ASCII body and a matching Content-Length. This is a scripted message; the application does not send it to a real origin.':'客户端请求 /template.txt。服务器返回 200 OK、简短的 ASCII 正文和相符的 Content-Length。这是脚本定义的报文，应用不会向真实源站发送它。',
  'EXAMPLE GET':'示例 GET',
  'No request body':'请求没有正文',
  'EXAMPLE 200':'示例 200',
  'Known ASCII body':'已知的 ASCII 正文',
  'Inspect Content-Length and body offsets':'检查 Content-Length 和正文偏移',
  'KNOWN BODY BYTES':'已知的正文字节',
  'One Trace, Several Views':'一条过程，多种视图',
  'The same events drive the network, sequence and inspector':'同一组事件驱动网络图、时序图和检查器',
  'Review the packet list, select a message, and hover a field to inspect its byte range. Replace this summary with the concrete outcome of your own course.':'查看报文列表，选择一条报文，再悬停字段来检查字节范围。请把总结替换为自有课程的具体学习结果。',
  '3 TCP handshake packets and 2 HTTP messages':'3 条 TCP 握手报文和 2 条 HTTP 报文',
  'Replace the example before registering it':'注册前替换示例内容',
  'Minimal exchange template':'最小交换模板',
}}};

export const meta={
  version:1,
  owner:'Replace with the course maintainer',
  objectives:['Replace this example with the behavior the learner should explain.'],
  standards:[
    {title:'RFC 9110 §9.3.1 — GET',url:'https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.1'},
    {title:'RFC 9110 §15.3.1 — 200 OK',url:'https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.1'},
  ],
  assumptions:['DNS is already resolved.','Plain HTTP keeps known teaching bytes visible.','No real origin or packet capture is used.'],
  expected:{steps:2,packetRows:5,httpRows:2},
};

export default {lesson,navigation,translations,meta};
