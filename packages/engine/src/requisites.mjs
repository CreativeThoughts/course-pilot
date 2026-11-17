export const codePattern=/\b[A-Z]{2,10}\d{3,6}\b/g;
export const extractSubjectCodes=value=>[...new Set(String(value||'').toUpperCase().match(codePattern)||[])].sort();
export function parseRequisites(value){
 const prerequisites=[],corequisites=[];let type='P';
 for(const segment of String(value||'').toUpperCase().split(';')){type='P';for(const part of segment.split(/(\([CP]\))/)){
  if(/^\([CP]\)$/.test(part)){type=part[1];continue;}
  (type==='C'?corequisites:prerequisites).push(...extractSubjectCodes(part));
 }}
 return {prerequisites:[...new Set(prerequisites)].sort(),corequisites:[...new Set(corequisites)].sort()};
}
export function prerequisiteCodes(rule){return rule.prerequisites||extractSubjectCodes(rule.prerequisite);}
export function corequisiteCodes(rule){return rule.corequisites||extractSubjectCodes(rule.corequisite);}
