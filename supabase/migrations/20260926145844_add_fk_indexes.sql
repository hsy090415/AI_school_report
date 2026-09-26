create index activity_records_activity_teacher_idx
  on public.activity_records (activity_id, teacher_id);

create index activity_records_student_teacher_idx
  on public.activity_records (student_id, teacher_id);

create index student_reports_activity_teacher_idx
  on public.student_reports (activity_id, teacher_id);

create index student_reports_student_teacher_idx
  on public.student_reports (student_id, teacher_id);
