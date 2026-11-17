# Course Pilot product features

**Version 2.2 · Consolidated product specification · 16 November 2026**

Course Pilot gives each institution a shared intake workspace. Course coordinators can prepare the next intake while monitoring the current one, intervene when students may miss their completion deadline, and hand verified completion candidates to graduation administration. The platform supports multiple institutions and multiple coordinators per institution.

The companion [Recommendation Engine Rules](Course_Pilot_Recommendation_Engine_Rules.md) records the existing engine contract and proposed planning checks. This specification defines target product behaviour. The workspace implementation already provides coordinator profiles and dated course assignments, scoped study plans, imports, timetable drafts and publication, subject coordinator assignments, and graduation review. Its current institution setup and profile switching provide the starting point for authenticated multi-institution rollout. This revision incorporates the runtime changes through 16 November 2026, including manual intake participation, local enrolment confirmation, student rosters and academic completion reports. The simplified action statuses describe the agreed target experience. Section 6 records implementation evidence and remaining design work.

## 1. Users and authority

| Role | Product capabilities | Scope |
| --- | --- | --- |
| Global Admin | Create, configure, activate and suspend institutions. Assign institution admins, oversee onboarding and platform health, and audit access changes. | Platform configuration and operational metadata. Institution record access requires an explicit, logged grant. |
| Institution Admin | Configure courses, curricula, teaching periods and source mappings. Invite users, assign coordinators with effective dates, accept imports, monitor jobs and route escalations. | Own institution. |
| Course Coordinator | Review progress and recommendations, collect interest, plan offerings and teaching, resolve timetable conflicts, manage operational approvals, and verify completion candidates. | Dated assignments to one or more courses. Multiple coordinators can share a course, with one accountable owner per approval queue. |
| Lecturer or subject coordinator | Confirm teaching availability, maintain assigned assessments and attendance, contribute to extension reviews, and submit timesheets. | Assigned offerings, classes and dates. Teaching and subject coordination can be assigned independently. |
| Student | Submit intake and subject interests, see their published timetable and due dates, and request extensions where enabled. | Own active course enrolments and records. |
| Graduation administrator | Review approved academic evidence, reconcile administrative clearance and maintain ceremony rosters. | Delegated institution and cohorts. |

Every request, export and job enforces institution and role scope server-side. Assignment expiry ends routine access. Historic decisions remain attributable to the original reviewer and accessible through authorised history. One user may hold different roles or course assignments across institutions, with an explicit active institution context.

## 2. Intake workspaces

The landing page shows **Plan next intake** and **Run current intake** with separate period selectors, freshness and action counts. An institution can operate concurrent teaching periods across courses and retain historical intakes. Planning moves through draft, ready for publication and published. Delivery moves through active and closed. These lifecycle stages appear within the relevant workspace. Graduation review can begin while delivery is active. Coordinator work queues use the shared action statuses below. Record the assignee, action, reason and time for each resolved or reopened item.

### Shared coordinator action statuses

Use three active statuses across planning, student reviews, timetable preparation, extensions, timesheets, attendance and graduation work. Completed work is available through history. The coordinator can understand each item through its status, a short explanation and one primary next action.

| Status | Meaning for the coordinator | Example and next action |
| --- | --- | --- |
| **Action needed** | A decision, correction, follow-up or escalation is available and assigned to this coordinator. Includes items ready for approval or publication. | Required subject unavailable → Review offering. Valid extension request → Review request. Timetable checks passed → Review and publish. |
| **Waiting** | Progress depends on an identified person, source update or running check, and the coordinator has no immediate action. Show who or what is awaited and the expected response or follow-up date. | Awaiting lecturer acceptance. Awaiting final marks. Rechecking the revised timetable. |
| **On track** | The latest available assessment identifies no coordinator action or blocking dependency for the current task. | A current study plan is within the applicable requirements and needs no review. |
| **Completed** | The particular task has a recorded outcome or has been resolved by verified evidence. Show it in history by default. | Extension approved or declined. Offering review resolved. Academic approval recorded and handed over. |

**Completed refers to the task.** Academic course completion and ceremony clearance retain their evidence-based checks. A completed academic approval task can have a linked administrative clearance task in Waiting. On track describes the current assessment and does not establish eventual course completion or publication readiness.

#### Queue and interaction behaviour

- Default to **Action needed**, scoped to the coordinator's current institution, assigned courses and selected intake. Provide Waiting and On track filters and a separate Completed history view. Keep lifecycle and engine processing states in item details or the administrative operations workspace.
- Display one status per work item, one plain-language reason, a responsible owner, a due or follow-up date where relevant, and one primary action. If several findings affect the same decision, show the highest-priority reason and a compact count of additional reasons. Expand the item to see full evidence and available actions.
- Group findings by the decision the coordinator must make. For example, a missing core and the resulting underload and CoE risk can share one student planning review. Independent extension requests and timesheets remain distinct tasks. Use stable task identity across refreshes and link shared causes, such as one missing offering affecting several students.
- Label summary counts as tasks. Where student counts are useful, show a separately labelled distinct-student count. Count each task once even when multiple flags, scenarios or affected students contribute to it.
- Put urgent or overdue actions first, followed by the earliest relevant deadline and then oldest open work. Urgency appears as a short qualifier beside the date, with the reason available in details. Risk level, processing state and decision outcome remain separate fields from action status.
- Use the agreed midnight and indigo design. Action needed uses an amber label, Waiting a neutral slate label, On track a restrained green label, and Completed a quiet neutral check. Indigo identifies the primary action. A blocking or urgent issue can use a red icon with text. Every state includes a readable label.

#### Status transitions and ownership

1. Create or update a task from accepted evidence and the current workflow stage. Resolve its owner using institution, course and delegation scope. An unassigned actionable task enters the accountable course owner's Action needed queue for assignment.
2. For an open task, use Action needed when the coordinator can act now, even if another dependency is pending. Use Waiting when the remaining prerequisite is owned by someone else or a source/check is expected. Use On track only when the current task has no action or blocking dependency. An expected future result can be recorded as context until it becomes necessary for the current decision.
3. A handoff requires an identified recipient or dependency and a follow-up date or expected update time. A missed date creates a follow-up action for the accountable coordinator. The underlying owner and dependency remain visible.
4. When a dependency is satisfied, assess the next step. If approval, publication or follow-up is required, move to Action needed. Record an explicit decision or validated resolution before completing an open review task. Approved, declined, withdrawn and superseded remain named outcomes in history.
5. On a material evidence change, reopen affected completed tasks and recalculate their action status. While current checks are pending, use Waiting unless a coordinator action is already available. Retain earlier decisions and keep the previous successful assessment visibly dated. A failed refresh routes a recovery action to its authorised owner and provides Waiting with a linked dependency to other affected users.
6. Apply status independently to the relevant task and role. The same academic handoff can be complete for the coordinator while an administrative clearance task requires action from graduation administration. Enforce the existing role permissions for every action.

#### Examples across the user journey

| Situation | Coordinator status | Main action or waiting explanation |
| --- | --- | --- |
| A student needs a core subject absent from the proposed intake | Action needed | Review offering, with the CoE impact in the reason. |
| Final marks are required for an academic completion decision and due from the lecturer | Waiting | Awaiting final marks, with owner and expected date. |
| A pending result and a separate resolvable timetable clash affect the same planning review | Action needed | Resolve clash, with the pending result shown in details. |
| An interest response is awaited before the response deadline | Waiting | Awaiting student response. After the deadline, show Action needed to follow up. |
| A lecturer has accepted and all checks are complete, but the coordinator must lock the allocation | Action needed | Confirm allocation. |
| Timetable validation is complete and publication is assigned to the coordinator | Action needed | Review and publish. |
| A submitted timesheet or extension request has sufficient evidence | Action needed | Review timesheet or Review request. |
| Attendance is within policy and sufficient evidence is available | On track | View attendance if required. |
| Attendance evidence is missing and a lecturer update is due | Waiting | Awaiting attendance update. If coordinator intervention is required now, use Action needed. |
| Academic requirements have been independently verified and approval is pending | Action needed | Review completion. |
| Academic approval has been recorded and administration owns clearance | Completed for academic approval; Waiting for the linked clearance task | View approval or Awaiting administrative clearance. |

### P1. Student progression and CoE risk

Import continuing and incoming student-course records, curriculum versions, confirmed credits, failed and pending results, and CoE and institutional completion dates. Show each student's remaining eligible core and elective requirements, planning scenario, available pathways, likely completion period where evidenced, and barriers such as missing offerings, prerequisites, clashes or study load. Route deadline risk, incomplete forecasts and missing dates through the shared action statuses, with the specific reason and forecast confidence in the student review. Coordinators can record an intervention, assign follow-up, and compare revised options. CoE changes are handled in the institution's authoritative process and reflected through a subsequent refresh.

### P2. Intake and subject interest

Configure the eligible audience, intake and opening/closing dates. Publish an institution-approved form or import equivalent responses. Capture intent to attend, ranked subject preferences where collected, requested load and notes. Show responded, opted out and awaiting response separately. Record edits and final submissions by intake and retain source history. Maintain separate totals for expressions of interest, eligible forecast demand and confirmed enrolments. Show ineligible and unscheduled preferences with reasons so coordinators can follow up.

### P2a. Manage intake participation

Give coordinators **Include students** and **Manage intake** actions within their course and intake context. They can enter one or more student IDs and include eligible students who would otherwise fall outside optional-intake participation criteria. When a requested student is missing from the current snapshot, accept a supporting MeshEd workbook and import only requested records. Preserve source file and row evidence. Reject unresolved IDs, ambiguous course attempts, cross-course ID collisions, source-completed students and students whose academic requirements are already verified. Confirmed-source opt-outs retain their intake-specific exclusion.

Manual inclusion is keyed to student, course and intake dates, and repeated inclusion is idempotent. It adds the student to the planning population and then runs the existing eligibility, load, prerequisite, co-requisite and timetable checks. Manual exclusion removes a student from the selected intake's proposals and demand. Keep the record in the student register, show an excluded list and permit Restore before local confirmation. An exclusion takes precedence over a prior manual inclusion. A restored student is assessed against the normal participation rules and any retained inclusion record.

Show **Manually included** and **Excluded from this intake** as participation context in the detail view. Record the actor, time, course, intake and source for changes. Scope imports, participation adjustments and engine actions to the authorised courses. An intake-date change selects a different set of participation records.

### P2b. Review and confirm intake enrolments

Provide a course-level journey from **Manage intake → Review enrolments → Confirm enrolment**. The preview lists each included student with the subjects in the expected scenario, identifies provisional plans, and reports how many students have no recommended subjects. Confirmation captures the displayed students with a non-empty selection. Empty selections remain visible as unresolved planning cases in the target operational experience and do not imply an opt-out.

Record a Course Pilot confirmation snapshot for the course and intake, including the time, enrolled students and selected subjects. Display the resulting list as **Confirmed enrolment** in student records, timetable rosters and study-plan PDFs. Preserve flags, assumptions and the confirmation source. Source-system-confirmed enrolments and Course Pilot-confirmed snapshots have distinct provenance. A Course Pilot confirmation records the coordinator's local decision. External student-system reconciliation requires its own recorded outcome.

After local confirmation, lock include, exclude, restore and repeat-confirm operations for that course and intake. The existing Manage intake confirmation action also rejects courses with confirmed enrolments from the student register. Other courses and future intakes retain their own planning state. A new intake does not inherit a previous intake's lock.

The current confirmation path snapshots the expected scenario and can retain pending-result assumptions. It does not require a saved Approved plan decision. The preview must explain that assumption and keep relevant findings available. The target action-status experience keeps any remaining review under Action needed or Waiting according to ownership. A confirmation record alone cannot resolve an academic or data issue. Subsequent changes to results, rules or timetable require reconciliation against the saved confirmation, with the original confirmation retained in history. The reviewed runtime currently returns its saved snapshot until a separately designed amendment or reconciliation workflow is provided.

### P3. Subject offering decisions

Build a draft offering list from the course catalogue, outstanding requirements, interest and expected and contingency demand. Include outstanding required subjects that currently have no timetable entry, with affected students and deadline impact. Show unique-student counts per offering and avoid adding contingency counts to expected demand. Let coordinators propose, approve, defer or cancel offerings, set capacity and planned groups, and record the reasons for decisions. Changes reopen downstream staffing and timetable checks. A later published timetable is the availability source for official recommendations.

### P4. Lecturer allocation and timetable

Capture lecturer availability, qualifications or approval evidence, and proposed workload by session and subject coordination. Record offered, accepted and locked assignment stages with effective dates in the allocation detail. Draft sessions with date pattern, time zone, delivery mode, campus, group, lecturer and required attendance. Support alternate groups and linked components. Run asynchronous previews on material edits. Show student clashes for confirmed groups or feasible group combinations, plus lecturer double bookings across courses within the institution. Surface conflicts across courses to the affected coordinators with the minimum details needed to coordinate a resolution. Shared teaching sessions use one session identity. Present lecturer availability, unstaffed sessions and confirmed conflicts as reasons within the shared action queue.

Publish one version per timetable scope after the latest validation has completed against the exact draft and current inputs. Block publication on unresolved blocking conflicts, missing locked teaching assignments and stale checks. Institution-authorised exceptions require a named approver, reason and expiry where applicable. Student, lecturer and coordinator views show their applicable published timetable. Revisions create a new draft, show changes and affected people, then publish through the same checks.

#### Timetable student rosters

Make the student demand count on a published subject session selectable. Open a roster within the current course and intake showing student name, ID and recommendation basis. Count each student once per subject. An expected selection takes precedence over a contingency-only selection. Show pending-result assumptions within the expected cohort and show contingency-only students separately. When the course has confirmed intake enrolments, use **Enrolled students** and show the confirmation basis.

The current roster is subject-level across the course. Repeated sessions for that subject can open the same roster. The future delivery model must use actual group enrolments when presenting class attendance or capacity. Keep the roster's population and displayed count aligned, support an empty state, and return keyboard focus to the originating count when the roster closes.

### P5. Completion and graduation handoff

Maintain a current-intake completion queue using Action needed, Waiting and On track, with Completed tasks in history. Show conditional completion, academic verification, academic approval and administrative clearance as evidence-backed milestones inside each candidate record. Show curriculum version, counted credits, outstanding requirements, unresolved evidence and source completion or exit status. Require a named academic approval against the current evidence and re-open the review when material evidence changes. Return students with outstanding requirements to study planning with a reason. Graduation administrators maintain clearance, ceremony cohort and RSVP status, and export authorised rosters. Only cleared candidates enter the final ceremony roster. Hold a cleared roster entry for re-review if its underlying approval becomes stale.

#### Academic completion register and reports

Provide a searchable **Graduation completed** register for students whose academic requirements are independently verified. Support course filtering, name/ID search, View subjects and an individual **Graduation Completion Report** PDF. Include verified candidates with coordinator approval pending, and display the approval milestone explicitly. Admission to this register follows academic eligibility. Ceremony clearance continues through the graduation administration workflow.

The report contains institution and student identity, course, required/completed/outstanding category totals, completed subjects and descriptions, grades, source column provenance, non-counted evidence where applicable, approval or approval-pending wording, source file/row and generation time. Recheck eligibility and workspace scope when generating a report. The student study-plan PDF continues to include confirmed progress and its full eligibility checklist, and identifies confirmed intake selections when present.

### O1. Confirmed enrolment and operational dashboard

Reconcile authoritative enrolments at student-course-intake and student-offering level. Incorporate both confirmed source extracts and Course Pilot confirmation snapshots, retaining their different sources and any reconciliation outcome. Show distinct enrolled student headcount, course headcount and subject registrations as separate measures, with late additions, withdrawals, unassigned groups and unmatched records. A student taking three subjects contributes one to institution intake headcount and three registrations. Provide counts per course, subject and group and a drill-through to the enrolment audit and last refresh. Flag academic and timetable exceptions for correction through the enrolment owner.

### O2. Assessments and extensions

Publish assessment due dates by subject offering and time zone, with an owner and source version. Track submission status and missing data from the institution's learning platform or approved manual records. Show upcoming, submitted, overdue and extended relative to each student's effective deadline. Route submitted extension requests to the designated approver using the shared action statuses. Retain pending, approved, rejected and withdrawn as lifecycle and outcome details. Record original and revised deadlines, approval reason, evidence permissions and student notification status. Recalculate overdue status when a decision changes the effective deadline. A repeated integration delivery must not create duplicate requests or decisions.

### O3. Attendance and intervention

Capture attendance by delivered required session and distinguish present, absent, excused and unrecorded. Apply institution-configured measurement windows, denominator rules, minimum observable sessions and risk thresholds. Show the underlying evidence for red flags and use an explicit insufficient-data state for incomplete coverage. Coordinators assign intervention owners, log contact or follow-up, and close or reopen cases. Corrected attendance recalculates risk and preserves the intervention history.

### O4. Lecturer timesheets and approvals

Lecturers submit work by teaching or subject-coordination assignment and pay period, with activity, date, claimed hours and evidence where required. Validate overlapping claims, duplicate entries and work outside the assignment period. Route submitted items to the responsible coordinator or delegate for approval, rejection or revision. Corrections after approval create an amendment linked to the original. Show outstanding and overdue approvals and export approved records for authorised payroll reconciliation. The approval queue also routes other institution-enabled requests by type and delegated authority.

## 3. Administration and platform rollout

### A0. Source-result recognition and course-scoped refresh

For the current BBIS and MBIS MeshEd mapping, recognise eligible subject entries in **Other** as completed when they contain a supported passing grade, HD, D, C, P or SP, and the subject has no recorded failure. Count a recognised subject once across source columns. Preserve every raw observation and mark that its recognised result came from Other. Malformed entries, unknown subjects, non-passing or unresolved labels and failed conflicts remain available for review. Other courses retain their configured source interpretation. Confirmed academic criteria govern completion, so unrelated unresolved observations do not invalidate already satisfied criteria.

A staged MeshEd acceptance operates on the courses represented by that batch. A coordinator can rerun the engine for one assigned course or all assigned courses. Single-course actions preserve the other courses' data and current reviews, including courses assigned to the same coordinator. Show the selected course scope, run time, duration and counts. Multi-institution rollout makes source-grade mappings versioned institution/course configuration, with the current BBIS/MBIS rule as the initial confirmed mapping.

| Capability | Required behaviour |
| --- | --- |
| A1. Institution onboarding | Create institution with stable ID, name, timezone, campuses and approved access configuration. Set up courses and curriculum versions, intakes, source mappings, policy defaults and users. Validate sample imports, assignment permissions and initial engine outputs in a trial workspace. Activate explicitly. Support suspension and reactivation with retained history. |
| A2. Coordinator lifecycle | Invite and verify users, assign one or more courses, set effective dates, delegate approvals and transfer open work. Display current and historical ownership. Revocation takes effect for sessions, exports and subsequent job actions. Verify equal course codes or student IDs at two institutions remain independent. |
| A3. Data refresh | Support staged file upload and scheduled source synchronisation by institution and dataset. Validate schema, keys, authoritative status semantics and dependencies. Preview added, updated, unchanged, missing and invalid rows. Require explicit handling for full-snapshot removals. Distinguish omitted fields from explicit clearing. Reject stale staged writes and retain source lineage, rejected records and reconciliation counts. |
| A4. Engine operations | Queue affected scopes after accepted material changes to students, curriculum, preferences, enrolments, offerings, timetable or dates. Allow authorised on-demand rerun. Expose queued, running, succeeded, failed and superseded states, impacted counts and run age. Retain the last successful results during failure with a stale indicator. Retry from the same inputs or start a new run with a new snapshot. |
| A5. Governance and reporting | Version effective-dated configuration and engine rules, log approvals and privileged actions, and apply institution-specific retention and export controls. Provide global adoption and data/job health using operational metadata. Route institution exceptions to authorised local owners. |

## 4. Engineering design requirements

- **Action status projection.** Derive one coordinator-facing status per task from findings, ownership, dependencies, evidence freshness and recorded outcomes. Expose task identity, status, plain-language reason, owner, permitted next action, due/follow-up date and evidence basis. Keep engine flags, participation states and domain milestones available in details. Use the same definitions and counts in dashboards, lists, notifications and exports.
- **Participation and confirmation records.** Store intake-scoped inclusions, exclusions and confirmations with institution/course/student references and audit attribution. Preserve confirmed subject selections across reruns. Track reconciliation when newer evidence affects a confirmation. Persist an externally confirmed registration source separately from a local planning decision. Capture zero-selection omissions so closure does not hide outstanding students.
- **Domain model.** Institution → course → curriculum version, with teaching periods and course-intake instances. A person can have multiple student-course enrolments. Course-intake owns offering and enrolment records. An offering owns class groups and their shared or individual sessions, teaching allocations and assessments. Keep attendance, extension decisions, timesheets, plans, completion assessments and approvals independently auditable.
- **Identifiers and access.** Carry institution ID in records, foreign keys, indexes, cache keys, storage partitions, jobs and exports. Use stable source identifiers mapped to canonical IDs. Authorise relationship access by role and effective assignment. Exercise cross-tenant isolation through UI, API, background processing and export tests.
- **Consistency.** Commit each accepted dependency-consistent input snapshot and durably schedule work for it. Use an idempotency key based on institution, intake, calculation purpose, inputs and rule version. Record immutable output evidence. Prevent an older run or draft from replacing a newer authoritative version. Invalidate approvals when their material evidence changes and retain prior decisions for audit.
- **Capacity.** Partition work by institution and intake, batch students, enforce fair concurrency and preserve independent progress if one scope fails. Paginate operational views and generate scoped exports asynchronously. Use incremental projections for dashboards with visible source timestamps. Measure workload using real tenant sizes and peak refresh/publication concurrency before agreeing service objectives.
- **Observability.** Track import delay, input validation failures, queue delay, run duration, stale scopes, conflicts, and approval turnaround. Record correlation IDs and version references. Restrict student data in operational logs and reports.
- **Migration.** Map existing courses, students, coordinator assignments, decisions and timetable versions to the initial institution. Reconcile counts and compare existing engine outputs before switching. Roll out additional institutions after isolation and access revocation checks. Existing source mappings and institution-specific summer policies become versioned configurations with parity fixtures.

## 5. Delivery sequence and acceptance

| Increment | Acceptance scenario |
| --- | --- |
| 1. Institution rollout, data and engine parity | Onboard two institutions with identical external IDs. Users and jobs see only authorised records. Replaying an identical feed creates no duplicate records or automatic work. Out-of-order runs cannot overwrite a newer successful result. |
| 2. Planning and publication | A missing core threatens a student's CoE deadline and appears in the offering and intervention queues. Adding the core to a draft updates preview results. A lecturer booked across two courses and a student with overlapping required sessions each trigger the appropriate conflict. A replacement lecturer and feasible group resolve the conflicts. Official recommendations change after publication. |
| 3. Current intake operations | Three registrations count as one student. An approved extension changes the effective deadline and overdue state. Missing attendance shows insufficient data. A corrected attendance record recalculates risk. A delegated coordinator can approve a valid timesheet within the assignment scope. |
| 4. Completion and ceremony | A student with required marks pending remains conditional. Accepted passing marks enable evidence-backed academic approval. Administrative clearance adds the student to the final roster. A correction affecting counted completion reopens approval and holds roster eligibility. |

### Additional acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-20 | BBIS or MBIS Other contains a recognised eligible passing result | Count the subject once, preserve grade/source evidence and recalculate completion. |
| AC-21 | Other contains an unresolved label, unknown code or a code recorded as failed | Hold that observation for review and exclude it from credit gained through Other. |
| AC-22 | A coordinator includes a valid outstanding student twice | One intake inclusion record, constrained recommendations and stable counts. |
| AC-23 | A supporting workbook contains requested and unrelated students | Import only the requested missing records and preserve unrelated records. |
| AC-24 | A student is excluded then restored before confirmation | Adjust the selected intake's plans/demand, retain source data and reassess normal participation eligibility. |
| AC-25 | A course is confirmed | Snapshot non-empty expected selections, retain assumptions, and lock that course/intake's local participation changes. |
| AC-26 | Another intake is selected | Earlier inclusions, exclusions and confirmation locks do not apply to the new intake. |
| AC-27 | A student occurs in expected and contingency scenarios for a subject | One expected-roster entry, with no duplicate contingency-only entry. |
| AC-28 | A verified academic candidate has no coordinator approval yet | Appear in the academic completion register with approval pending in the report. |
| AC-29 | A BBIS import or selected BBIS rerun occurs under a coordinator responsible for BBIS and MBIS | Preserve MBIS records and reviews. |
| AS-01 | Several findings describe one planning decision | Show one task and one status, with complete evidence inside the item. |
| AS-02 | Marks are pending and a clash can be corrected now | Action needed takes precedence for the planning task. |
| AS-03 | A response is awaited and its follow-up date passes | Move the accountable coordinator's task from Waiting to Action needed. |
| AS-04 | A request or timetable is ready for a coordinator decision | Show Action needed with the review or publication action. |
| AS-05 | An extension is declined and closed | Show Completed in history with Declined as its outcome. |
| AS-06 | Material evidence changes after a task completes | Reopen the affected review with current evidence and preserve earlier decisions. |
| AS-07 | A confirmation exists with unresolved provisional conditions | Keep the remaining review actionable or waiting until its evidence resolves. |

## 6. Evidence and implementation boundaries

Reviewed the runtime checkout at `sites/coursepilot-runtime/.sites-checkout`, commit `f88e586`, against the earlier `f5217af` baseline and the existing requirements. The older `sites/coursepilot` checkout contains the earlier baseline. Dates below identify the reviewed feature additions.

| Addition | Evidence | Product coverage |
| --- | --- | --- |
| Passing Other results for BBIS/MBIS, 14 November | `lib/coursepilot/imports.mjs`, `tests/workflows.test.mjs` | A0 and engine source-result rules |
| Course-specific imports and reruns, 14 November | `lib/coursepilot/coordinators.mjs`, `tests/coordinators.test.mjs` | A0 and scoped review preservation |
| Academic completion register/PDF, 14 November | `public/app.js`, `lib/coursepilot/pdf.mjs`, `app/api/[...path]/route.ts` | P5 |
| Manual intake inclusion, 14 November | `lib/coursepilot/planning-inclusions.mjs`, `intake.mjs`, `optional-plans.mjs` | P2a |
| Timetable roster drill-down, 16 November | `public/app.js`, `lib/coursepilot/demand.mjs` | P4 |
| Exclusion, restore and confirmation, 16 November | `lib/coursepilot/intake-confirmation.mjs`, `optional-plans.mjs`, `tests/coordinators.test.mjs` | P2a and P2b |

The active UI still exposes detailed review labels. The agreed simplified statuses and midnight/indigo design are target requirements. Multi-institution authentication, active-intake assessment/attendance/timesheet workflows, future completion forecasting, lecturer-wide clash checks, and ceremony clearance remain design and delivery work described by this specification.

The current local confirmation path freezes the expected selection, has no reopen/amend action, and uses a source-specific enrolment summary for imported confirmed records. The target dashboard must reconcile both confirmation sources, keep omitted zero-selection students visible and raise review when new evidence affects frozen selections. These are explicit implementation gaps for engineering design.

Before implementation, confirm institution-specific source mappings and cadence, forecast horizon and future-offering confidence, which conflicts permit authorised exceptions, attendance calculation and thresholds, extension and timesheet delegation, and administrative clearance fields. Measure adoption by active institutions and coordinators, and operational performance by intake readiness, early identification of deadline risks, unresolved publication conflicts, approval turnaround and graduation reconciliation.
