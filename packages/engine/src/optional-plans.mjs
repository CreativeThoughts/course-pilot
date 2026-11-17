import {isConfirmedIntake} from './enrolment-audit.mjs';
import {plans as legacyPlans,currentStudents,plan} from './engine.mjs';
import {intakeKey,intakeStudent,intakeEligibility} from './intake.mjs';
import {completionEligibility} from './completion.mjs';
export function planningPool(s){return currentStudents(s).flatMap(x=>{
 const course=s.courses.find(c=>c.id===x.course);if(!course)return [];
 const assessment=completionEligibility(x,course),returned=!assessment.ready&&(s.study_plan_returns||[]).some(r=>r.id===x.id&&r.course===x.course);
 if((x.completion_state??'not_complete')!=='not_complete'&&!returned)return [];
 const student=intakeStudent(s,x),counted=returned?[...assessment.core_subjects,...assessment.elective_subjects].filter(r=>r.counted).map(r=>r.code).join(','):student.completed;
 const p=plan({...student,completed:counted},course,s.sessions,s.settings);p.student=student;
 if(returned){p.completion_reassessment={enrolment_required:!assessment.requirements_met,issues:assessment.issues,eligibility:assessment};for(const sc of p.scenarios){sc.flags=sc.flags.filter(f=>f!=='COURSE_COMPLETE');sc.flags.unshift(assessment.requirements_met?'COMPLETION_EVIDENCE_REVIEW':'RETURNED_TO_STUDY_PLAN');}}
 return [{...p,intake_eligibility:returned&&!isConfirmedIntake(student,s.settings)?{included:true,reasons:['Moved from graduation for completion reassessment']}:intakeEligibility(s,p)}];
 });}
export function intakePlans(s){
 const intake=intakeKey(s);
 const confirmations=(s.intake_confirmations||[]).filter(entry=>entry.intake===intake);
 const closed=new Set(confirmations.map(entry=>entry.course));
 const excluded=new Set((s.planning_exclusions||[]).filter(entry=>entry.intake===intake).map(entry=>entry.course+'|'+entry.id));
 const standard=!s.settings.optional_intake&&!s.intake_preferences?.length&&!s.study_plan_returns?.length&&!s.planning_inclusions?.length&&!s.students.some(r=>isConfirmedIntake(r,s.settings));
 const proposals=standard?legacyPlans(s):planningPool(s).filter(p=>p.intake_eligibility.included);
 return proposals.filter(p=>!closed.has(p.student.course)&&!excluded.has(p.student.course+'|'+p.student.id))
  .concat(confirmations.flatMap(entry=>entry.plans));
}
