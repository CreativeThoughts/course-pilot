import {workbookRows,subjectCodes,uid,now,stable} from './imports.mjs';
import {codes,currentStudents} from './engine.mjs';
import {intakeKey} from './intake.mjs';
const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function stagePreferences(s,files){
 if(!s.settings.start||!s.settings.end)throw Error('Configure intake dates first');
 const seen=new Set(),changes=[];
 for(const f of files){const rows=workbookRows(Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)));for(const row of rows){
 const id=String(row['Your Student ID']||'').trim();if(!id)throw Error('Missing Your Student ID');if(seen.has(id))throw Error('Duplicate response for '+id);seen.add(id);
 const student=currentStudents(s).find(x=>x.id===id);if(!student)throw Error('Student is not in the latest snapshot: '+id);
 const course=s.courses.find(c=>c.id===student.course),raw=Object.entries(row).filter(([k])=>k.startsWith('Enter the subject code')).map(([,v])=>v.trim()),subjects=[],notes=[];
 const stated=String(row['Your Course']||'').toUpperCase();if(/BBIS|MBIS/.test(stated)&&!stated.includes(student.course))throw Error('Course mismatch for '+id);
 for(const value of raw){if(!value||/^(na|n\/a|none)$/i.test(value))continue;if(/^(anything|any)$/i.test(value)){notes.push('Any suitable offered subject requested');continue;}
 const extracted=subjectCodes(value);if(extracted.length){subjects.push(...extracted);continue;}
 const matches=codes(course.cores+','+course.electives).filter(code=>normal(course.rules?.[code]?.name)===normal(value)||(normal(value).length>=8&&normal(course.rules?.[code]?.name).includes(normal(value)))||(normal(value)==='ai'&&normal(course.rules?.[code]?.name).includes('artificialintelligence')));
 if(matches.length===1)subjects.push(matches[0]);else notes.push('Unresolved preference: '+value);
 }
 const record={id,course:student.course,intake:intakeKey(s),subjects:[...new Set(subjects)],requested_load:raw.filter(v=>v&&!/^(na|n\/a|none)$/i.test(v)).length,raw,notes,source:f.name,source_fields:row};const old=s.intake_preferences?.find(r=>r.id===id&&r.intake===record.intake)||null;
 changes.push({id,old,new:record,delta:old&&stable(old)===stable(record)?'unchanged':old?'updated':'added',errors:[]});
 }}
 if(!changes.length)throw Error('No preference responses found');return {id:uid(),kind:'intake_preferences',mode:'partial',intake:intakeKey(s),time:now(),status:'staged',changes};
}
