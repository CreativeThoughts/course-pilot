import {completionEligibility,completionBasis} from './completion.mjs';
import {currentStudents,codes} from './engine.mjs';

// A review list, not a mutation of MeshEd status or an award of graduation.
export function graduationStudents(state,studentPlans=[]){
 const byId=new Map(studentPlans.map(p=>[p.student.id,p]));
 return currentStudents(state).flatMap(student=>{
  const course=state.courses.find(c=>c.id===student.course);
  if(!course)return [];
  const completed=new Set(codes(student.completed));
  const coreRemaining=Math.max(0,Number(course.core_count)-codes(course.cores).filter(c=>completed.has(c)).length);
  const electiveRemaining=Math.max(0,Number(course.elective_count)-codes(course.electives).filter(c=>completed.has(c)).length);
  const eligibility=completionEligibility(student,course);
  const confirmedComplete=eligibility.requirements_met;
  const expected=byId.get(student.id)?.scenarios[0];
  const sourceComplete=student.completion_state==='completed';
  const conditionalComplete=!confirmedComplete&&expected?.remaining===0&&expected.provisional;
  if(!sourceComplete&&!confirmedComplete&&!conditionalComplete&&coreRemaining+electiveRemaining!==0)return [];
  const reviewKind=eligibility.ready?'completed':'completion_review';
  const savedApproval=state.completion_approvals?.[student.id],approval=eligibility.ready&&savedApproval?.basis===completionBasis(student,course)?savedApproval:null;
  let reason=sourceComplete?'MeshEd records the course as completed. Confirm graduation and exit with administration.':confirmedComplete?'Recorded completed subjects satisfy the configured core and elective requirements. Confirm completion and update MeshEd.':coreRemaining+electiveRemaining===0?'Recorded completed totals require eligibility review.':'Completion depends on all subjects with genuine pending results passing. Await final marks before confirming completion.';
  if(student.data_issues?.length)reason+=' Source data also requires review: '+student.data_issues.join('; ');
  reason+=' '+(eligibility.ready?'Academic completion requirements independently verified. Administrative graduation and exit approval are still required.':'Academic eligibility is not verified: '+eligibility.issues.join('; '));
  return [{...student,in_study_plans:!eligibility.ready&&(state.study_plan_returns||[]).some(r=>r.id===student.id&&r.course===student.course),completion_approval:approval,completion_eligibility:eligibility,eligibility_status:eligibility.ready?'Academic requirements verified':'Eligibility review required',graduation_review_kind:reviewKind,graduation_review_status:eligibility.ready?(approval?'Course Completed — Approved':'Course Completed — Ready for review'):'Completion review required',completion_basis:eligibility.ready?'Confirmed results meet requirements':sourceComplete?'MeshEd completed; course criteria not verified':confirmedComplete?'Confirmed results meet requirements':conditionalComplete?'Conditional on pending marks':'Recorded totals require validation',completion_review_reason:reason,marks_awaiting:codes(student.in_progress).length}];
 }).sort((a,b)=>a.course.localeCompare(b.course)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function filterGraduation(rows,course='all',status='all'){
 return rows.filter(r=>(course==='all'||r.course===course)&&(status==='all'||r.graduation_review_kind===status));
}
const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('/'):value||'';
const csvCell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function graduationCSV(rows){
 const header=['Student ID','Student name','Course','Review status','Completion basis','MeshEd course completion status','MeshEd student status','Exit review','Enrolled date','Completion date','CoE end date','Marks awaiting','Academic eligibility','Core completed','Core required','Elective completed','Elective required','Eligibility issues','Review notes'];
 const data=rows.map(r=>[r.id,r.name,r.course,r.graduation_review_status,r.completion_basis,r.course_completion_status,r.source_status,r.exit_status==='exited'?'Exited':'Exit status needs review',displayDate(r.enrolled_date),displayDate(r.completion),displayDate(r.coe),r.marks_awaiting,r.eligibility_status,r.completion_eligibility.core_completed,r.completion_eligibility.core_required,r.completion_eligibility.elective_completed,r.completion_eligibility.elective_required,r.completion_eligibility.issues.join('; '),r.completion_review_reason]);
 return '\uFEFF'+[header,...data].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
