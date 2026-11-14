import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = 'protocol-analysis/raw/index-CNPseYOQ.js';
const original = fs.readFileSync(path.join(root, input), 'utf8');
const hash = createHash('sha256').update(original).digest('hex');
const expected = '19e285d11f5fa0b1411ec94aaea6cd04531872e8322bb8a46c80e4f92e262834';
if (hash !== expected) throw Error('Unknown upstream snapshot. Review the AST bridge before updating its pinned hash.');
const ast = parse(original, {sourceType:'module'});
const declarations=ast.program.body.flatMap(s=>s.type==='VariableDeclaration'?s.declarations:[]);
function objectKeys(symbol) {
  const declaration=declarations.find(d=>d.id.type==='Identifier'&&d.id.name===symbol);
  if(declaration?.init?.type!=='ObjectExpression')throw Error(`Capability declaration changed: ${symbol}`);
  return declaration.init.properties.map(p=>p.key.type==='Identifier'?p.key.name:p.key.value);
}
const frameDeclaration=declarations.find(d=>d.id.name==='gh');
const frameNodes=Object.fromEntries(frameDeclaration.init.properties.map(p=>{
  if(p.value.type!=='ArrayExpression'||p.value.elements.some(x=>x.type!=='StringLiteral'))throw Error('Camera frame node mapping changed');
  return [p.key.name??p.key.value,p.value.elements.map(x=>x.value)];
}));
const codec=ast.program.body.find(x=>x.type==='FunctionDeclaration'&&x.id.name==='zw');
const payloadKinds=codec.body.body.filter(x=>x.type==='IfStatement').map(x=>{
  const member=x.test.type==='MemberExpression'?x.test:x.test.type==='BinaryExpression'?x.test.left:null;
  if(member?.type!=='MemberExpression'||member.object.name!=='t')throw Error('Payload codec dispatch changed');
  return member.property.name;
});
export const capabilities={nodes:objectKeys('ye'),routes:objectKeys('tw'),frames:objectKeys('gh'),frameNodes,payloadKinds};
const changes = [];
const fn = ast.program.body.find(x=>x.type==='FunctionDeclaration' && x.id.name==='S');
if (!fn || fn.params.map(x=>x.name).join(',') !== 'e,t' || fn.body.body[0].type !== 'IfStatement') throw Error('Translation hook changed');
changes.push({start:fn.body.body[0].end,end:fn.body.body[0].end,text:'if(oo?.strings?.[e]===undefined){const extension=translateCourseText(e,_r);if(extension!==undefined)return ey(extension,t);}',reason:'Course-owned missing translations; existing upstream string translations retain precedence'});
const boot = ast.program.body.filter(x=>x.type==='ExpressionStatement' && x.expression.type==='AwaitExpression' && x.expression.argument.type==='CallExpression' && x.expression.argument.callee.name==='ry');
if (boot.length !== 1) throw Error('Expected exactly one upstream boot boundary');
changes.push({start:boot[0].start,end:boot[0].start,text:`installCourses({lessons:_s,navigation:Ts,capabilities:{nodes:Object.keys(ye),routes:Object.keys(tw),frames:Object.keys(gh),frameNodes:gh,payloadKinds:${JSON.stringify(payloadKinds)}}});\n`,reason:'Register validated independent courses before locale loading and DOM creation'});
const localeImports = [];
function visit(node) {
  if (!node || typeof node!=='object') return;
  if (node.type==='ImportExpression') {
    if (node.source.type!=='StringLiteral' || !/^\.\/[a-zA-Z0-9_-]+\.js$/.test(node.source.value)) throw Error('Unexpected dynamic import in pinned snapshot');
    const resource = '/assets/' + node.source.value.slice(2);
    localeImports.push(resource);
    changes.push({start:node.source.start,end:node.source.end,text:JSON.stringify(resource),reason:'Keep original lazy locale chunks resolvable from the new module location'});
  }
  for (const [key,value] of Object.entries(node)) {
    if (['loc','start','end','extra','comments','tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value==='object') visit(value);
  }
}
visit(ast.program);
if (localeImports.length!==20) throw Error(`Expected 20 lazy locale imports, found ${localeImports.length}`);
let output = original;
for (const edit of [...changes].sort((a,b)=>b.start-a.start)) output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
output='// Generated from a pinned public production snapshot. Edit the adapter or course modules, not this file.\nimport {installCourses,translateCourseText} from "../courses/registry.mjs";\n'+output;
parse(output,{sourceType:'module'});
fs.mkdirSync(path.join(root,'app/src/vendor'),{recursive:true});
fs.writeFileSync(path.join(root,'app/src/vendor/original-runtime.mjs'),output);
fs.writeFileSync(path.join(root,'app/runtime-provenance.json'),JSON.stringify({source:input,sha256:hash,transform:'SHA-256-bound AST positions; original renderer, player, inspector and 39 lessons retained',edits:changes.map(({start,end,reason})=>({start,end,reason})),localeImports,capabilities},null,2)+'\n');
console.log(`Prepared upstream runtime: ${changes.length} surgical edits; ${localeImports.length} lazy locales; original snapshot unchanged.`);
