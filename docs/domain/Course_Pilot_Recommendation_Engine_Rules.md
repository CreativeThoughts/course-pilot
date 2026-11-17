# Course Pilot recommendation engine rules

**Version 2.2 · 16 November 2026**

This document uses the application modules in `sites/coursepilot-runtime/.sites-checkout/lib/coursepilot/`, reviewed at commit `f88e586` on 16 November 2026, as the current behavioural reference. The older `sites/coursepilot` checkout contains an earlier baseline. Sections 1–5 describe implemented behaviour, including the 14–16 November additions. Sections 6–7 specify the target enhancements and simplified coordinator action statuses. The [product specification](Course_Pilot_Product_Features_v2.md) defines workflow and ownership. Source references below are relative to the reviewed runtime checkout.

## 1. Accepted inputs and scope

| Input | Current behaviour |
| --- | --- |
| Planning population | Apply course-specific snapshot scope when configured. Normally exclude source states outside `not_complete`. Completion-review returns can re-enter the planning pool. Intake-specific inclusion, exclusion and local confirmation are applied as described in section 5. |
| Academic evidence | Normalise comma-separated subject codes to uppercase distinct sorted values in the planning engine. Keep completed, failed and genuinely pending results distinct. Count only codes in the applicable core and elective lists. Raise data review for conflicting statuses, provisional requirements, student data issues or missing period end. |
| Course configuration | Core and elective lists and required counts, core mode, prerequisites, co-requisites and co-requisite policy. For graduation, also support the all-subjects completion model. |
| Student dates | Use accepted CoE end and expected completion dates as distinct values. |
| Availability | The active published timetable supplies the sessions used by the official engine. Scope sessions to the relevant course. Group sessions by subject and class group, defaulting to group A. |
| Preferences and confirmed enrolment | Source mappings determine semantics. MeshEd `Subject Enrolled` is normally mapped to preference by the interest migration. In confirmed intake imports, explicitly tagged values apply to the matching start/end intake and represent actual enrolment. Do not infer status from the column label. |
| Period policy | Optional intake participation and optional summer study are separate switches. Configured future periods inform summer load guidance. |

References: `engine.mjs`, `optional-plans.mjs`, `interest-rule.mjs`, `intake.mjs`, `enrolment-audit.mjs`, `timetable.mjs`.

### Source-result rule for MeshEd Other

The current mapper applies an explicit passing-result rule to BBIS and MBIS. Other courses keep their existing review-only interpretation of the Other column.

1. Parse each comma-separated observation using a single subject-code and parenthesised-grade format, such as `BIS5201(C)`. Normalise the parsed code and grade for matching.
2. Recognise HD, D, C, P and SP as supported passing grades for this mapping. Require the code to belong to the applicable core or elective catalogue and to be absent from the recorded failed set.
3. Add recognised results to the distinct completed-subject set. Multiple observations of the same subject and appearances in both Subject Completed and Other contribute one completion. Retain all original grade observations.
4. Set recognised observations to completed with `source_column=Other`. Keep the original source fields, raw text, file and row. The completion report can identify MeshEd Other as the source of the grade.
5. Hold malformed, unrecognised, unresolved or failed-conflicting observations as data issues. An Enrolled label in Other creates no pending-result assumption or completed credit. Unknown course codes receive no category credit.
6. Recalculate academic criteria after accepted imports. Unrelated residual observations remain visible while confirmed satisfied course requirements can still establish academic readiness. A result required for those criteria must have valid counted evidence.

This supersedes the blanket treatment of every Other entry as uncounted for BBIS and MBIS. Multi-institution configuration of this source-specific rule is a target capability. References are `imports.mjs`, `completion.mjs`, `pdf.mjs` and `tests/workflows.test.mjs`.

## 2. Current study plan decision sequence

1. Compare confirmed completed cores and electives separately against the configured counts. Flag counts above their category requirement. Excess credits do not satisfy the other category. Where source statuses conflict, the planner flags the record and may still count a recorded completion. Graduation excludes conflicting evidence from counted completions.
2. Build an **Expected** scenario assuming all pending results pass. Include pass/fail contingencies. Up to five pending subjects, generate all combinations. Above five, generate only all-pass and all-fail and mark coverage bounded. Pending scenarios are provisional. A failed or assumed-failed core can be selected again when eligible and offered. An elective requirement can be fulfilled by another eligible elective.
3. Compute remaining counts per category. Return zero selected subjects and `COURSE_COMPLETE` if both counts are met in the scenario. For a mandatory core course, the output also tracks outstanding core codes absent from the timetable. The planner determines remaining counts from configured totals. Mandatory-list integrity is explicitly checked in the completion assessment.
4. Build candidates from outstanding categories, remove completed or assumed-passed subjects, and intersect with published availability. Check all structured or parsed prerequisite codes and any recognised minimum completed-subject count. For the latter, count completed or assumed-passed recognised course subjects. A co-requisite must be selected in the same plan when policy is `same_intake`. The default policy also accepts prior completion. A same-intake requirement can therefore need review even if the paired subject has already been passed.
5. Evaluate combinations from zero up to the effective load limit. Enforce remaining category counts and select one group per subject, treating all group rows as required. Reject combinations with overlapping sessions. Same-day sessions overlap when each starts before the other ends. Adjacent times are allowed. The existing check compares weekday and time.
6. Rank feasible combinations lexicographically by subject count, then number of matched interests when present, then core count, then core repeats. Ties retain the first candidate in the engine’s deterministic traversal: sorted subject codes and group order from the timetable rows. Interests do not waive constraints. Return selected subjects, session rows, reasons, selected and excluded interests with reasons, and additional subjects where interest reporting applies.
7. Return decision flags, remaining core/elective counts, target, shortfall, optional study guidance and a lower bound of ceiling(remaining subjects ÷ 4) semesters. Keep scenarios independently reviewable. Do not combine them into a single enrolment instruction.

### Participation and study-load policy

| Rule | Current behaviour |
| --- | --- |
| Standard participation | Include in-scope planning students for a standard semester. |
| Optional intake participation | Include a student with explicit intake interest or subject interest, or a student with one to four subjects remaining in the expected scenario and a CoE or expected completion date on or before intake start plus three calendar months. End-of-month cutoff dates are clamped. A matching confirmed record overrides this filter. Confirmed empty subject lists represent opt-out in the current flow. |
| Standard cap | Four subjects, reduced by a recorded requested intake load where applicable. |
| Optional summer | Applies only when enabled and the student’s CoE ends after the intake end. Use a three-subject cap when at least two distinct valid future periods start after the intake end and finish by the CoE date. Otherwise use the standard cap. Then apply the requested load. Future period counts do not demonstrate subject availability or feasibility. |
| Final-semester review | Flag one to three remaining subjects for `FINAL_SEMESTER_APPROVAL` under standard policy. Optional summer suppresses this flag and the standard underload and missing-offering alerts. |

### Flags and completion dates

| Condition | Result |
| --- | --- |
| Pending results | `PENDING_RESULTS` and `MARKS_AWAITING`. |
| Inputs or conflicting results need review | `DATA_REVIEW_REQUIRED`. |
| More completed subjects than required in either category | `EXCESS_CORE_COMPLETED` and/or `EXCESS_ELECTIVES_COMPLETED`. |
| Target cannot be filled under standard policy | `UNDERLOAD_REVIEW`. Add `REQUIRED_CORE_NOT_OFFERED`, `INSUFFICIENT_CORE_OPTIONS_OFFERED` or `INSUFFICIENT_ELECTIVES_OFFERED` where the relevant offering shortfall contributes to the under-target result. Missing mandatory codes can appear in the output even when the flag is absent. |
| Clash encountered while evaluating candidates and target missed | `TIMETABLE_CLASH`. This flag is a planning signal and can coexist with other reasons for shortfall. |
| Same-intake co-requisite cannot be accommodated in an under-target plan | `COREQUISITE_REVIEW` when the current engine detects an available candidate with a required co-requisite outside the selected set. |
| Interest excluded for an actionable reason | `ENROLMENT_INTEREST_REVIEW`. Exclusions solely because of completion, assumed pass or satisfied category do not trigger this flag. |
| Student has remaining requirements and a date precedes the intake end | `COE_REVIEW_REQUIRED` for the CoE and `COMPLETION_DATE_AT_RISK` for expected completion. Equality passes this date check. Missing dates require data review. |
| Requirements remain beyond the selected subjects | `COMPLETION_ESTIMATE_UNCERTAIN`. The current engine does not schedule an evidenced multi-intake pathway. |
| Optional summer applies | `OPTIONAL_SUMMER_STUDY`. Add `SUMMER_THREE_SUBJECT_LIMIT` when at least two valid future periods fit and the effective cap is exactly three. |

## 3. Confirmed enrolment audit

- Preserve confirmed subjects from the matching intake record. Audit unknown, already completed and unpublished subjects, prerequisite counts and codes, same-intake co-requisite gaps, cross-subject session overlaps and excess load against the applicable three/four cap.
- The confirmed audit currently checks co-requisites for concurrent enrolment and records whether an absent co-requisite was previously completed. Its clash evaluation compares rows across subjects and does not resolve alternative groups. Treat multi-group results as review evidence pending actual group validation.
- Return actual enrolment, audit findings and suggested revisions where academic issues are found. Project remaining requirements if applicable confirmed subjects pass. Keep recorded passes as the basis for confirmed credit.
- Roll up enrolment by distinct student and subject registration. The current summer summary reports enrolled and opted-out counts. A future operational summary also reconciles withdrawals, sections and source completeness.

Reference: `enrolment-audit.mjs`.

### Course Pilot intake confirmation

A local confirmation is a course-and-intake snapshot created by `planning/confirm`. It captures each included student's first, expected scenario where at least one subject is selected. Excluded students and empty selections are absent from the saved enrolment list. Confirmation fails when the course/intake is already locally confirmed, when any matching source-confirmed student exists for that course/intake, or when no non-empty selection is available.

The saved plan has one scenario labelled Confirmed intake enrolment and retains its selected subjects, sessions, flags and provisional assumptions. The confirmation action does not require a previously saved Approved plan decision and does not run the source-enrolment audit on the frozen selection. The UI warns when any selected plan assumes pending results pass. A saved selection creates no completed credit and performs no external student-system write.

`intakePlans` returns the stored snapshots for locally confirmed courses in the matching intake, replacing their live proposals. Subsequent reruns can reset scoped review decisions but do not reconstruct those confirmed selections. There is currently no reopen/amend operation. This behaviour requires explicit reconciliation design when newer results, rules or published sessions affect a confirmation.

Confirmation records include course, intake, time and saved plans. The audit records student subject selections and receives institution/coordinator attribution through the scoped action. The state response exposes confirmation metadata and a student count. Study-plan PDFs recognise confirmed selections and remain downloadable when a local confirmation has no source-enrolment audit object.

References are `intake-confirmation.mjs`, `optional-plans.mjs`, `coordinators.mjs`, `pdf.mjs` and `tests/coordinators.test.mjs`.

## 4. Academic completion and graduation

1. Recalculate independently from confirmed results. Exclude completed codes with conflicting failed or pending statuses, and count eligible subjects against course thresholds. Show unknown subjects as evidence outside the counted totals.
2. For mandatory mode require every core. For core pool mode apply the configured count. For all-subjects mode require every configured core and validate that the elective list is empty. Invalid or provisional course configuration blocks readiness. The assessment raises warnings for pending and other data issues and calculates readiness from outstanding requirements and configuration issues. A pending mark required to meet the completion threshold keeps the candidate conditional. In the target workflow, evidence issues material to the award must be resolved before approval.
3. Surface independent readiness, conditional completion, or source-recorded completion that needs verification. A source completed status brings the candidate into review. An approval requires current readiness, reviewer and rationale and is tied to the completion evidence basis. A non-ready candidate can be returned to study planning. If requirements are met but evidence needs review, block approval of further enrolment until resolved.
4. The application provides academic review, a searchable Graduation completed register and individual Graduation Completion Report PDFs. The register includes every in-scope academically ready candidate, including those awaiting coordinator approval. Reports show category totals, counted and non-counted subjects, grades and source-column provenance, source file/row, generation time and approval or approval-pending wording. The server requires current academic readiness and workspace access before generation. Administrative clearance, ceremony roster eligibility and associated lifecycle belong to the target graduation workflow.

References: `completion.mjs`, `graduation.mjs`, `study-eligibility.mjs`, `optional-plans.mjs`, `actions.mjs`.

## 5. Current execution and versioning

- Accepted student, course or preference material changes can snapshot earlier plans and reset decisions. Session import creates a timetable draft. Publishing a changed timetable activates its sessions, archives the previous version and resets affected workspace decisions under the current action. A stale draft must be recreated from its base.
- The manual engine action computes scoped plans, records a run with timings and counts, archives the prior review context and resets current scoped plan decisions and completion approvals. The next iteration replaces this broad reset policy with invalidation against each approval's material evidence.
- The application derives expected demand from the first scenario and counts unique students, including a provisional subset and separate contingency-only demand. The current demand list is based on published subjects. Timetable counts open a subject-level roster with the same population. Expected selection takes precedence over contingency-only selection for the same student. Labels reflect whether the course has a confirmed intake. A subject roster can cover multiple timetable sessions and does not establish a student's assigned class group.
- A MeshEd batch acceptance narrows the action to the batch's course scope. A manual rerun can target one assigned course or all assigned courses. Single-course acceptance/rerun preserves other courses' current decisions, including those held by the same coordinator. Scoped reruns archive/reset reviews within their selected scope and persist `course_ids` with run attribution. Attempts to target another coordinator's course are rejected.

References: `actions.mjs`, `coordinators.mjs`, `demand.mjs`, `timetable.mjs`.

### Manual participation and selection precedence

| Operation | Implemented rule |
| --- | --- |
| Include | Require a non-empty distinct list of student IDs. Resolve current snapshot students first. For missing IDs, parse only requested rows from the supplied MeshEd workbook. Reject missing records, duplicate requested attempts and cross-course ID collisions. |
| Inclusion eligibility | Require source completion state `not_complete` and academic readiness false. Reject confirmed-source opt-outs and courses already locally confirmed. Normal academic constraints still apply to any generated recommendations. |
| Persist inclusion | Record student, course, intake date key and time. Add requested imported students to the course planning scope. A repeated inclusion creates no duplicate record. Preserve source records for existing students. |
| Exclude | Require a course in the authorised workspace and IDs present in its current intake plan list. Store intake-specific exclusions, which remove those students from proposals and demand while retaining their register data. |
| Restore | Require IDs present in that course/intake's exclusion list. Remove those exclusions, then recalculate eligibility from the current population, participation rules and any manual inclusions. |
| Confirmed-source precedence | An intake-matching source-confirmed record controls participation through its enrolled subject list. An empty list retains the source opt-out. Manual inclusion does not override that opt-out. |
| Proposal precedence | Start with scoped students and completion-review returns. Apply confirmed-source participation or manual inclusion or normal intake eligibility. Apply explicit intake exclusions after generating the proposal population. |
| Local confirmation precedence | For each locally confirmed course in the active intake, return its stored plans in place of live proposals. Lock further local inclusion and Manage intake exclude/restore/confirm operations for that course/intake. |
| Intake boundary | Match using the configured start/end date pair. Participation changes and confirmation locks apply only to their recorded intake. |

Manual inclusion can bypass optional participation filtering for an eligible student. It grants no prerequisite, load, offering or academic-completion exception. A source-completed student needing reassessment uses the existing graduation return workflow.

The UI's Include students flow imports requested missing records directly through its action, while the standard bulk MeshEd feed uses staging and acceptance. Describe these as separate entry points. References are `planning-inclusions.mjs`, `intake.mjs`, `optional-plans.mjs`, `intake-confirmation.mjs` and `coordinators.mjs`.

## 6. Proposed Phase 2 rules and contracts

| ID | Design requirement |
| --- | --- |
| E1 · CoE completion forecasting | Use CoE end as the primary risk deadline, alongside an independently displayed institutional target. Schedule outstanding curriculum requirements across confirmed or explicitly provisional future offerings with dates, period caps, prerequisite order, co-requisites and feasible groups. Dates equal to the CoE end are within the deadline. Retain **feasible**, **at risk** when available evidence or a hard lower bound rules out completion, **indeterminate** when necessary data is unavailable or search is bounded, and **date missing** when there is no authoritative CoE as forecast evidence inside the student review. Derive the action status under section 7. Show forecast confidence, first blocker, assumptions and impacted subjects. Do not turn tentative catalogues into confirmed offerings. |
| E2 · Draft simulation | Start previews on material draft, offering or allocation edits. Bind previews to institution, course-intake, draft revision and immutable input snapshot. Label scenarios and show changes from the published baseline. A preview can identify blocked students and offering demand before publication. It does not become the official engine result until the associated timetable is published and the official run succeeds. |
| E3 · Student clash checks | For confirmed registrations, validate their assigned groups and compulsory sessions. Where group assignment is missing, return group evidence required or a feasible allocation outcome. For proposals, require at least one compatible combination under course and schedule constraints. Compare actual overlapping teaching dates, time zones, and intervals. Retain adjacency unless an institution-configured travel buffer applies. |
| E4 · Lecturer clash checks | Compare locked teaching allocations by institution-scoped lecturer identity against overlapping dated sessions across all courses, including sessions outside the editing coordinator’s assignments. Treat a shared session ID as one booking. Return both session references, overlap interval and affected owners. Record any authorised exception against that exact clash evidence. |
| E5 · Refresh and replay | Kick off affected checks after accepted semantic changes. Include previously blocked students when a new offering or timetable group could unblock them. Skip identical automatic reruns. Use immutable scoped input versions and record the triggered source, rule version, purpose, run state and outcome. Retry idempotently and prevent stale results from becoming current. |
| E6 · Output and approvals | Return stable student-course-intake, scenario and run IDs, recommendations, exclusions, session evidence, risk category, reasons, assumptions and dependency versions. Use stable review identifiers tied to material evidence, preserve earlier approvals in history, and reopen affected approvals only. Route exceptions to assigned owners. Official plans provide advice and audit findings, with enrolment, CoE and award changes governed by the institution. |
| E7 · Policy and parity | Version source mappings and effective-dated institution/course policies. Preserve existing decisions through migration where material evidence matches. Compare representative historic regular, optional summer, same-intake co-requisite, pending-result and confirmed-enrolment cases before rollout. Approve and document any material change in outcomes. |

### Confirmation reconciliation requirement

Preserve the captured local confirmation when accepted evidence changes. Compare that snapshot against current academic and timetable evidence, identify affected students and create the relevant review. Maintain a versioned amendment history when an authorised correction workflow is introduced. Keep zero-selection omissions visible for follow-up and combine source-confirmed and locally confirmed populations with explicit provenance in operational reporting. The current source-enrolment summary only aggregates matching imported confirmed records, so local snapshots need an additional reporting integration.

### Regression and design acceptance examples

| Case | Expected |
| --- | --- |
| Requested load two with four eligible offerings | Recommend up to two under the existing cap rule. |
| Optional summer with CoE covering exactly two configured future period ends | Cap at three before applying any lower requested load. |
| Six pending subjects | Produce all-pass and all-fail scenarios and a bounded indicator. |
| One subject remains in a standard semester | Recommend it if eligible and offered, and request final-semester review. |
| Draft offers the last required core but published timetable does not | Draft preview can select it. Official plan reflects published availability. |
| Future offering coverage is missing and no hard bound rules out completion | Forecast is indeterminate. |
| Required class overlaps for an assigned group and an alternate group is feasible | Report the enrolment clash with the assigned group, and present the alternate as a revision. |
| One lecturer is allocated to two different required sessions that overlap across courses | Raise the conflict across the institution and block publication under the default conflict policy. |
| A completed subject is also marked failed | Flag conflicting planning evidence and exclude the subject from graduation credit until reconciled. |
| Two runs finish out of order | Only the newest eligible snapshot can become current. |

Confirm with pilot institutions how to model prerequisites that require a grade or alternative subjects, accepted equivalences, credit transfers, future offering confidence, delivery-week calendars, and travel buffers before adding those capabilities. Treat each as an explicit versioned rule when adopted.


## 7. Simplified coordinator action status contract

Use **Action needed**, **Waiting** and **On track** in active coordinator views, with **Completed** in history. Calculate status per task and viewing role using its findings, current evidence, owner, dependency and recorded outcome. Each row contains one status, one plain-language reason and one primary permitted action. Engine flags and forecast classifications remain accessible in the detail view.

### Mapping findings to work

| Finding or condition | Task interpretation |
| --- | --- |
| COE_REVIEW_REQUIRED or COMPLETION_DATE_AT_RISK | Action needed to assess a pathway or follow up. Once a required external response is assigned and pending, the task can become Waiting. |
| DATA_REVIEW_REQUIRED, excess category counts, invalid course configuration or completion evidence review | Action needed for the authorised correction/review owner. Show Waiting to a coordinator whose next step depends on that owner. Group findings that share one decision. |
| Missing required offering, insufficient options, underload, prerequisite/co-requisite review or timetable clash | Action needed when the coordinator can review an offering, plan, allocation or exception. A submitted request awaiting an owner is Waiting until a follow-up becomes due. |
| FINAL_SEMESTER_APPROVAL or an actionable enrolment-interest exclusion | Action needed with Review study load or Review subject choice. |
| PENDING_RESULTS or MARKS_AWAITING | Waiting when results are necessary for the current decision and no other action is available. Expected future results can remain contextual evidence for a task that otherwise needs no action. |
| COMPLETION_ESTIMATE_UNCERTAIN | Record the forecast limitation. Create Action needed only when the current decision requires follow-up or missing future data. An identified pending dependency is Waiting. The flag alone does not create a repeated review for every continuing student. |
| OPTIONAL_SUMMER_STUDY or SUMMER_THREE_SUBJECT_LIMIT | Policy context. Derive action status from actual unmet constraints or required decisions. |
| CONFIRMED_ENROLMENT or a local confirmation snapshot | Record enrolment provenance and lifecycle. Unresolved findings, provisional assumptions or later material changes can still require Action needed or Waiting. |
| COURSE_COMPLETE or independent academic readiness | Action needed if academic approval is assigned and pending. Resolve required-result dependencies before confirming academic readiness. A completed academic review task can coexist with an administrative clearance task in Waiting. |
| Clean, current assessment with no required decision or blocking dependency | On track. Preserve assessment date and assumptions. |
| Recorded decision or evidence-verified task resolution | Completed with its explicit outcome and audit evidence. |

### Deterministic transitions and counts

1. Identify the task by institution, course/intake, subject of the decision and workflow purpose. Deduplicate multiple flags and scenarios describing that decision. Keep independent requests as separate tasks and link common causes.
2. Preserve Completed only while its resolution basis remains valid. Reopen on a material change. A mere informational or repeated identical input creates no new task or review reset.
3. For open work, choose Action needed if the coordinator can perform a required decision, correction or due follow-up now. This takes precedence over an unrelated waiting dependency on the same task. Next choose Waiting for an identified prerequisite with an owner/source and expected update or follow-up date. Otherwise use On track when required checks are current.
4. A passed check leading to approval, confirmation or publication creates Action needed for that decision. Completed applies after the action or verified resolution. A declined request is Completed with a Declined outcome, while any required revision is a linked open task.
5. Route failed or stale checks to an authorised recovery owner. Show Waiting with a linked dependency to others awaiting the result. Stale evidence cannot establish a current On track assessment.
6. Count unique tasks under one action status. Label distinct-student counts separately. Summaries, exports and notifications use the same projection. Prioritise urgent and overdue work, then relevant deadline and oldest open work, while retaining the four status labels.
7. Use stable status keys `action_needed`, `waiting`, `on_track` and `completed`. Return the human-readable reason, raw supporting flags, evidence versions, owner, next permitted action, dates and linked tasks. A status change grants no permission and cannot waive academic rules.

### Additional regression examples

| Case | Expected |
| --- | --- |
| A BBIS/MBIS recognised passing Other result appears twice | One counted completion with both observations retained. |
| An Other passing entry conflicts with the failed set | No completion credited through Other and a review observation recorded. |
| A manually included student is excluded from the same intake | Exclusion wins until restored. |
| Confirmation captures a provisional expected scenario | Preserve its assumption and flag, and keep any dependent review Waiting or Action needed. |
| A new result arrives after local confirmation | Current runtime retains the frozen selection. The target reconciliation creates a review linked to that snapshot. |
| Expected and contingency scenarios select the same subject for one student | One expected roster entry. |
| A needed response misses its follow-up date | The accountable coordinator receives Action needed. |
| A timetable is ready for publication | Action needed offers Review and publish. |
| A course-level rerun occurs for BBIS | Preserve MBIS reviews and identify BBIS in run metadata. |

The simplified status projection is a documented target. The reviewed runtime still renders individual flag and decision labels. No application implementation is implied by this documentation revision.
