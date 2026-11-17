export type ActionStatus = 'Action needed' | 'Waiting' | 'On track' | 'Completed';
export function actionStatus(input: {closed?:boolean; actionable?:boolean; waiting?:boolean; followUp?:string; evidenceChanged?:boolean}, now = new Date()):ActionStatus {
 if(input.evidenceChanged || input.actionable) return 'Action needed';
 if(input.closed) return 'Completed';
 if(input.waiting) return input.followUp && new Date(input.followUp) <= now ? 'Action needed' : 'Waiting';
 return 'On track';
}
export function planStatus(flags:string[]):ActionStatus {
 const waiting = new Set(['PENDING_RESULTS','MARKS_AWAITING']);
 const informational = new Set(['COURSE_COMPLETE','OPTIONAL_SUMMER_STUDY','SUMMER_THREE_SUBJECT_LIMIT']);
 return actionStatus({actionable:flags.some(f=>!waiting.has(f)&&!informational.has(f)),waiting:flags.some(f=>waiting.has(f))});
}
export function overlap(a:{day:string;start:string;end:string}, b:{day:string;start:string;end:string}) {return a.day===b.day && a.start<b.end && b.start<a.end;}

