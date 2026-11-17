import {isConfirmedIntake,auditEnrolment} from './enrolment-audit.mjs';
import {prerequisiteCodes,corequisiteCodes} from './requisites.mjs';
/** Deterministic port of engine.py; iteration order is part of the selection contract. */
export const codes = value => [...new Set((value || '').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))].sort();
const intersect=(a,b)=>new Set([...a].filter(x=>b.has(x)));
const union=(...sets)=>new Set(sets.flatMap(s=>[...s]));
const minus=(a,b)=>new Set([...a].filter(x=>!b.has(x)));
function* combinations(a,n,start=0,p=[]){if(!n){yield p;return;}for(let i=start;i<=a.length-n;i++)yield* combinations(a,n-1,i+1,[...p,a[i]]);}
function* product(arrays,i=0,p=[]){if(i===arrays.length){yield p;return;}for(const x of arrays[i])yield* product(arrays,i+1,[...p,x]);}
const greater=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;};
export function plan(student,course,sessions,settings){
 const confirmed=isConfirmedIntake(student,settings);const input=confirmed?{...student,enrolment_interests:student.confirmed_enrolled,requested_intake_load:codes(student.confirmed_enrolled).length}:student;
 const p=recommendation(input,course,sessions,settings);return confirmed?auditEnrolment(p,student,course,sessions,settings):p;
}
function recommendation(student,course,sessions,settings){
 const completed=new Set(codes(student.completed)),pending=codes(student.in_progress),failed=new Set(codes(student.failed)),cores=new Set(codes(course.cores)),electives=new Set(codes(course.electives)),flags=[];
 const interests=new Set(codes(student.enrolment_interests));
 const optional_summer=!!(settings.optional_summer&&student.coe&&settings.end&&student.coe>settings.end);
 sessions=sessions.filter(s=>(s.course??student.course)===student.course);
 if(student.data_issues?.length||course.requirements_provisional||!settings.end)flags.push('DATA_REVIEW_REQUIRED');
 if(intersect(completed,failed).size||intersect(completed,new Set(pending)).size||intersect(failed,new Set(pending)).size)flags.push('DATA_REVIEW_REQUIRED');
 if(intersect(completed,cores).size>Number(course.core_count))flags.push('EXCESS_CORE_COMPLETED');
 if(intersect(completed,electives).size>Number(course.elective_count))flags.push('EXCESS_ELECTIVES_COMPLETED');
 const future_semesters_available=new Set((settings.future_semesters||[]).filter(p=>p.start&&p.end&&settings.end&&settings.end<p.start&&p.start<=p.end&&p.end<=(student.coe||'')).map(p=>p.start+'|'+p.end)).size;
 const semester_limit=Math.min(optional_summer&&future_semesters_available>=2?3:4,student.requested_intake_load??4),scenarios=[],bounded=pending.length>5;
 const outcomes=bounded?[pending.map(()=>true),pending.map(()=>false)]:product(pending.map(()=>[true,false]));
 for(const outcome of outcomes){
  const passed=new Set(pending.filter((s,i)=>outcome[i])),done=union(completed,passed),nc=Math.max(0,Number(course.core_count)-intersect(done,cores).size),ne=Math.max(0,Number(course.elective_count)-intersect(done,electives).size),remaining=nc+ne,sf=[...flags];
  if(pending.length)sf.push('PENDING_RESULTS','MARKS_AWAITING');
  if(!remaining)sf.push('COURSE_COMPLETE');else if(remaining<4&&!optional_summer)sf.push('FINAL_SEMESTER_APPROVAL');
  if(remaining&&optional_summer)sf.push('OPTIONAL_SUMMER_STUDY');
  if(remaining&&optional_summer&&future_semesters_available>=2&&semester_limit===3)sf.push('SUMMER_THREE_SUBJECT_LIMIT');
  const offered=new Set(sessions.map(s=>s.subject)),available=[...intersect(minus(union(nc?cores:[],ne?electives:[]),done),offered)].sort(),groups={};
  for(const subject of available){groups[subject]=new Map();for(const s of sessions.filter(s=>s.subject===subject)){const g=s.group||'A';if(!groups[subject].has(g))groups[subject].set(g,[]);groups[subject].get(g).push(s);}}
  const eligible=choice=>choice.every(subject=>{const rule=course.rules?.[subject]||{},text=rule.prerequisite||'Nil',threshold=text.match(/(\d+) subjects/i);return !(threshold&&intersect(done,union(cores,electives)).size<Number(threshold[1]))&&prerequisiteCodes(rule).every(s=>done.has(s))&&corequisiteCodes(rule).every(s=>course.corequisite_policy==='same_intake'?choice.includes(s):done.has(s)||choice.includes(s));});
  const compatible=rows=>[...combinations(rows,2)].every(([a,b])=>a.day!==b.day||a.end<=b.start||b.end<=a.start);
  let best=[],bestrows=[],score=[-1,-1,-1],clash=false;
  for(let n=0;n<=Math.min(semester_limit,available.length);n++)for(const choice of combinations(available,n)){
   const cc=intersect(new Set(choice),cores).size,ec=intersect(new Set(choice),electives).size;
   if(cc>nc||ec>ne||!eligible(choice))continue;
   for(const options of product(choice.map(s=>[...groups[s].values()]))){const rows=options.flat();if(!compatible(rows)){clash=true;continue;}
    const rank=[n,...(interests.size?[intersect(new Set(choice),interests).size]:[]),cc,intersect(intersect(new Set(choice),union(failed,minus(new Set(pending),passed))),cores).size];
    if(greater(rank,score)){best=choice;bestrows=rows;score=rank;}
   }
  }
  const selected_interests=best.filter(code=>interests.has(code));
  const unselected_interests=[...interests].filter(code=>!best.includes(code)).map(subject=>{
   let reason;
   if(completed.has(subject))reason='Already completed; not needed again';
   else if(passed.has(subject))reason='Pending result assumed passed in this scenario';
   else if(!cores.has(subject)&&!electives.has(subject))reason='Not in the configured course subject list';
   else if((cores.has(subject)&&!nc)||(electives.has(subject)&&!ne))reason='Required subject count for this category is already satisfied';
   else if(!offered.has(subject))reason='Not offered in the published timetable';
   else {
    const rule=course.rules?.[subject]||{},text=rule.prerequisite||'Nil',threshold=text.match(/(\d+) subjects/i);
    if((threshold&&intersect(done,union(cores,electives)).size<Number(threshold[1]))||prerequisiteCodes(rule).some(s=>!done.has(s)))reason='Prerequisite not met';
    else if(corequisiteCodes(rule).some(s=>course.corequisite_policy==='same_intake'?!best.includes(s):!done.has(s)&&!best.includes(s)))reason=corequisiteCodes(rule).some(s=>done.has(s))?'Co-requisite already completed; same-intake requirement needs coordinator review':'Required co-requisite not offered or not selected in the same intake';
    else if(![...groups[subject].values()].some(rows=>compatible([...bestrows,...rows])))reason='Clashes with selected timetable sessions';
    else reason='Not selected within the intake limit and remaining core/elective requirements';
   }
   return {subject,reason};
  });
  if(unselected_interests.some(r=>!['Already completed; not needed again','Pending result assumed passed in this scenario','Required subject count for this category is already satisfied'].includes(r.reason)))sf.push('ENROLMENT_INTEREST_REVIEW');
  const missing=(course.mode??'mandatory')==='mandatory'&&nc?[...minus(minus(cores,done),offered)].sort():[],target=Math.min(semester_limit,remaining),under_target=best.length<target;
  const offered_core_slots=Math.min(nc,intersect(minus(cores,done),offered).size),offered_elective_slots=Math.min(ne,intersect(minus(electives,done),offered).size),core_slots_needed=Math.max(0,target-offered_elective_slots),elective_slots_needed=Math.max(0,target-offered_core_slots);
  if(!optional_summer&&under_target&&missing.length&&offered_core_slots<core_slots_needed)sf.push('REQUIRED_CORE_NOT_OFFERED');
  if(!optional_summer&&under_target&&course.mode==='pool'&&offered_core_slots<core_slots_needed)sf.push('INSUFFICIENT_CORE_OPTIONS_OFFERED');
  if(!optional_summer&&under_target&&offered_elective_slots<elective_slots_needed)sf.push('INSUFFICIENT_ELECTIVES_OFFERED');
  if(course.corequisite_policy==='same_intake'&&under_target&&available.some(code=>corequisiteCodes(course.rules?.[code]||{}).some(c=>course.corequisite_policy==='same_intake'?!best.includes(c):!done.has(c)&&!best.includes(c))))sf.push('COREQUISITE_REVIEW');
  if(clash&&under_target)sf.push('TIMETABLE_CLASH');
  if(!optional_summer&&remaining&&under_target)sf.push('UNDERLOAD_REVIEW');
  for(const [field,flag] of [['coe','COE_REVIEW_REQUIRED'],['completion','COMPLETION_DATE_AT_RISK']]){if(!student[field])sf.push('DATA_REVIEW_REQUIRED');else if(remaining&&settings.end&&student[field]<settings.end)sf.push(flag);}
  if(remaining>best.length)sf.push('COMPLETION_ESTIMATE_UNCERTAIN');
  scenarios.push({...(student.enrolment_interests!==undefined?{selected_interests,unselected_interests,additional_subjects:best.filter(code=>!interests.has(code))}:{}),name:outcome.every(Boolean)?'Expected':'Contingency: '+pending.filter((s,i)=>!outcome[i]).map(s=>s+' fails').join(', '),subjects:best,sessions:bestrows,flags:[...new Set(sf)].sort(),missing,semester_limit,future_semesters_available,optional_study:!!(optional_summer&&remaining),study_guidance:(optional_summer&&remaining?`Up to ${semester_limit} summer subjects. CoE covers ${future_semesters_available} configured future semesters. `:'')+(optional_summer&&remaining?'Summer study is optional under institute policy. These are offered subjects contributing to remaining requirements. A later CoE permits planning flexibility but does not confirm future offerings or completion feasibility.':'Standard semester planning and date review apply.'),semester_target:target,semester_shortfall:target-best.length,remaining,core_remaining:nc,elective_remaining:ne,minimum_semesters:Math.ceil(remaining/4),provisional:!!pending.length,bounded,reasons:Object.fromEntries(best.map(s=>[s,(interests.has(s)?'Student enrolment interest; ':'')+(cores.has(s)?(failed.has(s)||(pending.includes(s)&&!passed.has(s))?'Required core repeat':'Outstanding core requirement'):'Outstanding elective requirement')]))});
 }
 return {student,completed_core:intersect(completed,cores).size,completed_elective:intersect(completed,electives).size,scenarios};
}
export const currentStudents=s=>s.students.filter(r=>!s.planning_scopes?.[r.course]||s.planning_scopes[r.course].includes(r.id));
export const plans=s=>currentStudents(s).filter(x=>(x.completion_state??'not_complete')==='not_complete').map(x=>plan(x,s.courses.find(c=>c.id===x.course),s.sessions,s.settings));
