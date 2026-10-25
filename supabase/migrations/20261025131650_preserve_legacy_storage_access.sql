drop policy if exists student_reports_storage_select_authorized on storage.objects;
drop policy if exists student_reports_storage_update_authorized on storage.objects;
drop policy if exists student_reports_storage_delete_authorized on storage.objects;

create policy student_reports_storage_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
      )
    )
  )
);

create policy student_reports_storage_update_authorized
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
)
with check (
  bucket_id = 'student-reports'
  and (
    (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
);

create policy student_reports_storage_delete_authorized
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
);
