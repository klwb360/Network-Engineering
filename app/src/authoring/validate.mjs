const eventTypes=new Set(['type-url','show','packet','camera','render','note','stream','label']);
const groups=new Set(['core','application','security']);
const colors=new Set(['blue','green','amber','violet','teal','navy','red']);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const flattenPackets=lesson=>lesson.steps.flatMap(step=>step.events).flatMap(event=>event.type==='packet'?[event]:event.type==='stream'?event.packets:[]);

export function validateCourse(descriptor,capabilities) {
  const issues=[];
  const issue=(path,message)=>issues.push({path,message});
  const text=(value,path)=>{if(typeof value!=='string'||!value.trim())issue(path,'Expected a nonempty string');};
  const facts=(value,path)=>{
    if(!Array.isArray(value))return issue(path,'Expected an array of [label,value] pairs');
    value.forEach((pair,i)=>{if(!Array.isArray(pair)||pair.length!==2)return issue(`${path}[${i}]`,'Expected [label,value]');pair.forEach((x,j)=>text(x,`${path}[${i}][${j}]`));});
  };
  if(!isObject(descriptor))return [{path:'course',message:'Expected a course descriptor'}];
  const {lesson,navigation,meta,translations}=descriptor;
  if(!isObject(lesson))return [{path:'lesson',message:'Expected a lesson object'}];
  text(lesson.id,'lesson.id');
  if(typeof lesson.id==='string'&&!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(lesson.id))issue('lesson.id','Use a stable lowercase kebab-case id');
  for(const field of ['name','title'])text(lesson[field],`lesson.${field}`);
  if(!Number.isInteger(lesson.layer)||lesson.layer<1||lesson.layer>7)issue('lesson.layer','OSI layer must be an integer from 1 to 7');
  if(!capabilities?.nodes||!capabilities.routes||!capabilities.frames)throw Error('Pinned upstream capabilities are required');
  const nodes=new Set(capabilities.nodes),routes=new Set(capabilities.routes),frames=new Set(capabilities.frames);
  const node=(value,p)=>{if(!nodes.has(value))issue(p,`Unknown upstream SVG node: ${value}`);};
  const frame=(value,p)=>{
    if(!frames.has(value))issue(p,`Unknown upstream camera frame: ${value}`);
    else if(!capabilities.frameNodes?.[value]?.some(n=>courseNodes.has(n)))issue(p,'Camera frame must include at least one course node');
  };
  if(!Array.isArray(lesson.nodes)||!lesson.nodes.length)issue('lesson.nodes','Expected at least one known SVG node');
  else lesson.nodes.forEach((n,i)=>node(n,`lesson.nodes[${i}]`));
  const courseNodes=new Set(Array.isArray(lesson.nodes)?lesson.nodes:[]);
  if(!isObject(lesson.start))issue('lesson.start','Expected initial nodes and camera frame');
  else {
    frame(lesson.start.frame,'lesson.start.frame');
    if(!Array.isArray(lesson.start.nodes)||!lesson.start.nodes.length)issue('lesson.start.nodes','Expected at least one visible initial node');
    else lesson.start.nodes.forEach((n,i)=>{node(n,`lesson.start.nodes[${i}]`);if(!courseNodes.has(n))issue(`lesson.start.nodes[${i}]`,'Initial node must be included in lesson.nodes');});
  }
  if(!isObject(lesson.overview))issue('lesson.overview','Expected an overview');
  else {text(lesson.overview.full,'lesson.overview.full');text(lesson.overview.description,'lesson.overview.description');facts(lesson.overview.facts,'lesson.overview.facts');}
  if(!isObject(lesson.outro))issue('lesson.outro','Expected completion content');
  else {for(const k of ['title','desc','text'])text(lesson.outro[k],`lesson.outro.${k}`);facts(lesson.outro.facts,'lesson.outro.facts');}
  if(!Array.isArray(lesson.legend))issue('lesson.legend','Expected a legend');
  else lesson.legend.forEach((item,i)=>{if(!Array.isArray(item)||item.length!==2)return issue(`lesson.legend[${i}]`,'Expected [color,label]');if(item[0]!==null&&!colors.has(item[0]))issue(`lesson.legend[${i}][0]`,'Unknown renderer color');text(item[1],`lesson.legend[${i}][1]`);});
  if(!isObject(navigation))issue('navigation','Expected navigation metadata');
  else {if(navigation.id!==lesson.id)issue('navigation.id','Must equal lesson.id');for(const k of ['name','full'])text(navigation[k],`navigation.${k}`);if(!groups.has(navigation.group))issue('navigation.group','Expected core, application or security');}
  if(!isObject(meta))issue('meta','Expected ownership, objectives and standards');
  else {
    text(meta.owner,'meta.owner');
    if(!Array.isArray(meta.objectives)||!meta.objectives.length)issue('meta.objectives','At least one teaching objective is required');
    if(!Array.isArray(meta.standards)||!meta.standards.length)issue('meta.standards','At least one primary standard reference is required');
    else meta.standards.forEach((ref,i)=>{if(typeof ref?.url!=='string'||!ref.url.startsWith('https://'))issue(`meta.standards[${i}].url`,'Use a source URL with HTTPS');});
  }
  let previousTime=-Infinity,packetCount=0;
  function packet(p,prefix) {
    if(!isObject(p)||p.type!=='packet')return issue(prefix,'Expected a packet event');
    packetCount++;
    for(const endpoint of ['from','to']){node(p[endpoint],`${prefix}.${endpoint}`);if(!courseNodes.has(p[endpoint]))issue(`${prefix}.${endpoint}`,'Endpoint must be included in lesson.nodes');}
    if(!routes.has(`${p.from}>${p.to}`))issue(prefix,`No original SVG route from ${p.from} to ${p.to}; extend topology explicitly`);
    const delay=lesson.latency?.[`${p.from}-${p.to}`]??lesson.latency?.[`${p.to}-${p.from}`];
    if(!Number.isFinite(delay)||delay<0)issue('lesson.latency',`Missing nonnegative endpoint delay: ${p.from}-${p.to}`);
    if(!colors.has(p.color))issue(`${prefix}.color`,'Unknown renderer color');
    text(p.label,`${prefix}.label`);
    if(!Array.isArray(p.payload)||p.payload.some(x=>typeof x!=='string'))issue(`${prefix}.payload`,'Expected an array of strings');
    for(const flag of ['quick','lost','locked'])if(p[flag]!==undefined&&typeof p[flag]!=='boolean')issue(`${prefix}.${flag}`,'Expected a boolean');
    if(!isObject(p.row))return issue(`${prefix}.row`,'Expected table row and wire data');
    for(const k of ['time','src','dst','proto','info','len'])text(p.row[k],`${prefix}.row.${k}`);
    const time=/^\d+(?:\.\d+)?s$/.test(p.row.time)?parseFloat(p.row.time):NaN;
    if(!Number.isFinite(time)||time<previousTime)issue(`${prefix}.row.time`,'Use nondecreasing simulated seconds, e.g. 61.000s');
    if(Number.isFinite(time))previousTime=time;
    if(!isObject(p.row.wire)||!Object.keys(p.row.wire).length)return issue(`${prefix}.row.wire`,'Expected protocol encoding data');
    if(!['tcp','udp','arp','icmp','igmp','ipv6','wifi','pppoe','copyOf'].some(key=>key in p.row.wire))issue(`${prefix}.row.wire`,'No supported upstream protocol branch; extend the codec adapter explicitly');
    const transport=p.row.wire.tcp??p.row.wire.udp;
    if(transport) {
      for(const k of ['sport','dport'])if(!Number.isInteger(transport[k])||transport[k]<1||transport[k]>65535)issue(`${prefix}.row.wire.${k}`,'Port must be in 1..65535');
      if(p.row.wire.tcp&&(typeof transport.flags!=='string'||!/^[SAFPRUEC]+$/.test(transport.flags)))issue(`${prefix}.row.wire.tcp.flags`,'Expected original TCP flag letters');
      const data=transport.data;
      if(data!==undefined&&(!isObject(data)||!capabilities.payloadKinds?.some(key=>key in data)))issue(`${prefix}.row.wire.data`,'No supported upstream payload codec; use a known encoding or extend the adapter explicitly');
      if(data?.text) {
        if(!Array.isArray(data.text)||data.text.some(x=>typeof x!=='string'||/[\r\n]|[^\x00-\x7f]/.test(x)))issue(`${prefix}.row.wire.data.text`,'HTTP/text lines must be single ASCII lines; encoder adds CRLF');
        else {
          if(/^HTTP\/|^[A-Z]+ .+ HTTP\//.test(data.text[0])&&data.text.at(-1)!=='')issue(`${prefix}.row.wire.data.text`,'Terminate HTTP headers with an empty line');
          const header=data.text.find(x=>/^Content-Length:/i.test(x));
          if(header&&typeof data.body==='string'&&Number(header.split(':')[1].trim())!==data.body.length)issue(`${prefix}.row.wire.data.body`,'Content-Length differs from encoded body length');
          if(/^HTTP\/1\.[01] 304(?: |$)/.test(data.text[0])&&data.body!==undefined)issue(`${prefix}.row.wire.data.body`,'304 responses must not contain a body');
        }
        if(data.body!==undefined&&(typeof data.body!=='string'||/[^\x00-\x7f]/.test(data.body)))issue(`${prefix}.row.wire.data.body`,'Text body must be ASCII for this upstream encoder');
      }
    }
  }
  const narrative=[];
  if(navigation?.full)narrative.push(navigation.full);
  if(lesson.overview)narrative.push(lesson.overview.full,lesson.overview.description);
  if(lesson.outro)narrative.push(lesson.outro.title,lesson.outro.desc,lesson.outro.text);
  if(!Array.isArray(lesson.steps)||!lesson.steps.length)issue('lesson.steps','Expected one or more steps');
  else lesson.steps.forEach((step,i)=>{
    const p=`lesson.steps[${i}]`;
    for(const key of ['title','desc','detail']){text(step?.[key],`${p}.${key}`);narrative.push(step?.[key]);}
    facts(step?.facts,`${p}.facts`);
    if(!Array.isArray(step?.events))return issue(`${p}.events`,'Expected events');
    step.events.forEach((event,j)=>{
      const ep=`${p}.events[${j}]`;
      if(!isObject(event)||!eventTypes.has(event.type))return issue(ep,'Unsupported event type');
      if(event.type==='packet')packet(event,ep);
      if(event.type==='stream') {
        if(!Array.isArray(event.packets)||!event.packets.length)issue(`${ep}.packets`,'Expected at least one stream packet');
        else event.packets.forEach((p,k)=>packet(p,`${ep}.packets[${k}]`));
      }
      if(['show','camera'].includes(event.type))frame(event.frame,`${ep}.frame`);
      if(event.type==='show'){if(!Array.isArray(event.nodes))issue(`${ep}.nodes`,'Expected nodes');else event.nodes.forEach((n,k)=>node(n,`${ep}.nodes[${k}]`));}
      if(event.type==='note'){node(event.at,`${ep}.at`);text(event.text,`${ep}.text`);narrative.push(event.text);}
      if(event.type==='label'){node(event.at,`${ep}.at`);if(!Array.isArray(event.label)||event.label.length!==2)issue(`${ep}.label`,'Expected [name,address]');}
      if(event.type==='type-url')text(event.text,`${ep}.text`);
    });
  });
  if(!packetCount)issue('lesson.steps','The original sequence and packet views require at least one packet');
  const zh=translations?.zh?.strings;
  if(!isObject(zh))issue('translations.zh.strings','Provide Simplified Chinese course translations');
  else for(const key of new Set(narrative.filter(Boolean)))if(typeof zh[key]!=='string'||!zh[key])issue('translations.zh.strings',`Missing narrative translation: ${key}`);
  return issues;
}

export function assertCourse(descriptor,capabilities) {
  const issues=validateCourse(descriptor,capabilities);
  if(issues.length) {
    const error=new Error(`Invalid course ${descriptor?.lesson?.id??'(unknown)'}:\n${issues.map(x=>`- ${x.path}: ${x.message}`).join('\n')}`);
    error.issues=issues;throw error;
  }
  return descriptor;
}
