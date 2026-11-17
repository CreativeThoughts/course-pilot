import {test} from 'node:test';import assert from 'node:assert/strict';import {actionStatus,planStatus} from '../packages/domain/src/status.js';import {refreshInput} from '../packages/contracts/src/index.js';import {plan} from '../packages/engine/src/engine.mjs';import {completionEligibility} from '../packages/engine/src/completion.mjs';import {mapRows} from '../packages/engine/src/imports.mjs';
test('actionable risk wins over pending marks; overdue waiting reopens',()=>{assert.equal(planStatus(['PENDING_RESULTS','TIMETABLE_CLASH']),'Action needed');assert.equal(planStatus(['PENDING_RESULTS']),'Waiting');assert.equal(actionStatus({closed:true,evidenceChanged:true}),'Action needed');assert.equal(actionStatus({waiting:true,followUp:'2026-01-01'},new Date('2026-02-01')),'Action needed');});
test('engine preserves prerequisites, caps, expected scenarios and timetable compatibility',()=>{
 const student={id:'synthetic',course:'TEST',completed:'A',in_progress:'B',failed:'',coe:'2028-01-01',completion:'2028-01-01'};
 const course={cores:'A,B,C,D,E',electives:'F',core_count:5,elective_count:1,rules:{C:{prerequisite:'B'}}};
 const sessions=['B','C','D','E','F'].map((subject,i)=>({course:'TEST',subject,day:String(i),start:'09:00',end:'12:00'}));
 const p=plan(student,course,sessions,{end:'2027-06-30'});assert.equal(p.scenarios.length,2);assert.ok(p.scenarios[0].subjects.includes('C'));assert.ok(!p.scenarios[1].subjects.includes('C'));assert.ok(p.scenarios.every((s:any)=>s.subjects.length<=4));
});
test('Other passing grades preserve recognition and failure exclusions',()=>{
 const course={id:'BBIS',cores:'BIS101',electives:'BIS201,BIS202',core_count:1,elective_count:1,mode:'mandatory'};
 const [s]=mapRows([{Studentid:'SYNTHETIC','Student Name':'Synthetic Student',CourseID:'BBIS','Course Length':'01/01/2025 - 01/03/2027',Status:'Current Student','Course Completion Status':'Not Completed','Subject Completed':'BIS101(P)','Subject Failed':'BIS202(N)',Other:'BIS201(C), BIS202(P)'}],[course],'synthetic.xlsx');
 assert.equal(s.completed,'BIS101,BIS201');assert.equal(completionEligibility(s,course).ready,true);
});
test('malformed dates and duplicate feed IDs are rejected',()=>{assert.throws(()=>refreshInput.parse({baseVersion:0,students:[{id:'X',name:'Test',course:'A',coe:'2027-02-31',completion:'2027-01-01'}],sessions:[]}));});

