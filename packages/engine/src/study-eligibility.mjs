import {codes} from './engine.mjs';
import {completionEligibility} from './completion.mjs';
export function studyEligibility(state,p,index=0){
 const course=state.courses.find(c=>c.id===p.student.course);if(!course)throw Error('Course not found');
 const assessment=completionEligibility(p.student,course),selected=new Set(p.scenarios[index]?.subjects||[]),pending=new Set(codes(p.student.in_progress)),failed=new Set(codes(p.student.failed)),completed=new Set([...assessment.core_subjects,...assessment.elective_subjects].filter(r=>r.counted).map(r=>r.code)),recorded=new Set(codes(p.student.completed));
 const offered=new Set(state.sessions.filter(r=>r.course?r.course===course.id:codes(course.cores+','+course.electives).includes(r.subject)).map(r=>r.subject));
 const row=code=>{const done=completed.has(code),conflict=recorded.has(code)&&!done;const grade=[...assessment.core_subjects,...assessment.elective_subjects].find(r=>r.code===code)?.grade;return {code,name:course.rules?.[code]?.name||'Title not supplied',completed:done,status:done?'Completed':conflict?'Result conflict - review':pending.has(code)?'Marks awaiting':failed.has(code)?'Not completed - repeat':'Outstanding',grade:done?grade||'Completed':'',recommended:selected.has(code),offered:offered.has(code)};};
 return {template:'Study Plan Template v2',course:course.id,assessment,cores:codes(course.cores).map(row),electives:codes(course.electives).map(row),other:assessment.other_subjects};
}
