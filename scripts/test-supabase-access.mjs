import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 필요합니다.",
  );
}

// 앱의 네 활동 계약을 원격 DB에 넣는 통합 테스트 fixture다.
const activityDefinitions = [
  {
    code: "AUTONOMOUS_ONE_TOPIC",
    category: "AUTONOMOUS",
    title: "1인 1주제 융합활동",
    description: "교과 융합 주제 탐구",
  },
  {
    code: "AUTONOMOUS_ICAN_WECAN",
    category: "AUTONOMOUS",
    title: "I can we can",
    description: "개인과 공동체 실천 활동",
  },
  {
    code: "CAREER_DNA",
    category: "CAREER",
    title: "DNA",
    description: "진로 탐색 활동",
  },
  {
    code: "CAREER_CURRICULUM_CREATIVE",
    category: "CAREER",
    title: "교과창체",
    description: "교과 연계 창의적 체험활동",
  },
];

const analysis = {
  topic: "가상 진로 탐구",
  studentActions: [
    {
      action: "자료를 비교함",
      evidence: "가상 보고서의 두 자료를 표로 비교함",
    },
  ],
  knowledge: ["자료 비교 기준"],
  skills: [
    {
      name: "분석",
      evidence: "차이점을 기준별로 정리함",
    },
  ],
  notablePoints: ["가상 데이터만 사용한 통합 테스트"],
};

const runId =
  process.env.SUPABASE_TEST_RUN_ID ??
  `${Date.now()}-${randomBytes(4).toString("hex")}`;
const password =
  process.env.SUPABASE_TEST_PASSWORD ??
  `Codex-Rls-${randomBytes(12).toString("base64url")}Aa1!`;
const teacherAEmail = `codex.rls.a.${runId}@gmail.com`;
const teacherBEmail = `codex.rls.b.${runId}@gmail.com`;

function makeClient() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectNoError(error, operation) {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

function expectBlocked(error, data, operation) {
  const returnedRows = Array.isArray(data) ? data.length : data ? 1 : 0;
  assert(
    Boolean(error) || returnedRows === 0,
    `${operation}: 차단되어야 하지만 데이터가 반환됐습니다.`,
  );
}

async function ensureTeacherProfile(client, userId, email, name) {
  const { data: existing, error: selectError } = await client
    .from("teachers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  expectNoError(selectError, `${name} 교사 프로필 확인`);

  const query = existing
    ? client.from("teachers").update({ name, email }).eq("id", userId)
    : client.from("teachers").insert({ id: userId, name, email });
  const { error } = await query;
  expectNoError(error, `${name} 교사 프로필 저장`);
}

async function createAuthenticatedTeacher(client, email, name) {
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });

  if (signInData.user && signInData.session) {
    const userId = signInData.user.id;
    await ensureTeacherProfile(client, userId, email, name);
    return userId;
  }

  if (signInError?.message.toLowerCase().includes("not confirmed")) {
    throw new Error(`PENDING_EMAIL_CONFIRMATION=${email}`);
  }

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
  });
  expectNoError(signUpError, `${name} 회원가입`);
  assert(signUpData.user, `${name} Auth 사용자를 만들지 못했습니다.`);

  if (!signUpData.session) {
    throw new Error(`PENDING_EMAIL_CONFIRMATION=${email}`);
  }

  const userId = signUpData.user.id;
  await ensureTeacherProfile(client, userId, email, name);
  return userId;
}

async function cleanup(client, teacherId) {
  if (!teacherId) return;
  await client.from("activity_records").delete().eq("teacher_id", teacherId);
  await client.from("student_reports").delete().eq("teacher_id", teacherId);
  await client.from("students").delete().eq("teacher_id", teacherId);
  await client.from("activities").delete().eq("teacher_id", teacherId);
  await client.from("teachers").delete().eq("id", teacherId);
  await client.auth.signOut();
}

const clientA = makeClient();
const clientB = makeClient();
const anonymousClient = makeClient();
let teacherAId;
let teacherBId;
let reportPath;
const results = [];

try {
  teacherAId = await createAuthenticatedTeacher(
    clientA,
    teacherAEmail,
    "가상 교사 A",
  );
  teacherBId = await createAuthenticatedTeacher(
    clientB,
    teacherBEmail,
    "가상 교사 B",
  );

  const { data: activitiesA, error: activitiesAError } = await clientA
    .from("activities")
    .insert(
      activityDefinitions.map((definition) => ({
        teacher_id: teacherAId,
        ...definition,
      })),
    )
    .select("*");
  expectNoError(activitiesAError, "A 활동 4개 생성");

  const { data: activitiesB, error: activitiesBError } = await clientB
    .from("activities")
    .insert(
      activityDefinitions.map((definition) => ({
        teacher_id: teacherBId,
        ...definition,
      })),
    )
    .select("*");
  expectNoError(activitiesBError, "B 활동 4개 생성");
  assert(activitiesA?.length === 4 && activitiesB?.length === 4, "활동 생성 수 불일치");

  const { data: studentsA, error: studentsAError } = await clientA
    .from("students")
    .insert([
      { teacher_id: teacherAId, name: "가상 학생 A1", grade: 1, class_no: 1, student_no: 1 },
      { teacher_id: teacherAId, name: "가상 학생 A2", grade: 1, class_no: 1, student_no: 2 },
      { teacher_id: teacherAId, name: "가상 학생 A3", grade: 1, class_no: 1, student_no: 3 },
    ])
    .select("*");
  expectNoError(studentsAError, "A 학생 3명 생성");

  const { data: studentsB, error: studentsBError } = await clientB
    .from("students")
    .insert([
      { teacher_id: teacherBId, name: "가상 학생 B1", grade: 2, class_no: 2, student_no: 1 },
      { teacher_id: teacherBId, name: "가상 학생 B2", grade: 2, class_no: 2, student_no: 2 },
    ])
    .select("*");
  expectNoError(studentsBError, "B 학생 2명 생성");
  assert(studentsA?.length === 3 && studentsB?.length === 2, "학생 생성 수 불일치");

  const studentA1 = studentsA[0];
  const studentA2 = studentsA[1];
  const studentB1 = studentsB[0];
  const activityA1 = activitiesA[0];
  const activityA2 = activitiesA[1];
  const activityB1 = activitiesB[0];

  const { data: reportsA, error: reportsAError } = await clientA
    .from("student_reports")
    .insert([
      {
        teacher_id: teacherAId,
        student_id: studentA1.id,
        activity_id: activityA1.id,
        report_text: "가상 보고서 A1",
      },
      {
        teacher_id: teacherAId,
        student_id: studentA2.id,
        activity_id: activityA2.id,
        report_text: "가상 보고서 A2",
      },
    ])
    .select("*");
  expectNoError(reportsAError, "A 보고서 2개 생성");

  const { data: reportsB, error: reportsBError } = await clientB
    .from("student_reports")
    .insert({
      teacher_id: teacherBId,
      student_id: studentB1.id,
      activity_id: activityB1.id,
      report_text: "가상 보고서 B1",
    })
    .select("*");
  expectNoError(reportsBError, "B 보고서 생성");

  const { data: recordsA, error: recordsAError } = await clientA
    .from("activity_records")
    .insert([
      {
        teacher_id: teacherAId,
        student_id: studentA1.id,
        activity_id: activityA1.id,
        analysis_json: analysis,
        ai_draft: "AI 최초 초안 A1",
        final_text: null,
      },
      {
        teacher_id: teacherAId,
        student_id: studentA2.id,
        activity_id: activityA2.id,
        analysis_json: analysis,
        ai_draft: "AI 최초 초안 A2",
        final_text: null,
      },
    ])
    .select("*");
  expectNoError(recordsAError, "A 활동 기록 2개 생성");

  const { data: recordsB, error: recordsBError } = await clientB
    .from("activity_records")
    .insert({
      teacher_id: teacherBId,
      student_id: studentB1.id,
      activity_id: activityB1.id,
      analysis_json: analysis,
      ai_draft: "AI 최초 초안 B1",
      final_text: null,
    })
    .select("*");
  expectNoError(recordsBError, "B 활동 기록 생성");
  assert(
    reportsA?.length === 2 &&
      reportsB?.length === 1 &&
      recordsA?.length === 2 &&
      recordsB?.length === 1,
    "보고서 또는 활동 기록 생성 수 불일치",
  );

  const { data: ownStudents, error: ownStudentsError } = await clientA
    .from("students")
    .select("*");
  expectNoError(ownStudentsError, "A 자기 학생 조회");
  assert(ownStudents?.length === 3, "A 자기 학생 조회 범위가 잘못됐습니다.");
  results.push("RLS own student select");

  const { data: otherStudent, error: otherStudentError } = await clientA
    .from("students")
    .select("*")
    .eq("id", studentB1.id);
  expectNoError(otherStudentError, "A의 B 학생 차단 조회");
  assert(otherStudent?.length === 0, "A가 B 학생을 조회했습니다.");
  results.push("RLS cross-teacher student select blocked");

  const { data: otherReports, error: otherReportsError } = await clientA
    .from("student_reports")
    .select("*")
    .eq("teacher_id", teacherBId);
  expectNoError(otherReportsError, "A의 B 보고서 차단 조회");
  assert(otherReports?.length === 0, "A가 B 보고서를 조회했습니다.");

  const { data: otherRecords, error: otherRecordsError } = await clientA
    .from("activity_records")
    .select("*")
    .eq("teacher_id", teacherBId);
  expectNoError(otherRecordsError, "A의 B 활동 기록 차단 조회");
  assert(otherRecords?.length === 0, "A가 B 활동 기록을 조회했습니다.");

  const { data: crossReportUpdate, error: crossReportUpdateError } = await clientA
    .from("student_reports")
    .update({ report_text: "침범 시도" })
    .eq("id", reportsB[0].id)
    .select("id");
  expectBlocked(crossReportUpdateError, crossReportUpdate, "A의 B 보고서 수정");

  const { data: crossRecordUpdate, error: crossRecordUpdateError } = await clientA
    .from("activity_records")
    .update({ final_text: "침범 시도" })
    .eq("id", recordsB[0].id)
    .select("id");
  expectBlocked(crossRecordUpdateError, crossRecordUpdate, "A의 B 활동 기록 수정");
  results.push("RLS cross-teacher report/record read and update blocked");

  const { data: anonymousStudents, error: anonymousStudentsError } =
    await anonymousClient.from("students").select("*");
  expectBlocked(
    anonymousStudentsError,
    anonymousStudents,
    "비로그인 학생 조회",
  );
  results.push("RLS anonymous select blocked");

  for (const [client, teacherId, studentId, activityId, label] of [
    [clientA, teacherAId, studentA1.id, activityB1.id, "A학생-B활동"],
    [clientB, teacherBId, studentB1.id, activityA1.id, "B학생-A활동"],
  ]) {
    const { data: crossReport, error: crossReportError } = await client
      .from("student_reports")
      .insert({
        teacher_id: teacherId,
        student_id: studentId,
        activity_id: activityId,
        report_text: `차단 대상 ${label}`,
      })
      .select("id");
    expectBlocked(crossReportError, crossReport, `${label} 보고서 생성`);

    const { data: crossRecord, error: crossRecordError } = await client
      .from("activity_records")
      .insert({
        teacher_id: teacherId,
        student_id: studentId,
        activity_id: activityId,
        analysis_json: analysis,
        ai_draft: `차단 대상 ${label}`,
        final_text: null,
      })
      .select("id");
    expectBlocked(crossRecordError, crossRecord, `${label} 활동 기록 생성`);
  }
  results.push("RLS cross-owner student/activity combinations blocked both ways");

  const originalRecord = recordsA[0];
  const { error: aiDraftMutationError } = await clientA
    .from("activity_records")
    .update({ ai_draft: "덮어쓰기 시도" })
    .eq("id", originalRecord.id);
  assert(aiDraftMutationError, "ai_draft UPDATE가 허용됐습니다.");

  const { data: finalizedRecord, error: finalTextError } = await clientA
    .from("activity_records")
    .update({ final_text: "교사가 검토한 최종 문장" })
    .eq("id", originalRecord.id)
    .select("*")
    .single();
  expectNoError(finalTextError, "final_text 저장");
  assert(
    finalizedRecord.ai_draft === originalRecord.ai_draft &&
      finalizedRecord.final_text === "교사가 검토한 최종 문장" &&
      JSON.stringify(finalizedRecord.analysis_json) ===
        JSON.stringify(originalRecord.analysis_json),
    "analysis_json, ai_draft, final_text 분리가 깨졌습니다.",
  );
  results.push("analysis/aiDraft/finalText separation");

  reportPath = `${teacherAId}/${studentA1.id}/${activityA1.id}/report.pdf`;
  const initialPdf = new TextEncoder().encode("%PDF-1.4\nfirst virtual report");
  const replacedPdf = new TextEncoder().encode("%PDF-1.4\nreplaced virtual report");

  const { error: uploadError } = await clientA.storage
    .from("student-reports")
    .upload(reportPath, initialPdf, {
      contentType: "application/pdf",
      upsert: false,
    });
  expectNoError(uploadError, "Storage upload");

  const { data: ownFile, error: ownReadError } = await clientA.storage
    .from("student-reports")
    .download(reportPath);
  expectNoError(ownReadError, "Storage own read");
  assert((await ownFile.text()).includes("first virtual report"), "Storage 본인 파일 내용 불일치");

  const { data: overwriteData, error: overwriteError } = await clientA.storage
    .from("student-reports")
    .upload(reportPath, replacedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  expectNoError(overwriteError, "Storage overwrite");
  assert(overwriteData.path === reportPath, "Storage overwrite 경로 불일치");

  const { data: overwrittenFile, error: overwrittenReadError } =
    await clientA.storage.from("student-reports").download(reportPath);
  expectNoError(overwrittenReadError, "Storage overwritten read");
  assert(overwrittenFile.size > 0, "Storage overwrite 후 파일을 읽지 못했습니다.");
  results.push("Storage upload/read/overwrite");

  const { data: crossTeacherFile, error: crossTeacherReadError } =
    await clientB.storage.from("student-reports").download(reportPath);
  expectBlocked(
    crossTeacherReadError,
    crossTeacherFile,
    "Storage 다른 교사 파일 읽기",
  );

  const { data: anonymousFile, error: anonymousFileError } =
    await anonymousClient.storage.from("student-reports").download(reportPath);
  expectBlocked(
    anonymousFileError,
    anonymousFile,
    "Storage 비로그인 파일 읽기",
  );

  const forbiddenPath = `${teacherBId}/${studentA1.id}/${activityA1.id}/forbidden.pdf`;
  const { data: forbiddenUpload, error: forbiddenUploadError } =
    await clientA.storage
      .from("student-reports")
      .upload(forbiddenPath, initialPdf, {
        contentType: "application/pdf",
      });
  expectBlocked(
    forbiddenUploadError,
    forbiddenUpload,
    "Storage 다른 teacherId 경로 업로드",
  );
  results.push("Storage cross-teacher read/upload and anonymous read blocked");

  const tooLargePath = `${teacherAId}/${studentA1.id}/${activityA1.id}/too-large.pdf`;
  const { data: tooLargeUpload, error: tooLargeError } = await clientA.storage
    .from("student-reports")
    .upload(tooLargePath, new Uint8Array(10 * 1024 * 1024 + 1), {
      contentType: "application/pdf",
    });
  expectBlocked(tooLargeError, tooLargeUpload, "Storage 10MB 초과 업로드");

  const invalidMimePath = `${teacherAId}/${studentA1.id}/${activityA1.id}/invalid.png`;
  const { data: invalidMimeUpload, error: invalidMimeError } =
    await clientA.storage
      .from("student-reports")
      .upload(invalidMimePath, new Uint8Array([1, 2, 3]), {
        contentType: "image/png",
      });
  expectBlocked(
    invalidMimeError,
    invalidMimeUpload,
    "Storage 허용되지 않은 MIME 업로드",
  );
  results.push("Storage size and MIME limits");

  const { data: reportWithFile, error: reportWithFileError } = await clientA
    .from("student_reports")
    .update({
      report_file_path: reportPath,
      report_file_name: "report.pdf",
      report_file_mime_type: "application/pdf",
      report_file_size_bytes: replacedPdf.byteLength,
    })
    .eq("id", reportsA[0].id)
    .select("*")
    .single();
  expectNoError(reportWithFileError, "보고서 Storage metadata 저장");
  assert(reportWithFile.report_file_path === reportPath, "DB Storage path 불일치");
  results.push("DB stores Storage path/metadata");

  const { error: deleteFileError } = await clientA.storage
    .from("student-reports")
    .remove([reportPath]);
  expectNoError(deleteFileError, "Storage delete");
  reportPath = undefined;

  const { data: deletedFile, error: deletedReadError } = await clientA.storage
    .from("student-reports")
    .download(
      `${teacherAId}/${studentA1.id}/${activityA1.id}/report.pdf`,
    );
  expectBlocked(deletedReadError, deletedFile, "Storage 삭제 후 조회");
  results.push("Storage delete");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessions: 2,
        fictionalStudents: 5,
        activitiesPerTeacher: 4,
        reports: 3,
        activityRecords: 3,
        results,
        cleanupAuthUserIds: [teacherAId, teacherBId],
        cleanupAuthEmails: [teacherAEmail, teacherBEmail],
      },
      null,
      2,
    ),
  );
} finally {
  if (reportPath && teacherAId) {
    await clientA.storage.from("student-reports").remove([reportPath]);
  }
  await cleanup(clientA, teacherAId);
  await cleanup(clientB, teacherBId);
  console.error(
    `AUTH_USERS_FOR_CLEANUP=${[teacherAId, teacherBId].filter(Boolean).join(",")}`,
  );
}
