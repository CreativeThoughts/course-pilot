import {studyEligibility} from './study-eligibility.mjs';
/** Sites renderer of the approved Template v1 sections and weekly grid. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {codes} from './engine.mjs';
import {DAYS,stable,validTime} from './imports.mjs';
const colour=h=>rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255);
const ink=colour('292536'),muted=colour('676176'),purple=colour('5941b5'),line=colour('e6e1ef'),tint=colour('f0ecfb');
const clean=v=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/\u2022/g,' | ').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
const date=v=>v&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10).split('-').reverse().join('/'):v||'Not supplied';
const generated=()=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
async function hash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(v))))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,10);}
async function document(landscape=false,template='Template v1'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),W=landscape?841.89:595.28,H=landscape?595.28:841.89,M=landscape?30:40,bottom=65;let page,y;
 const newPage=()=>{page=pdf.addPage([W,H]);y=H-(landscape?25:32);};newPage();
 const wrap=(value,width,size=9,f=font)=>{
  const lines=[];for(const paragraph of clean(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(f.widthOfTextAtSize(word,size)>width){if(line){lines.push(line);line='';}let part='';for(const ch of word){if(f.widthOfTextAtSize(part+ch,size)>width){lines.push(part);part='';}part+=ch;}line=part;}else if(line&&f.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}return lines;
 };
 const ensure=h=>{if(y-h<bottom)newPage();};
 const text=(value,{size=9,color=ink,font:f=font,gap=5,width=W-2*M}={})=>{const lines=wrap(value,width,size,f),leading=size+4;for(const l of lines){ensure(leading);page.drawText(l,{x:M,y:y-size,size,font:f,color});y-=leading;}y-=gap;};
 const heading=value=>{ensure(48);y-=10;text(value,{size:11,color:purple,font:bold,gap:8});};
 const table=(rows,widths,{header=true,grid=false,size=9}={})=>{
  const headerRow=header?rows[0]:null;
  const drawRow=(row,isHeader=false)=>{
   const f=isHeader?bold:font,fs=isHeader?(grid?7.5:8):size,pad=grid?5:8,leading=fs+(grid?2:3),wrapped=row.map((v,i)=>wrap(v,widths[i]-2*pad,fs,f));
   let offset=0,total=Math.max(...wrapped.map(a=>a.length));
   while(offset<total){
    let capacity=Math.floor((y-bottom-2*pad)/leading);
    if(capacity<1){newPage();if(headerRow&&!isHeader)drawRow(headerRow,true);capacity=Math.floor((y-bottom-2*pad)/leading);}
    const count=Math.min(total-offset,capacity),height=count*leading+2*pad;let x=M;
    for(let i=0;i<row.length;i++){
     if(isHeader)page.drawRectangle({x,y:y-height,width:widths[i],height,color:tint});
     if(grid)page.drawRectangle({x,y:y-height,width:widths[i],height,borderColor:line,borderWidth:.5});
     for(let j=0;j<count;j++)if(wrapped[i][offset+j]!==undefined)page.drawText(wrapped[i][offset+j],{x:x+pad,y:y-pad-fs-j*leading,size:fs,font:f,color:isHeader?muted:ink});
     x+=widths[i];
    }
    page.drawLine({start:{x:M,y:y-height},end:{x:M+widths.reduce((a,b)=>a+b,0),y:y-height},color:line,thickness:.4});y-=height;offset+=count;
    if(offset<total){newPage();if(headerRow&&!isHeader)drawRow(headerRow,true);}
   }
  };
  rows.forEach((row,i)=>{const height=Math.max(...row.map((v,j)=>wrap(v,widths[j]-16,i===0&&header?8:size,i===0&&header?bold:font).length))*(size+3)+16;if(y-height<bottom&&height<H-bottom-80){newPage();if(headerRow&&i>0)drawRow(headerRow,true);}drawRow(row,header&&i===0);});y-=5;
 };
 return {pdf,text,heading,table,newPage,finish:async(footer,title,author)=>{pdf.setTitle(title);pdf.setAuthor(author);pdf.setSubject('CoursePilot '+template+' - Sites renderer');for(const [i,p] of pdf.getPages().entries()){p.drawLine({start:{x:M,y:51},end:{x:W-M,y:51},color:line,thickness:.4});const lines=wrap(footer,W-2*M-60,7);for(const [j,l] of lines.slice(0,2).entries())p.drawText(l,{x:M,y:39-j*11,size:7,font,color:muted});p.drawText('Page '+(i+1),{x:W-M-32,y:27,size:7,font,color:muted});}return pdf.save();}};
}
export async function studyPlanPDF(s,p,index){
 const student=p.student,sc=p.scenarios[index],course=s.courses.find(c=>c.id===student.course),rules=course.rules||{},decision=s.decisions[student.id+':'+index]||{},status=sc.confirmed_enrolment?'Confirmed enrolment':decision.decision==='Approved'?'Approved':sc.provisional?'Provisional':'Draft';
 const eligibility=studyEligibility(s,p,index),a=eligibility.assessment;
 const version=await hash({template:eligibility.template,settings:s.settings,course,student,sessions:s.sessions}),id=`CP-${student.id}-${index+1}-${version}`,d=await document(false,eligibility.template);
 d.heading(s.settings.institute);d.text('Student Study Plan',{size:23,gap:12});d.text(`${status.toUpperCase()} | ${sc.name} | Generated ${generated()}`);
 d.table([['Student',student.name,'Student ID',student.id],['Course',course.name,'Curriculum',student.curriculum||'Not supplied'],['Enrolled',date(student.enrolled_date),'CoE end',date(student.coe)]],[65,195,65,190],{header:false});
 d.heading('Course eligibility - confirmed progress');
 d.table([['Requirement','Required','Completed','Outstanding'],['Core subjects',String(a.core_required),String(a.core_completed),String(a.core_remaining)],['Elective subjects',String(a.elective_required),String(a.elective_completed),String(a.elective_remaining)]],[215,100,100,100]);
 d.text('Completed counts use confirmed recognised results only. Pending marks, interests and recommendations are not completed credit. Full subject checklist is at the end.',{size:8,color:muted});
 d.text(`Scenario planning: ${sc.core_remaining} core + ${sc.elective_remaining} elective remaining. Marks awaiting: ${a.pending.length}.`,{size:8,color:muted});
 if(codes(student.enrolment_interests).length){d.text('Enrolment interests: '+codes(student.enrolment_interests).join(', '));d.text('These are intake preferences, not pending marks or completed subjects. Selected interests are included within the total recommended load.',{size:8,color:muted});}
 d.heading(sc.confirmed_enrolment?'Confirmed enrolled subjects for this intake':'Recommended subjects for this intake');d.text(`${s.settings.semester} | ${date(s.settings.start)} - ${date(s.settings.end)}`);
 if(sc.optional_study)d.text(`Optional summer study. Up to ${sc.semester_limit} subjects; CoE covers ${sc.future_semesters_available} configured future semesters.`,{size:8,color:muted});
 if(sc.subjects.length)d.table([['Code','Subject name','Category',sc.confirmed_enrolment?'Enrolment basis':'Why recommended','Eligibility'],...sc.subjects.map(code=>[code,rules[code]?.name||'Title not supplied',codes(course.cores).includes(code)?'Core':'Elective',sc.reasons[code],sc.confirmed_enrolment?(p.enrolment_audit?.requires_review||sc.provisional?'Review required':'Checks passed'):sc.provisional?'Conditional':'Met'])],[59,155,58,173,70]);else d.text('No subjects recommended in this scenario. Review completion status and outstanding requirements.');
 d.heading('Important notes and next steps');if(p.enrolment_audit){const audit=p.enrolment_audit;d.text('Confirmed enrolments are retained from MeshEd. Enrolled subjects are not pending marks or completed credit.');if(audit.over_limit)d.text('Load review: enrolled in '+sc.subjects.length+' subjects against a summer recommendation cap of '+audit.limit+'.');for(const r of audit.missing_corequisites)d.text(r.subject+' requires '+r.requires+' in this same intake; a previous pass does not satisfy C.');for(const r of audit.missing_prerequisites)d.text(r.subject+' requires prior completion of '+r.requires);for(const r of audit.clashes)d.text('Timetable clash: '+r.subject+' / '+r.other+' on '+r.day+' '+r.start+'-'+r.end);if(audit.not_offered.length)d.text('Enrolled subjects not offered: '+audit.not_offered.join(', '));}if(sc.provisional)d.text('Marks Awaiting: this scenario depends on unresolved results. Review the alternative outcomes in the appendix.');if(sc.flags.some(f=>['COE_REVIEW_REQUIRED','COMPLETION_DATE_AT_RISK'].includes(f)))d.text('Date review required: the recorded completion or CoE end date is earlier than the study period needed. Contact the coordinator.');if(student.data_issues?.length)d.text('Source data requires review. Details are in the appendix.');d.text(`Requirements remaining after passing this plan: ${Math.max(0,sc.remaining-sc.subjects.length)} subjects. Future teaching periods and subject offerings are not confirmed.`);
 if(sc.unselected_interests?.length){d.heading('Enrolment interests requiring review');for(const r of sc.unselected_interests)d.text(r.subject+' - '+r.reason);}
 d.heading('Coordinator review');d.text(`Decision: ${decision.decision||'Not yet reviewed'} | Reviewer: ${decision.reviewer||'Not recorded'} | Date: ${date(decision.time)}`);d.text(decision.rationale||'Coordinator review is required before this plan is issued as approved.',{size:8,color:muted});
 if(student.completed||student.data_issues?.length||p.scenarios.length>1||sc.sessions.length){
 d.newPage();d.text('Academic record and planning details',{size:18,gap:10}); if(sc.sessions.length){d.heading('Selected timetable sessions');d.table([['Subject','Day','Time','Group'],...sc.sessions.map(r=>[r.subject,r.day,r.start+' - '+r.end,r.group||'A'])],[75,160,190,90]);}
 if(p.scenarios.length>1){d.heading('Alternative outcomes');d.text('Alternatives only - do not enrol in these subjects in addition to the main plan. Expected assumes all pending subjects pass; contingencies assume the named failures. '+(sc.bounded?'Evaluation is bounded to all-pass and all-fail outcomes.':'All pending-result combinations were evaluated.'));d.table([['Scenario','Alternative subject list'],...p.scenarios.filter((_,i)=>i!==index).map(x=>[x.name,x.subjects.join(', ')||'No recommended subjects'])],[255,260]);}
 if(sc.missing.length){d.heading('Outstanding cores not offered');d.text(sc.missing.join(', ')+' - future planning information.');}if(student.data_issues?.length){d.heading('Source data review');student.data_issues.forEach(x=>d.text(x));}
 d.heading('Source and eligibility basis');d.text(`Student source: ${student.source||'Accepted student register'}, row ${student.source_row||'not recorded'}. Rules: ${course.source||'Accepted course rules'}. Input version: ${version}.`,{size:8,color:muted});d.text('Eligibility uses accepted course rules and the scenario assumptions. This plan does not confirm future offerings or guarantee a completion date.',{size:8,color:muted});
 }
 d.newPage();d.text('Course eligibility checklist',{size:18,gap:10});d.text(`${student.name} | ${student.id} | ${course.id}`,{size:8,color:muted});
 d.text(sc.confirmed_enrolment?'Confirmed academic record at generation time. Enrolled subjects are not completed credit.':'Confirmed academic record at generation time. Intake recommendations indicate proposed study only; they do not change completion status.',{size:8,color:muted});
 const checklist=(title,rows,note)=>{d.heading(title);d.text(note,{size:8,color:muted});d.table([['Code','Subject','Confirmed status','This intake'],...rows.map(r=>[r.code,r.name,r.status+(r.grade?' | '+r.grade:''),r.recommended?(sc.confirmed_enrolment?'Enrolled':'Recommended'):r.completed?'Completed':r.offered?'Offered':'Not offered'])],[65,235,125,90],{size:8});};
 checklist('Core subjects',eligibility.cores,a.core_mode==='mandatory'?`Complete every required core. ${a.core_completed} confirmed; ${a.core_remaining} outstanding.`:`Complete ${a.core_required} from this core pool. ${a.core_completed} confirmed; ${a.core_remaining} more needed. Uncompleted rows are options, not all mandatory.`);
 d.newPage();d.text('Course eligibility - elective options',{size:18,gap:10});d.text(`${student.name} | ${student.id} | ${course.id}`,{size:8,color:muted});
 checklist('Elective subjects',eligibility.electives,`Complete ${a.elective_required} distinct eligible electives. ${a.elective_completed} confirmed; ${a.elective_remaining} more needed. Uncompleted elective rows are choices; you do not need to complete every listed option.`);
 if(eligibility.other.length){d.heading('Other recorded completions - not counted');d.text(eligibility.other.map(r=>r.code+' - '+r.name).join('; '),{size:8});}
 if(a.issues.length){d.heading('Course requirement checks');a.issues.forEach(x=>d.text(x,{size:8}));}
 if(a.warnings.length){d.heading('Source observations');a.warnings.forEach(x=>d.text(x,{size:8}));}
 d.text(`Course rules: ${course.source||'Accepted course configuration'} | Curriculum: ${student.curriculum||'Not supplied'} | ${eligibility.template}`,{size:8,color:muted});
 return d.finish(`Academic guidance only. Does not complete enrolment or amend the CoE.\n${id} | ${status} | Study Plan Template v2`,'Student Study Plan',s.settings.institute);
}
export async function graduationCompletedPDF(s,student){
 const course=s.courses.find(c=>c.id===student.course),a=student.completion_eligibility;
 if(!course||!a?.ready)throw Error('Academic completion requirements must be verified');
 const d=await document(false,'Graduation Completion Report');
 const title='Graduation Completion Report';
 d.text(s.settings.institute,{size:10,color:purple,gap:10});
 d.text(title,{size:10,color:muted,gap:8});
 d.text('Congratulations, '+student.name+'!',{size:24,gap:10});
 d.text('You have met the academic requirements for '+course.name+'.',{size:11,gap:10});
 d.table([['Student ID',student.id],['Course',course.id+' | '+course.name]],[105,410],{header:false});
 d.heading('Course eligibility');
 d.table([['Requirement','Required','Completed','Outstanding'],
  ['Core subjects',a.core_required,a.core_completed,a.core_remaining],
  ['Elective subjects',a.elective_required,a.elective_completed,a.elective_remaining]],[215,100,100,100]);
 const approval=student.completion_approval;
 d.text(approval?'Completion approved by '+approval.reviewer+' on '+date(approval.time)+'.':'Academic requirements verified. Coordinator approval is pending.',{size:9,color:muted,gap:8});
 d.heading('Completed subjects');
 const entries=[
  ...a.core_subjects.map(row=>({...row,category:'Core'})),
  ...a.elective_subjects.map(row=>({...row,category:'Elective'})),
  ...a.other_subjects.map(row=>({...row,category:'Other'}))
 ];
 const results=row=>{
  const observations=(student.subject_observations||[]).filter(o=>o.status==='completed'&&o.codes?.includes(row.code));
  const labels=observations.map(o=>[o.grade||'Completed',o.source_column==='Other'?'MeshEd Other':'Subject Completed'].join(' | '));
  return [...new Set(labels)].join(' / ')||row.grade;
 };
 d.table([['Code','Subject description','Category','Grade / source result'],
  ...entries.map(row=>[row.code,row.name,row.category,results(row)+(row.counted?'':' (not counted)')])],[73,240,65,137],{size:9});
 d.text('Student record: '+(student.source||'Accepted student register')+(student.source_row?' | Row '+student.source_row:''),{size:8,color:muted});
 return d.finish(student.name+' | '+student.id+' | '+course.id+'\nGenerated '+generated(),title,s.settings.institute);
}
export async function timetablePDF(s,courseId){
 const course=s.courses.find(c=>c.id===courseId);if(!course)throw Error('Select a known course');
 const sessions=s.sessions.filter(r=>r.course?r.course===courseId:codes(course.cores+','+course.electives).includes(r.subject)).map(r=>({...r,name:r.name||course.rules?.[r.subject]?.name||'Title not supplied'})).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.subject.localeCompare(b.subject)||(a.group||'').localeCompare(b.group||'')||(a.id||'').localeCompare(b.id||''));
 for(const r of sessions)if(!DAYS.includes(r.day)||!validTime(r.start)||!validTime(r.end)||r.start>=r.end)throw Error('Invalid timetable session');
 const days=DAYS.filter((d,i)=>i<5||sessions.some(r=>r.day===d)),slots=[...new Set(sessions.map(r=>r.start+'|'+r.end))].sort(),version=await hash({course,settings:s.settings,sessions}),d=await document(true);
 d.text(s.settings.institute,{size:8,color:muted,gap:9});d.text(courseId+' Course Timetable',{size:21,gap:9});d.text(course.name,{size:8,color:muted});d.text(`${s.settings.semester} | ${date(s.settings.start)} - ${date(s.settings.end)}`,{size:8,color:muted});if(course.teaching_period)d.text('Source teaching dates: '+date(course.teaching_period.teaching_start)+' - '+date(course.teaching_period.teaching_end),{size:8,color:muted});d.text(`Subjects offered: ${new Set(sessions.map(r=>r.subject)).size} | Weekly sessions: ${sessions.length} | Generated: ${generated()}`,{size:8,color:muted,gap:8});
 d.table([['Time',...days],...slots.map(slot=>{const [start,end]=slot.split('|');return [start+' - '+end,...days.map(day=>sessions.filter(r=>r.day===day&&r.start===start&&r.end===end).map(r=>`${r.subject}\n${r.name}\n${r.lecturer||'Lecturer not supplied'} | Group ${r.group||'A'}`).join('\n\n')||'-')];})],[78,...days.map(()=>(841.89-60-78)/days.length)],{grid:true,size:7.5});
 if(!sessions.length)d.text('No accepted sessions are available for this course.',{size:8,color:muted});d.text('Sessions recur weekly unless advised otherwise. Simultaneous classes are separate offerings; students must follow their approved study plan.',{size:7,color:muted});d.text('Rows show actual session time ranges, not a proportional time scale. Different time rows can overlap.',{size:7,color:muted});
 return d.finish(`CoursePilot | Course Timetable Template v1 | ${courseId} | Input version ${version}`,courseId+' Course Timetable',s.settings.institute);
}
