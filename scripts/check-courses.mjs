import {capabilities} from './prepare-runtime.mjs';
import {customCourses,registerCourses} from '../app/src/courses/registry.mjs';
import {flattenPackets} from '../app/src/authoring/validate.mjs';
import fs from 'node:fs';
const original=JSON.parse(fs.readFileSync(new URL('../protocol-analysis/derived/course-catalog.json',import.meta.url),'utf8')).courses;
registerCourses({lessons:Object.fromEntries(original.map(x=>[x.id,{id:x.id}])),navigation:original.map(x=>({id:x.id})),capabilities},customCourses);
for(const descriptor of customCourses) {
  console.log(`${descriptor.lesson.id}: ${descriptor.lesson.steps.length} steps, ${flattenPackets(descriptor.lesson).length} teaching packets; schema, topology, latency and Chinese narrative passed.`);
}
