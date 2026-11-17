import {intakeKey,intakeConfirmation} from './intake.mjs';
import {isConfirmedIntake} from './enrolment-audit.mjs';
import {now} from './imports.mjs';

export function intakePlanningAction(state, path, body, intakePlans) {
 const course = state.courses.find(course => course.id === body.course);
 if (!course) throw Error('Select a course in your workspace.');
 if (intakeConfirmation(state, course.id)) throw Error('Enrolment is already confirmed for this course and intake.');
 if (state.students.some(student => student.course === course.id && isConfirmedIntake(student, state.settings)))
  throw Error('This course has confirmed enrolments from the student register.');

 const intake = intakeKey(state), time = now();
 const plans = () => intakePlans(state).filter(plan => plan.student.course === course.id);
 const exclusions = state.planning_exclusions ?? [];
 const scopedExclusion = entry => entry.course === course.id && entry.intake === intake;
 if (path === 'planning/confirm') {
  const recommendations = plans();
  const enrolled = recommendations.filter(plan => plan.scenarios[0]?.subjects.length);
  if (!enrolled.length) throw Error('No recommended subjects are available to confirm.');
  const confirmation = {
   course:course.id, intake, time,
   plans:enrolled.map(plan => {
    const scenario = plan.scenarios[0];
    return {...plan,scenarios:[{...scenario,confirmed_enrolment:true,name:'Confirmed intake enrolment',
     study_guidance:'These subjects were confirmed for this intake in CoursePilot.',
     reasons:Object.fromEntries(scenario.subjects.map(subject=>[subject,'Confirmed in CoursePilot']))}]};
   }),
  };
  state.intake_confirmations = [...(state.intake_confirmations || []),confirmation];
  state.audit.push({type:'intake_enrolment_confirmed',course:course.id,intake,time,
   students:enrolled.map(plan=>({id:plan.student.id,subjects:plan.scenarios[0].subjects}))});
  return {enrolled:enrolled.length};
 }
 const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(id=>String(id).trim()).filter(Boolean))] : [];
 if (!ids.length) throw Error('Enter at least one student ID.');
 const restore = path === 'planning/restore';
 const available = new Set((restore ? exclusions.filter(scopedExclusion) : plans().map(plan=>plan.student)).map(row=>row.id));
 const invalid = ids.filter(id=>!available.has(id));
 if (invalid.length) throw Error('Student IDs outside this list: '+invalid.join(', '));
 state.planning_exclusions = restore
  ? exclusions.filter(entry=>!scopedExclusion(entry)||!ids.includes(entry.id))
  : exclusions.concat(ids.map(id=>({id,course:course.id,intake,time})));
 state.audit.push({type:restore?'intake_planning_restored':'intake_planning_excluded',course:course.id,intake,time,ids});
 return {changed:ids.length};
}
