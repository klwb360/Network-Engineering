import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { parse } from '@babel/parser';

// Only replay the statically identified declaration prefix. Never evaluate the
// entry IIFE, module preloader, DOM/application initialization, or imports.
const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'derived/index.pretty.js');
const source = fs.readFileSync(sourcePath, 'utf8');
// This replay was reviewed for this exact public snapshot. Fail closed after
// any bundle/formatter change; node:vm is not a security boundary for new input.
const expected = {
  'raw/index-CNPseYOQ.js': '19e285d11f5fa0b1411ec94aaea6cd04531872e8322bb8a46c80e4f92e262834',
  'derived/index.pretty.js': 'b07570d2cff1d15990a3439c18413ef944a18213a81d16086bf47ed606014677',
};
for (const [file, digest] of Object.entries(expected)) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== digest) throw new Error(`Snapshot changed; review extraction before replay: ${file}`);
}
const ast = parse(source, { sourceType: 'module' });
const registry = '_s';
const navigation = 'Ts';
let started = false;
let complete = false;
let declarations = [];
const locations = {};
for (const statement of ast.program.body) {
  if (complete) break;
  if (statement.type === 'VariableDeclaration') {
    for (const declaration of statement.declarations) {
      const name = declaration.id.type === 'Identifier' ? declaration.id.name : null;
      if (name === 'h') started = true;
      if (!started) continue;
      declarations.push(`${statement.kind} ${source.slice(declaration.start, declaration.end)};`);
      if (name) locations[name] = { line: declaration.loc.start.line, endLine: declaration.loc.end.line };
      if (name === navigation) { complete = true; break; }
    }
  } else if (started && ['FunctionDeclaration', 'ClassDeclaration'].includes(statement.type)) {
    declarations.push(source.slice(statement.start, statement.end));
    locations[statement.id.name] = { line: statement.loc.start.line, endLine: statement.loc.end.line };
  } else if (started && statement.type === 'ForStatement' && [2570, 2975].includes(statement.loc.start.line)) {
    // Two finite segmentation loops push numeric lengths into un/Ss arrays.
    declarations.push(source.slice(statement.start, statement.end));
  } else if (started) {
    throw new Error(`Unexpected executable statement in declaration prefix: ${statement.type}`);
  }
}
if (!complete) throw new Error('Course and navigation registries not identified');
const code = declarations.join('\n');
const declarationAST = parse(code, { sourceType: 'script' });
const forbidden = new Set(['document','window','navigator','fetch','XMLHttpRequest','WebSocket','localStorage','sessionStorage','process','require','eval','Function','setTimeout','setInterval']);
function guard(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration') throw new Error('Import in declaration prefix');
  if (node.type === 'Identifier' && forbidden.has(node.name)) throw new Error(`Forbidden host identifier: ${node.name}`);
  for (const [key,value] of Object.entries(node)) {
    if (['loc','start','end','extra','comments','leadingComments','trailingComments','tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(guard); else if (value && typeof value === 'object') guard(value);
  }
}
guard(declarationAST.program);
const context = vm.createContext({ TextEncoder }, { codeGeneration: { strings: false, wasm: false } });
const extracted = new vm.Script(`${code}\nJSON.stringify({courses:${registry},navigation:${navigation}})`, { filename: 'public-course-declarations.js' }).runInContext(context, { timeout: 5000 });
const {courses,navigation:nav} = JSON.parse(extracted);
if (JSON.stringify(Object.keys(courses).sort()) !== JSON.stringify(nav.map(x=>x.id).sort())) {
  throw new Error('Navigation and registry must contain the same course IDs');
}
const countBy = items => items.reduce((out,x)=>(out[x]=(out[x]??0)+1,out),{});
const flatten = lesson => lesson.steps.flatMap(step=>step.events).flatMap(event=>event.type === 'packet' ? [event] : event.type === 'stream' ? event.packets : []);
const registryNode = ast.program.body.flatMap(s=>s.type==='VariableDeclaration'?s.declarations:[]).find(d=>d.id.name===registry);
const symbols = Object.fromEntries(registryNode.init.properties.map(p=>[p.key.name,p.value.name]));
const catalog = nav.map(item=>{
  const lesson=courses[item.id];
  if (!lesson || lesson.id!==item.id) throw new Error(`Registry mismatch: ${item.id}`);
  const events=lesson.steps.flatMap(s=>s.events);
  const packets=flatten(lesson);
  return {
    id:lesson.id,name:lesson.name,group:item.group,layer:lesson.layer,
    sourceSymbol:symbols[item.id],source:locations[symbols[item.id]],
    lessonFields:Object.keys(lesson),nodes:lesson.nodes,start:lesson.start,
    stepCount:lesson.steps.length,eventCount:events.length,packetCount:packets.length,
    eventTypes:countBy(events.map(e=>e.type)),packetProtocols:countBy(packets.map(p=>p.row?.proto??'(no row)')),
    packetOptionalFieldPresence:countBy(packets.flatMap(p=>['quick','lost','locked','broadcast','via','at'].filter(k=>p[k]!==undefined))),
    steps:lesson.steps.map((step,index)=>({index,title:step.title,eventCount:step.events.length,eventTypes:countBy(step.events.map(e=>e.type)),packetCount:step.events.flatMap(e=>e.type==='packet'?[e]:e.type==='stream'?e.packets:[]).length})),
    packetFields:[...new Set(packets.flatMap(p=>Object.keys(p)))].sort(),
    rowFields:[...new Set(packets.flatMap(p=>Object.keys(p.row??{})))].sort(),
    wireKeys:[...new Set(packets.flatMap(p=>Object.keys(p.row?.wire??{})))].sort()
  };
});
const aggregate={
  source:'https://protocol-explorer-alpha.vercel.app/assets/index-CNPseYOQ.js',
  method:'SHA-256-bound, manually reviewed declaration-prefix replay selected with Babel AST, including initializers and two finite segmentation loops; DOM/IIFE excluded; only TextEncoder explicitly injected; string/Wasm code generation disabled; 5 s limit; node:vm is not a security boundary',
  registry:{symbol:registry,...locations[registry]},navigation:{symbol:navigation,...locations[navigation]},
  courseCount:catalog.length,groups:countBy(catalog.map(c=>c.group)),
  totalSteps:catalog.reduce((n,c)=>n+c.stepCount,0),totalEvents:catalog.reduce((n,c)=>n+c.eventCount,0),totalPackets:catalog.reduce((n,c)=>n+c.packetCount,0),
  eventTypes:countBy(Object.values(courses).flatMap(c=>c.steps.flatMap(s=>s.events.map(e=>e.type)))),
  courses:catalog
};
fs.writeFileSync(path.join(root,'derived/course-catalog.json'),JSON.stringify(aggregate,null,2)+'\n');
console.log(JSON.stringify({courseCount:aggregate.courseCount,groups:aggregate.groups,totalSteps:aggregate.totalSteps,totalEvents:aggregate.totalEvents,totalPackets:aggregate.totalPackets,eventTypes:aggregate.eventTypes},null,2));
