import {plan} from './engine.mjs';
export function calculate(snapshot) {return snapshot.students.filter(s=>s.completion_state==='not_complete').map(student=>plan(student,snapshot.course,snapshot.sessions,snapshot.settings));}

