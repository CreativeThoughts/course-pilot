import {intakeConfirmation} from './intake.mjs';
import {completionEligibility} from './completion.mjs';
import {isConfirmedIntake} from './enrolment-audit.mjs';
import {currentStudents} from './engine.mjs';
import {mapRows, now, workbookRows} from './imports.mjs';

export function includePlanningStudents(state, body, intake) {
 const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(id => String(id).trim()).filter(Boolean))] : [];
 if (!ids.length) throw Error('Enter at least one student ID.');
 const current = new Map(currentStudents(state).map(student => [student.id, student]));
 const missing = new Set(ids.filter(id => !current.has(id)));
 const sourceRows = body.file && missing.size
  ? workbookRows(Uint8Array.from(atob(body.file.data), char => char.charCodeAt(0))).map((row,index) => ({row, number:index+2})).filter(({row}) => missing.has(row.Studentid.trim()))
  : [];
 const imported = mapMissingRows(sourceRows, state, body.file?.name, intake);
 const candidates = ids.map(id => current.get(id) || imported.get(id));
 for (const [index, student] of candidates.entries()) {
  const course = state.courses.find(course => course.id === student?.course);
  if (!student || !course) throw Error('Student '+ids[index]+' was not found in the current snapshot or supplied workbook.');
  if (intakeConfirmation(state,course.id)) throw Error('Enrolment is already confirmed for '+course.id+'.');
  if (student.completion_state !== 'not_complete' || completionEligibility(student, course).ready)
   throw Error('Student '+student.id+' must have outstanding academic requirements.');
  if (isConfirmedIntake(student,state.settings) && !student.confirmed_enrolled)
   throw Error('Student '+student.id+' opted out of this confirmed intake.');
 }

 const time = now();
 state.planning_inclusions ??= [];
 const added = [];
 for (const student of candidates) {
  if (imported.has(student.id)) {
   state.planning_scopes ??= {};
   const scope = state.planning_scopes[student.course] || state.students.filter(row => row.course === student.course).map(row => row.id);
   state.students = state.students.filter(row => row.id !== student.id).concat(student);
   if (!scope.includes(student.id)) state.planning_scopes[student.course] = [...scope, student.id];
  }
  if (!state.planning_inclusions.some(row => row.id === student.id && row.course === student.course && row.intake === intake)) {
   const entry = {id:student.id, course:student.course, intake, time};
   state.planning_inclusions.push(entry);
   added.push(entry);
  }
 }
 if (added.length || imported.size)
  state.audit.push({type:'intake_planning_inclusion',time,students:added,source:imported.size ? body.file.name : null});
 return {included:ids.length, added:added.length, imported:imported.size};
}

function mapMissingRows(rows, state, name, intake) {
 if (!rows.length) return new Map();
 const mapped = mapRows(rows.map(({row}) => row), state.courses, name, intake);
 mapped.forEach((student,index) => { student.source_row = rows[index].number; });
 const byId = new Map(mapped.map(row => [row.id, row]));
 if (byId.size !== mapped.length) throw Error('The workbook contains multiple attempts for a requested student.');
 for (const row of mapped) {
  if (state.students.some(student => student.id === row.id && student.course !== row.course))
   throw Error('The student ID belongs to a different course.');
 }
 return byId;
}
