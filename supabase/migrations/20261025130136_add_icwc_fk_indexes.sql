create index icwc_teams_activity_teacher_idx
  on public.icwc_teams (activity_id, teacher_id);

create index icwc_team_members_team_teacher_activity_idx
  on public.icwc_team_members (team_id, teacher_id, activity_id);

create index icwc_team_members_student_teacher_idx
  on public.icwc_team_members (student_id, teacher_id);

create index icwc_student_submissions_member_idx
  on public.icwc_student_submissions (
    team_id,
    student_id,
    teacher_id,
    activity_id
  );

create index icwc_student_reviews_submission_identity_idx
  on public.icwc_student_reviews (
    submission_id,
    teacher_id,
    student_id,
    team_id,
    activity_id
  );

create index icwc_draft_history_review_teacher_idx
  on public.icwc_draft_history (review_id, teacher_id);

create index icwc_final_records_review_identity_idx
  on public.icwc_final_records (
    review_id,
    teacher_id,
    student_id,
    activity_id
  );
