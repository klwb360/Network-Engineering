import {test} from 'node:test';
import assert from 'node:assert/strict';
import course from '../app/src/courses/http-cache.mjs';
import {validateCourse,flattenPackets} from '../app/src/authoring/validate.mjs';
import {registerCourses,translateCourseText} from '../app/src/courses/registry.mjs';
import {capabilities} from '../scripts/prepare-runtime.mjs';
import {httpMessage,tcpPacket} from '../app/src/authoring/helpers.mjs';
import fs from 'node:fs';

const clone=()=>structuredClone(course);
test('the first independent course satisfies the authoring contract',()=>assert.deepEqual(validateCourse(course,capabilities),[]));

test('the published course template remains compatible with registration and validation',async()=>{
  let source=fs.readFileSync(new URL('../app/templates/course.mjs',import.meta.url),'utf8');
  const helpers=new URL('../app/src/authoring/helpers.mjs',import.meta.url).href;
  source=source.replace("'../authoring/helpers.mjs'",JSON.stringify(helpers));
  const template=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.deepEqual(validateCourse(template.default,capabilities),[]);
});

test('invalid topology, camera frames and missing delays fail before boot',()=>{
  const value=clone();
  value.lesson.nodes.push('cache-server');
  value.lesson.start.frame='imaginary-frame';
  delete value.lesson.latency['client-web'];
  const issues=validateCourse(value,capabilities);
  assert(issues.some(x=>x.message.includes('Unknown upstream SVG node')));
  assert(issues.some(x=>x.message.includes('Unknown upstream camera frame')));
  assert(issues.some(x=>x.path==='lesson.latency'));
});

test('known camera frames with no course nodes are rejected rather than producing an empty bounding box',()=>{
  const value=clone();value.lesson.start.frame='bgp';
  assert(validateCourse(value,capabilities).some(x=>x.message.includes('Camera frame must include')));
});

test('unknown payload objects cannot reach the original codec dispatcher',()=>{
  const value=clone();flattenPackets(value.lesson)[0].row.wire.tcp.data={unsupportedPayload:true};
  assert(validateCourse(value,capabilities).some(x=>x.message.includes('No supported upstream payload codec')));
});

test('short-message helpers reject implicit multi-segment messages',()=>{
  const message=httpMessage({startLine:'HTTP/1.1 200 OK',body:'x'.repeat(1460)});
  assert.throws(()=>tcpPacket({from:{id:'web',ip:'203.0.113.10',port:80},to:{id:'client',ip:'192.168.1.10',port:52400},at:0,message,label:'oversized'}),/segmentation strategy/);
});

test('invalid OSI layers, event types and wire encodings fail validation',()=>{
  const value=clone();value.lesson.layer=8;
  value.lesson.steps[0].events.push({type:'fetch-live-packets'});
  flattenPackets(value.lesson)[0].row.wire={inventedProtocol:{}};
  const issues=validateCourse(value,capabilities);
  assert(issues.some(x=>x.path==='lesson.layer'));
  assert(issues.some(x=>x.message==='Unsupported event type'));
  assert(issues.some(x=>x.message.includes('No supported upstream protocol branch')));
});

test('out-of-order packet times and invalid ports fail with useful paths',()=>{
  const value=clone(),packets=flattenPackets(value.lesson);
  packets[2].row.time='0.001s';packets[0].row.wire.tcp.dport=70000;
  const issues=validateCourse(value,capabilities);
  assert(issues.some(x=>x.path.endsWith('.row.time')));
  assert(issues.some(x=>x.message==='Port must be in 1..65535'));
});

test('new narrative requires a Chinese translation',()=>{
  const value=clone();delete value.translations.zh.strings[value.lesson.steps[0].detail];
  assert(validateCourse(value,capabilities).some(x=>x.message.startsWith('Missing narrative translation')));
});

test('malformed HTTP bodies report issues rather than crashing the validator',()=>{
  const value=clone();
  flattenPackets(value.lesson).find(p=>p.row.proto==='HTTP'&&p.from==='web').row.wire.tcp.data.body=null;
  assert(validateCourse(value,capabilities).some(x=>x.message.includes('Text body must be ASCII')));
});

test('incorrect Content-Length and body-bearing 304 responses are rejected',()=>{
  const value=clone(),packet=flattenPackets(value.lesson).find(p=>p.row.info.includes('304'));
  packet.row.wire.tcp.data.body='unexpected';packet.row.wire.tcp.data.text.splice(-1,0,'Content-Length: 0');
  const issues=validateCourse(value,capabilities);
  assert(issues.some(x=>x.message.includes('Content-Length differs')));
  assert(issues.some(x=>x.message.includes('304 responses must not contain a body')));
});

test('a rejected registration batch does not partially change the original registries',()=>{
  const lessons={http:{id:'http'}},navigation=[{id:'http'}];
  const collision=clone();collision.lesson.id='http';collision.navigation.id='http';
  assert.throws(()=>registerCourses({lessons,navigation,capabilities},[course,collision]),/Duplicate course id: http/);
  assert.deepEqual(Object.keys(lessons),['http']);assert.deepEqual(navigation,[{id:'http'}]);
});

test('conflicting custom translations are rejected atomically',()=>{
  const other=clone();other.lesson.id='another-cache';other.navigation.id='another-cache';
  other.translations.zh.strings[other.lesson.overview.full]='与首课冲突的译文';
  const lessons={},navigation=[];
  assert.throws(()=>registerCourses({lessons,navigation,capabilities},[course,other]),/Conflicting course translation/);
  assert.deepEqual(lessons,{});assert.deepEqual(navigation,[]);
});

test('successful registration adds one independent lesson and preserves original object identity',()=>{
  const original={id:'http'},lessons={http:original},navigation=[{id:'http'}];
  assert.equal(registerCourses({lessons,navigation,capabilities},[course]),1);
  assert.equal(lessons.http,original);assert.equal(lessons['http-cache'],course.lesson);assert.equal(navigation.length,2);
});

test('translation extension supplies authored Chinese and leaves other languages to upstream fallback',()=>{
  assert.equal(translateCourseText(course.lesson.overview.full,'zh'),course.translations.zh.strings[course.lesson.overview.full]);
  assert.equal(translateCourseText(course.lesson.overview.full,'fr'),undefined);
  assert.equal(translateCourseText('An upstream-only key','zh'),undefined);
});
