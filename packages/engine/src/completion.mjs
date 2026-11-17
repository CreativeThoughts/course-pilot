const codes=v=>[...new Set(String(v||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))].sort();
export function completionEligibility(student,course){
 const cores=codes(course.cores),electives=codes(course.electives),completed=codes(student.completed),failed=codes(student.failed),pending=codes(student.in_progress),conflicts=completed.filter(c=>failed.includes(c)||pending.includes(c));
 const all=course.completion_model==='all_subjects',coreCount=all?cores.length:Number(course.core_count),electiveCount=all?0:Number(course.elective_count),mode=all?'mandatory':course.mode||'mandatory',issues=[],warnings=[];
 if(all&&electives.length)issues.push('All-subjects course must contain only Core subjects');
 if(coreCount+electiveCount===0||!Number.isInteger(coreCount)||coreCount<0||coreCount>cores.length||!Number.isInteger(electiveCount)||electiveCount<0||electiveCount>electives.length||!['mandatory','pool'].includes(mode)||cores.some(c=>electives.includes(c))||(mode==='mandatory'&&coreCount!==cores.length))issues.push('Course requirement configuration needs review');
 if(course.requirements_provisional)issues.push('Course requirements are provisional');
 const valid=completed.filter(c=>!conflicts.includes(c)),coreDone=valid.filter(c=>cores.includes(c)),electiveDone=valid.filter(c=>electives.includes(c)),unknown=completed.filter(c=>!cores.includes(c)&&!electives.includes(c)),missingCore=cores.filter(c=>!coreDone.includes(c));
 const coreRemaining=mode==='mandatory'?missingCore.length:Math.max(0,coreCount-coreDone.length),electiveRemaining=Math.max(0,electiveCount-electiveDone.length),requirementsMet=coreRemaining===0&&electiveRemaining===0;
 if(conflicts.length)warnings.push('Conflicting results: '+conflicts.join(', '));if(unknown.length)warnings.push('Completed subjects outside configured course list: '+unknown.join(', '));if(pending.length)warnings.push('Pending marks must be resolved: '+pending.join(', '));
 warnings.push(...(student.data_issues||[]));
 if(coreRemaining)issues.push(`${coreRemaining} core requirement(s) outstanding`);if(electiveRemaining)issues.push(`${electiveRemaining} elective requirement(s) outstanding`);
 const grade=code=>(student.subject_observations||[]).filter(o=>o.status==='completed'&&o.codes?.includes(code)).map(o=>o.grade||'Completed').join('; ')||'Completed';
 const rows=list=>list.map(code=>({code,name:course.rules?.[code]?.name||'Title not supplied',grade:grade(code),counted:valid.includes(code),note:conflicts.includes(code)?'Conflicting result — excluded from counted progress':'Recorded completed'}));
 return {ready:requirementsMet&&issues.length===0,requirements_met:requirementsMet,core_required:coreCount,elective_required:electiveCount,core_completed:coreDone.length,elective_completed:electiveDone.length,core_remaining:coreRemaining,elective_remaining:electiveRemaining,core_mode:mode,missing_core:missingCore,core_subjects:rows(completed.filter(c=>cores.includes(c))),elective_subjects:rows(completed.filter(c=>electives.includes(c))),other_subjects:rows(unknown).map(r=>({...r,counted:false,note:'Outside configured course list — not counted'})),issues:[...new Set(issues)],warnings:[...new Set(warnings)],pending};
}

export const completionBasis=(student,course)=>JSON.stringify({completed:codes(student.completed),failed:codes(student.failed),pending:codes(student.in_progress),cores:codes(course.cores),electives:codes(course.electives),core_count:Number(course.core_count),elective_count:Number(course.elective_count),mode:course.mode||'mandatory',provisional:!!course.requirements_provisional});
