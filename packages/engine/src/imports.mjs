import {extractSubjectCodes} from './requisites.mjs';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import {codes} from './engine.mjs';
export const now=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID().slice(0,12);
export const stable=value=>JSON.stringify(canonical(value));
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
export function normaliseDate(value){
 if(!value)return value;
 let m=String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/),iso=m?`${m[3]}-${m[2]}-${m[1]}`:value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error('Invalid date; use dd/mm/yyyy');
 const d=new Date(iso+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw Error('Invalid date; use dd/mm/yyyy');return iso;
}
export const subjectCodes=extractSubjectCodes;
const asArray=v=>v==null?[]:Array.isArray(v)?v:[v];
export function workbookRows(bytes){
 // Bound expansion as well as compressed upload size.
 let expanded=0;
 const files=unzipSync(bytes,{filter:f=>{expanded+=f.originalSize;if(expanded>30_000_000)throw Error('Workbook expands beyond the 30 MB limit');return ['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].includes(f.name);}});
 if(!files['xl/worksheets/sheet1.xml'])throw Error('Workbook has no first worksheet');
 const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseTagValue:false,trimValues:false,processEntities:true,htmlEntities:false});
 const read=name=>{const xml=strFromU8(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported XML declarations');return parser.parse(xml);};
 const text=v=>typeof v==='string'?v:typeof v==='number'?String(v):v?.['#text']??'';
 const stringValue=v=>v?.t!==undefined?text(v.t):asArray(v?.r).map(r=>text(r.t)).join('');
 const strings=files['xl/sharedStrings.xml']?asArray(read('xl/sharedStrings.xml').sst?.si).map(stringValue):[];
 const rows=asArray(read('xl/worksheets/sheet1.xml').worksheet?.sheetData?.row).map(row=>{
  const arr=[];for(const c of asArray(row.c)){const ref=String(c['@r']||'').match(/^[A-Z]+/);if(!ref)throw Error('Cell reference missing');let idx=0;for(const ch of ref[0])idx=idx*26+ch.charCodeAt(0)-64;
  arr[idx-1]=c['@t']==='s'?strings[Number(c.v)]??'':c['@t']==='inlineStr'?stringValue(c.is):String(c.v??'');}return arr;
 });
 if(!rows.length)return [];const header=rows[0];if(new Set(header).size!==header.length)throw Error('Duplicate workbook column names');
 return rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||''])));
}
const passingOtherGrades=new Set(['HD','D','C','P','SP']);
const coursesUsingOtherResults=new Set(['BBIS','MBIS']);
function applyOtherResults(observations,sets,eligible,issues){
 const completed=new Set(sets.completed),unresolved=[];
 for(const observation of observations.filter(o=>o.status==='other')){
  const match=observation.raw.match(/^([A-Z]{2,10}\d{3,6})\s*\(([^()]+)\)$/i);
  const code=match?.[1].toUpperCase(),grade=match?.[2].trim().toUpperCase();
  if(!code||!eligible.includes(code)||!passingOtherGrades.has(grade)||sets.failed.includes(code)){
   unresolved.push(observation.raw);
   continue;
  }
  completed.add(code);
  observation.status='completed';
  observation.source_column='Other';
 }
 sets.completed=[...completed].sort();
 if(unresolved.length)issues.push('Other subject results need review: '+unresolved.join(', '));
}
export function mapRows(rows,courses,source,intake=null){
 const required=['Studentid','Student Name','CourseID','Course Length','Status','Course Completion Status','Subject Completed','Subject Enrolled','Subject Failed'];
 const missing=required.filter(k=>!rows.length||!(k in rows[0]));if(!rows.length||missing.length)throw Error('MeshEd extract is empty or missing columns: '+missing.sort().join(', '));
 return rows.flatMap((row,i)=>{
  if(!row.Studentid)return [];const line=i+2,r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,String(v||'').trim()])),course=r.CourseID.toUpperCase(),c=courses.find(c=>c.id===course);
  if(!c)throw Error(`Row ${line}: unknown course ${course}`);
  const dates=r['Course Length'].match(/^\s*(\d{2}\/\d{2}\/\d{4})\s*[-–—]\s*(\d{2}\/\d{2}\/\d{4})\s*$/);if(!dates)throw Error(`Row ${line}: Course Length must contain DD/MM/YYYY - DD/MM/YYYY`);
  const start=normaliseDate(dates[1]),end=normaliseDate(dates[2]);if(start>end)throw Error(`Row ${line}: enrolment date follows end date`);
  const sets=Object.fromEntries([['completed','Subject Completed'],['failed','Subject Failed'],['enrolment_interests','Subject Enrolled']].map(([k,col])=>[k,subjectCodes(r[col])])),issues=[],eligible=subjectCodes(c.cores+','+c.electives);
  if([['completed','failed']].some(([a,b])=>sets[a].some(s=>sets[b].includes(s))))issues.push('Conflicting current subject statuses; attempt history required');
  const unknown=[...new Set(Object.values(sets).flat())].filter(x=>!eligible.includes(x)).sort();if(unknown.length)issues.push('Status subjects outside eligibility: '+unknown.join(', '));
  if(r.Other&&!coursesUsingOtherResults.has(course))issues.push('Other subject results are not counted; classification/credit review required');
  const value=r['Course Completion Status'].trim().toLowerCase().replace(/\s+/g,' '),state=['not complete','not completed'].includes(value)?'not_complete':['complete','completed'].includes(value)?'completed':'unknown';
  if(state==='unknown')issues.push('Unknown Course Completion Status; held outside planning');
  const confirmed=c.meshed_enrolment_semantics==='confirmed';if(confirmed&&!intake)throw Error('Confirmed enrolments require an intake date range');
  const observations=[];for(const [col,status] of [['Subject Completed','completed'],['Subject Failed','failed'],['Subject Enrolled','enrolment_interest'],['Subject Not Enrolled','not_enrolled'],['Other','other']])for(const token of (r[col]||'').split(',').map(t=>t.trim()).filter(Boolean))observations.push({raw:token,codes:subjectCodes(token),grade:token.match(/\(([^)]+)\)/)?.[1]??null,status:confirmed&&status==='enrolment_interest'?'confirmed_enrolment':status});
  if(r.Other&&coursesUsingOtherResults.has(course))applyOtherResults(observations,sets,eligible,issues);
  return [{id:r.Studentid,name:r['Student Name'],course,email:r.CollegeEmail||r.Email||'',personal_email:r.Email||'',college_email:r.CollegeEmail||'',enrolled_date:start,completion:end,coe:end,date_source:'MeshEd Course Length end (institution-confirmed mapping)',course_length:r['Course Length'],curriculum:r['Course Template']||'',course_attempt:r.CourseAttempt||'',institution:r.EntityName||'',campus:r['Campus Name']||'',source_status:r.Status,course_completion_status:r['Course Completion Status'],completion_state:state,graduation_review:state==='completed',exit_status:r.Status.toLowerCase().includes('exit')?'exited':'not_exited',in_progress:'',subject_enrolled_semantics:'interest-v1',academic_status:sets.enrolment_interests.length?'Enrolment interests recorded':'Results available',not_enrolled:subjectCodes(r['Subject Not Enrolled']).join(','),source_other:r.Other||'',source_system:'MeshEd',source,source_row:line,source_fields:r,subject_observations:observations,data_issues:issues,...Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.join(',')])),...(confirmed?{confirmed_enrolled:sets.enrolment_interests.join(','),enrolment_interests:'',subject_enrolled_semantics:'confirmed-enrolment-v1',enrolment_intake:intake,intake_participation:sets.enrolment_interests.length?'enrolled':'opted_out',academic_status:sets.enrolment_interests.length?'Confirmed enrolled for intake':'Opted out of optional intake'}:{})}];
 });
}
export function stageMeshed(s,files){
 if(!Array.isArray(files)||!files.length)throw Error('Choose MeshEd files');
 const students=files.flatMap(f=>mapRows(workbookRows(Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))),s.courses,f.name,s.settings.start+'|'+s.settings.end)),ids=students.map(r=>r.id);
 if(!students.length)throw Error('No student records found');
 if(new Set(ids).size!==ids.length)throw Error('Duplicate student IDs/course attempts in MeshEd bundle; resolve before importing');
 const old=new Map(s.students.map(r=>[r.id,r])),semantic=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['source','source_row'].includes(k))),changes=students.map(row=>{const previous=old.get(row.id)||null;return {id:row.id,old:structuredClone(previous),new:row,delta:!previous?'added':stable(semantic(previous))===stable(semantic(row))?'unchanged':'updated',errors:[]};}),scope=[...new Set(students.map(r=>r.course))].sort();
 changes.push(...s.students.filter(r=>scope.includes(r.course)&&!ids.includes(r.id)).map(r=>({id:r.id,old:structuredClone(r),new:null,delta:'missing',errors:[]})));
 return {id:uid(),kind:'meshed',mode:'snapshot',time:now(),status:'staged',scope,student_ids:ids,files:files.map(f=>f.name),changes};
}
export function acceptMeshed(s,batch,oldPlans){
 if(batch.status!=='staged')throw Error('Batch already processed');
 const changed=batch.changes.filter(x=>['added','updated'].includes(x.delta)),scopeChanged=batch.scope.some(course=>stable([...(s.planning_scopes?.[course]||[])].sort())!==stable(batch.changes.filter(x=>x.new?.course===course).map(x=>x.new.id).sort()));
 if(changed.length||scopeChanged){s.runs.push({id:uid(),time:batch.time,status:'superseded',plans:oldPlans,decisions:s.decisions});s.decisions={};const updates=new Map(changed.map(x=>[x.id,x.new]));s.students=s.students.map(r=>{const v=updates.get(r.id)||r;updates.delete(r.id);return v;}).concat([...updates.values()]);s.planning_scopes??={};for(const course of batch.scope)s.planning_scopes[course]=batch.changes.filter(x=>x.new?.course===course).map(x=>x.new.id);}
 batch.status='accepted';s.audit.push(structuredClone(batch));
}
export function validate(row,kind,s){
 const required={students:['id','name','course','completion'],courses:['id','name','cores','electives','core_count','elective_count','mode'],sessions:['id','subject','day','start','end','lecturer']}[kind];if(!required)throw Error('Unknown dataset');
 const errors=required.filter(k=>!row[k]).map(k=>'Missing '+k),known=s.courses.flatMap(c=>codes(c.cores+','+c.electives));
 if(kind==='students'){
 if(!s.courses.some(c=>c.id===row.course))errors.push('Unknown course');const sets=['completed','failed','in_progress'].map(k=>codes(row[k]));if(sets.some((a,i)=>sets.slice(i+1).some(b=>a.some(x=>b.includes(x)))))errors.push('Conflicting current subject statuses');if([...sets.flat(),...codes(row.enrolment_interests)].some(x=>!known.includes(x)))errors.push('Unknown subject codes');for(const k of ['completion','coe'])if(row[k])try{normaliseDate(row[k]);}catch{errors.push('Invalid '+k+' date; use dd/mm/yyyy');}
 }
 if(kind==='courses'){for(const category of ['core','elective']){const n=Number(row[category+'_count']);if(!Number.isInteger(n)||n<0||n>codes(row[category==='core'?'cores':'electives']).length)errors.push('Invalid requirement counts');}if(row.mode==='mandatory'&&Number(row.core_count)!==codes(row.cores).length)errors.push('Mandatory core count must equal core list length');if(codes(row.cores).some(x=>codes(row.electives).includes(x)))errors.push('Core and elective categories overlap');if(!['mandatory','pool'].includes(row.mode))errors.push('Mode must be mandatory or pool');}
 if(kind==='sessions'){if(!DAYS.includes(row.day))errors.push('Invalid day');if(!validTime(row.start)||!validTime(row.end))errors.push('Use HH:MM times');else if(row.start>=row.end)errors.push('End must follow start');if(!known.includes(row.subject))errors.push('Unknown subject');}
 return errors;
}
export const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
export function stageCSV(s,body){
 const {kind,mode}=body;if(!['students','courses','sessions'].includes(kind)||!['partial','snapshot'].includes(mode))throw Error('Unknown dataset or import mode');
 const parsed=Papa.parse(body.csv,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim()});if(parsed.errors.length)throw Error(parsed.errors[0].message);
 if(!parsed.data.length)throw Error('CSV contains no records');const old=new Map(s[kind].map(x=>[x.id,x])),seen=new Set();
 const changes=parsed.data.map(raw=>{const row=Object.fromEntries(Object.entries(raw).filter(([k,v])=>k&&v!=null).map(([k,v])=>[k,String(v).trim()])),key=row.id||'';
 for(const k of ['completed','failed','in_progress','enrolment_interests','cores','electives'])if(k in row)row[k]=codes(row[k]).join(',');for(const k of ['subject','course'])if(k in row)row[k]=row[k].toUpperCase();
 // Nested course rules in generated templates must survive CSV round trips.
 for(const k of ['rules','source_fields','subject_observations','data_issues'])if(row[k])try{row[k]=JSON.parse(row[k]);}catch{throw Error('Invalid JSON in '+k);}
 if('requirements_provisional' in row){if(!['true','false'].includes(row.requirements_provisional))throw Error('requirements_provisional must be true or false');row.requirements_provisional=row.requirements_provisional==='true';}
 const merged=mode==='partial'?{...old.get(key),...row}:row,errors=[];for(const k of kind==='students'?['enrolled_date','completion','coe']:[])if(merged[k])try{merged[k]=normaliseDate(merged[k]);}catch{errors.push('Invalid '+k+'; use dd/mm/yyyy');}
 errors.push(...validate(merged,kind,s));seen.add(key);return {id:key,old:structuredClone(old.get(key)||null),new:merged,errors,delta:errors.length?'invalid':!old.has(key)?'added':stable(merged)===stable(old.get(key))?'unchanged':'updated'};});
 const counts={};for(const ch of changes)counts[ch.id]=(counts[ch.id]||0)+1;for(const ch of changes)if(counts[ch.id]>1){ch.delta='invalid';ch.errors=['Duplicate key in upload'];}
 if(mode==='snapshot')for(const [k,v] of old)if(!seen.has(k))changes.push({id:k,old:structuredClone(v),new:null,delta:'missing',errors:[]});
 return {id:uid(),kind,mode,time:now(),changes,status:'staged'};
}
