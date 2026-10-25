import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const teacherEmail = process.env.SUPABASE_TEST_TEACHER_EMAIL;
const teacherPassword = process.env.SUPABASE_TEST_TEACHER_PASSWORD;
const studentEmail = process.env.SUPABASE_TEST_STUDENT_EMAIL;
const studentPassword = process.env.SUPABASE_TEST_STUDENT_PASSWORD;

const required = {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_TEST_TEACHER_EMAIL: teacherEmail,
  SUPABASE_TEST_TEACHER_PASSWORD: teacherPassword,
  SUPABASE_TEST_STUDENT_EMAIL: studentEmail,
  SUPABASE_TEST_STUDENT_PASSWORD: studentPassword,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`테스트 환경변수가 필요합니다: ${missing.join(", ")}`);
}

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
  if (!condition) throw new Error(message);
}

function expectNoError(error, operation) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  expectNoError(error, `${label} 이메일 로그인`);
  assert(data.user && data.session, `${label} 세션을 만들지 못했습니다.`);
  return data.user;
}

const teacherClient = makeClient();
const studentClient = makeClient();
const unauthenticatedClient = makeClient();

const teacherUser = await signIn(
  teacherClient,
  teacherEmail,
  teacherPassword,
  "교사",
);
const { data: teachers, error: teacherError } = await teacherClient
  .from("teachers")
  .select("id,auth_user_id,name")
  .eq("auth_user_id", teacherUser.id);
expectNoError(teacherError, "교사 DB 연결 조회");
assert(teachers.length === 1, "Auth UID와 연결된 교사 행이 정확히 1개여야 합니다.");

const teacherId = teachers[0].id;
const { data: teacherTeams, error: teacherTeamsError } = await teacherClient
  .from("icwc_teams")
  .select("id,teacher_id")
  .eq("teacher_id", teacherId);
expectNoError(teacherTeamsError, "담당 교사 ICWC 팀 조회");
assert(
  teacherTeams.every((team) => team.teacher_id === teacherId),
  "다른 교사의 ICWC 팀이 노출됐습니다.",
);

const studentUser = await signIn(
  studentClient,
  studentEmail,
  studentPassword,
  "학생",
);
const { data: students, error: studentError } = await studentClient
  .from("students")
  .select("id,auth_user_id,name")
  .eq("auth_user_id", studentUser.id);
expectNoError(studentError, "학생 DB 연결 조회");
assert(students.length === 1, "Auth UID와 연결된 학생 행이 정확히 1개여야 합니다.");

const studentId = students[0].id;
const { data: reviews, error: reviewsError } = await studentClient
  .from("icwc_student_reviews")
  .select("id");
expectNoError(reviewsError, "학생의 교사 검토 차단 조회");
assert(reviews.length === 0, "학생에게 teacher_comment 행이 노출됐습니다.");

const { data: drafts, error: draftsError } = await studentClient
  .from("icwc_draft_history")
  .select("id");
expectNoError(draftsError, "학생의 AI 초안 차단 조회");
assert(drafts.length === 0, "학생에게 AI draft history가 노출됐습니다.");

const { data: finalRecords, error: finalError } = await studentClient
  .from("icwc_final_records")
  .select("student_id,published_at,final_text");
expectNoError(finalError, "학생 공개 최종 문장 조회");
assert(
  finalRecords.every(
    (record) => record.student_id === studentId && record.published_at,
  ),
  "다른 학생 또는 공개 전 최종 문장이 노출됐습니다.",
);

const { data: publicTeams, error: publicTeamsError } =
  await unauthenticatedClient.from("icwc_teams").select("id");
assert(
  Boolean(publicTeamsError) || publicTeams.length === 0,
  "비로그인 사용자에게 ICWC 팀 데이터가 노출됐습니다.",
);

await Promise.all([teacherClient.auth.signOut(), studentClient.auth.signOut()]);

console.log(
  JSON.stringify(
    {
      ok: true,
      teacherId,
      studentId,
      teacherTeams: teacherTeams.length,
      publishedFinalRecords: finalRecords.length,
      checks: [
        "email/password teacher session",
        "email/password student session",
        "teacher account link",
        "student account link",
        "teacher_comment hidden",
        "AI draft history hidden",
        "only published own final records visible",
        "unauthenticated access blocked",
      ],
    },
    null,
    2,
  ),
);
