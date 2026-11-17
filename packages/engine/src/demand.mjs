import {codes} from './engine.mjs';
/** Subject demand uses published sessions and unique students, never sums scenarios. */
export function subjectDemand(state, plans) {
 return state.courses.flatMap(course => {
  const known=new Set([...codes(course.cores),...codes(course.electives)]);
  const sessions=state.sessions.filter(s=>s.course?s.course===course.id:known.has(s.subject));
  return [...new Set(sessions.map(s=>s.subject))].sort().map(subject=>{
   const expected=new Set(),provisional=new Set(),contingency=new Set();
   for(const p of plans.filter(p=>p.student.course===course.id)) {
    const first=p.scenarios[0];
    if(first?.subjects.includes(subject)){expected.add(p.student.id);if(first.provisional)provisional.add(p.student.id);}
    else if(p.scenarios.slice(1).some(s=>s.subjects.includes(subject)))contingency.add(p.student.id);
   }
   return {course:course.id,subject,name:course.rules?.[subject]?.name||sessions.find(s=>s.subject===subject&&s.name)?.name||'Title not supplied',expected:expected.size,provisional:provisional.size,contingency_only:contingency.size};
  });
 });
}
