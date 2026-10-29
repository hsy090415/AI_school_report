"use client";

import { useEffect, useState } from "react";
import { createClient, type AppSupabaseClient } from "../../lib/supabase/client";
import {
  createIcwcTeam, ensureCurrentTeacherActivities, getCurrentStudentIcwcSubmission,
  getIcwcDraftHistory, getIcwcStudentReview, getIcwcTeacherSubmissions,
  getIcwcTeams, getIcwcTeamMembers, getPublishedIcwcFinalRecordsForCurrentStudent,
  getStudents, saveCurrentStudentIcwcReflection, saveIcwcFinalRecord,
  saveIcwcStudentReview, setIcwcFinalRecordPublished, uploadIcwcTeamReportFile,
} from "../../services/database";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH, MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH, type IcwcDraftDirection,
  type IcwcDraftHistoryEntry, type IcwcFinalRecord, type IcwcStudentReview,
  type IcwcStudentSubmission, type IcwcTeam, type IcwcTeamMember, type Student,
} from "../../types";
import styles from "./icwc-test.module.css";

type ActualRole = "TEACHER" | "STUDENT" | "PENDING" | null;
type RequestedRole = "TEACHER" | "STUDENT";
type SignupReceipt = { email: string; uid: string; requestedRole: RequestedRole };

const SIGNUP_RECEIPT_KEY = "icwc-test-signup-receipt";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

async function apiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `요청 실패 (${response.status})`;
  } catch { return `요청 실패 (${response.status})`; }
}

function studentLabel(student: Student): string {
  return `${student.grade}학년 ${student.classNo}반 ${student.studentNo}번 · ${student.name}`;
}

export function IcwcTestWorkbench() {
  const [client, setClient] = useState<AppSupabaseClient | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [roleRefresh, setRoleRefresh] = useState(0);
  const [role, setRole] = useState<ActualRole>(null);
  const [profileName, setProfileName] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("STUDENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupReceipt, setSignupReceipt] = useState<SignupReceipt | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<IcwcTeam[]>([]);
  const [teamMembers, setTeamMembers] = useState<IcwcTeamMember[]>([]);
  const [submissions, setSubmissions] = useState<IcwcStudentSubmission[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamStudentIds, setNewTeamStudentIds] = useState<string[]>([]);

  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reflection, setReflection] = useState("");
  const [ownSubmission, setOwnSubmission] = useState<IcwcStudentSubmission | null>(null);
  const [publishedRecords, setPublishedRecords] = useState<IcwcFinalRecord[]>([]);
  const [review, setReview] = useState<IcwcStudentReview | null>(null);
  const [teacherComment, setTeacherComment] = useState("");
  const [focus, setFocus] = useState<IcwcDraftDirection>("탐구내용 중심");
  const [maxLength, setMaxLength] = useState(DEFAULT_ACTIVITY_RECORD_MAX_LENGTH);
  const [drafts, setDrafts] = useState<IcwcDraftHistoryEntry[]>([]);
  const [finalRecord, setFinalRecord] = useState<IcwcFinalRecord | null>(null);
  const [finalText, setFinalText] = useState("");

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) ?? null;

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SIGNUP_RECEIPT_KEY);
      if (stored) {
        const receipt = JSON.parse(stored) as Partial<SignupReceipt>;
        if (typeof receipt.email === "string" && typeof receipt.uid === "string"
          && /^[a-f\d-]{36}$/iu.test(receipt.uid)
          && (receipt.requestedRole === "TEACHER" || receipt.requestedRole === "STUDENT")) {
          setSignupReceipt(receipt as SignupReceipt);
        }
      }
    } catch { /* Session storage may be unavailable in a restricted browser. */ }
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();
      setClient(supabase);
      void supabase.auth.getUser().then(({ data }) => {
        setUserId(data.user?.id ?? null);
        setIsAnonymous(Boolean(data.user?.is_anonymous));
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setUserId(session?.user.id ?? null);
        setIsAnonymous(Boolean(session?.user.is_anonymous));
      });
      return () => listener.subscription.unsubscribe();
    } catch (caught) { setError(errorText(caught)); }
  }, []);

  useEffect(() => {
    if (!client || !userId || isAnonymous) { setRole(null); return; }
    let active = true;
    void (async () => {
      try {
        const [{ data: teacher, error: teacherError }, { data: student, error: studentError }] = await Promise.all([
          client.from("teachers").select("id,name").eq("auth_user_id", userId).maybeSingle(),
          client.from("students").select("id,name").eq("auth_user_id", userId).maybeSingle(),
        ]);
        if (teacherError) throw teacherError;
        if (studentError) throw studentError;
        if (!active) return;
        setRole(teacher ? "TEACHER" : student ? "STUDENT" : "PENDING");
        setProfileName(teacher?.name ?? student?.name ?? "");
      } catch (caught) { if (active) setError(errorText(caught)); }
    })();
    return () => { active = false; };
  }, [client, userId, isAnonymous, roleRefresh]);

  async function refreshWorkspace(): Promise<void> {
    if (!client) return;
    if (role === "TEACHER") {
      await ensureCurrentTeacherActivities(client);
      const [roster, teamList, submissionList] = await Promise.all([
        getStudents(client), getIcwcTeams(client), getIcwcTeacherSubmissions(client),
      ]);
      setStudents(roster); setTeams(teamList); setSubmissions(submissionList);
      setSelectedTeamId((current) => teamList.some((team) => team.id === current) ? current : teamList[0]?.id ?? "");
      setSelectedSubmissionId((current) => submissionList.some((item) => item.id === current) ? current : submissionList[0]?.id ?? "");
    } else if (role === "STUDENT") {
      const [teamList, records] = await Promise.all([
        getIcwcTeams(client), getPublishedIcwcFinalRecordsForCurrentStudent(client),
      ]);
      setTeams(teamList); setPublishedRecords(records);
      setSelectedTeamId((current) => teamList.some((team) => team.id === current) ? current : teamList[0]?.id ?? "");
    }
  }

  useEffect(() => {
    if (role !== "TEACHER" && role !== "STUDENT") return;
    void refreshWorkspace().catch((caught) => setError(errorText(caught)));
    // Initial role transition only; mutations call refreshWorkspace themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, role]);

  useEffect(() => {
    if (!client || !selectedTeamId || !role) return;
    if (role === "TEACHER") {
      void getIcwcTeamMembers(client, selectedTeamId).then(setTeamMembers).catch((caught) => setError(errorText(caught)));
    } else if (role === "STUDENT") {
      void getCurrentStudentIcwcSubmission(client, selectedTeamId).then((saved) => {
        setOwnSubmission(saved); setReflection(saved?.reflectionText ?? "");
      }).catch((caught) => setError(errorText(caught)));
    }
  }, [client, role, selectedTeamId]);

  useEffect(() => {
    if (!client || role !== "TEACHER" || !selectedSubmissionId) {
      setReview(null); setDrafts([]); setFinalRecord(null); setFinalText(""); return;
    }
    let active = true;
    void (async () => {
      try {
        const savedReview = await getIcwcStudentReview(client, selectedSubmissionId);
        if (!active) return;
        setReview(savedReview); setTeacherComment(savedReview?.teacherComment ?? "");
        setFocus(savedReview?.draftFocus ?? "탐구내용 중심");
        if (!savedReview) { setDrafts([]); setFinalRecord(null); setFinalText(""); return; }
        const [history, { data: finalRow, error: finalError }] = await Promise.all([
          getIcwcDraftHistory(client, savedReview.id),
          client.from("icwc_final_records").select("*").eq("review_id", savedReview.id).maybeSingle(),
        ]);
        if (finalError) throw finalError;
        if (!active) return;
        setDrafts(history);
        setFinalRecord(finalRow ? {
          id: finalRow.id, reviewId: finalRow.review_id, teacherId: finalRow.teacher_id,
          studentId: finalRow.student_id, activityId: finalRow.activity_id,
          finalText: finalRow.final_text, publishedAt: finalRow.published_at,
          createdAt: finalRow.created_at, updatedAt: finalRow.updated_at,
        } : null);
        setFinalText(finalRow?.final_text ?? history[0]?.draftText ?? "");
      } catch (caught) { if (active) setError(errorText(caught)); }
    })();
    return () => { active = false; };
  }, [client, role, selectedSubmissionId]);

  async function run(label: string, action: () => Promise<void>): Promise<void> {
    setBusy(label); setMessage(""); setError("");
    try { await action(); } catch (caught) { setError(errorText(caught)); } finally { setBusy(""); }
  }

  async function authenticate(): Promise<void> {
    if (!client || !email.trim() || !password) { setError("이메일과 비밀번호를 입력해 주세요."); return; }
    await run("auth", async () => {
      if (authMode === "signup") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(), password, options: { data: { requested_role: requestedRole } },
        });
        if (authError) throw authError;
        if (data.user && data.user.identities?.length) {
          const receipt = { email: email.trim(), uid: data.user.id, requestedRole };
          setSignupReceipt(receipt);
          try { window.sessionStorage.setItem(SIGNUP_RECEIPT_KEY, JSON.stringify(receipt)); } catch { /* The UID remains visible until this tab closes. */ }
        } else {
          setSignupReceipt(null);
          try { window.sessionStorage.removeItem(SIGNUP_RECEIPT_KEY); } catch { /* Ignore unavailable storage. */ }
        }
        setMessage(data.session ? "계정이 만들어졌습니다. 관리자 명단 연결을 기다려 주세요."
          : "가입 요청을 받았습니다. 이메일을 확인한 뒤 로그인해 주세요. 아래 UID는 새 계정이 만들어진 경우에 표시됩니다.");
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setSignupReceipt(null);
        try { window.sessionStorage.removeItem(SIGNUP_RECEIPT_KEY); } catch { /* Ignore unavailable storage. */ }
        setMessage("로그인했습니다.");
      }
      setPassword("");
    });
  }

  async function createTeam(): Promise<void> {
    if (!client || !newTeamName.trim() || !newTeamStudentIds.length) { setError("팀 이름과 학생을 선택해 주세요."); return; }
    await run("team", async () => {
      const { data: activity, error: activityError } = await client.from("activities")
        .select("id").eq("code", "AUTONOMOUS_ICAN_WECAN").single();
      if (activityError || !activity) throw new Error("ICWC 활동을 찾지 못했습니다.");
      const team = await createIcwcTeam(client, {
        activityId: activity.id, teamName: newTeamName.trim(), studentIds: newTeamStudentIds,
      });
      setNewTeamName(""); setNewTeamStudentIds([]);
      await refreshWorkspace(); setSelectedTeamId(team.id);
      setMessage("팀과 팀원을 만들었습니다. 학생 계정을 명단에 연결하면 제출할 수 있습니다.");
    });
  }

  async function submitStudentWork(): Promise<void> {
    if (!client || !selectedTeam || !reflection.trim()) { setError("팀과 소감문을 확인해 주세요."); return; }
    if (!selectedTeam.submittedAt && !reportFile) { setError("팀 보고서를 첨부해 주세요."); return; }
    await run("submit", async () => {
      if (!selectedTeam.submittedAt && reportFile) {
        if (reportFile.size < 1 || reportFile.size > 10 * 1024 * 1024) throw new Error("보고서는 10MB 이하여야 합니다.");
        const extension = reportFile.name.toLowerCase().split(".").pop();
        if (extension !== "hwp" && extension !== "docx") throw new Error("HWP 또는 DOCX 파일을 선택해 주세요.");
        const mimeType = extension === "hwp" ? "application/x-hwp"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const uploaded = await uploadIcwcTeamReportFile(client, {
          teamId: selectedTeam.id, originalName: reportFile.name, mimeType, body: reportFile,
        });
        const response = await fetch("/api/icwc-test/report", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: selectedTeam.id, path: uploaded.path, name: uploaded.name, sizeBytes: uploaded.sizeBytes }),
        });
        if (!response.ok) throw new Error(await apiError(response));
      }
      const submission = await saveCurrentStudentIcwcReflection(client, {
        teamId: selectedTeam.id, reflectionText: reflection.trim(), submit: true,
      });
      setOwnSubmission(submission); setReportFile(null);
      await refreshWorkspace();
      setMessage("팀 보고서와 개인 소감문을 제출했습니다. 교사 검토를 기다려 주세요.");
    });
  }

  async function saveReviewAndGenerate(): Promise<void> {
    if (!client || !selectedSubmission || !teacherComment.trim()) { setError("학생과 교사 코멘트를 확인해 주세요."); return; }
    if (!Number.isInteger(maxLength) || maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH) {
      setError("글자 수 기준을 확인해 주세요."); return;
    }
    await run("generate", async () => {
      const saved = await saveIcwcStudentReview(client, {
        submissionId: selectedSubmission.id, teacherComment: teacherComment.trim(), draftFocus: focus,
      });
      setReview(saved);
      const response = await fetch("/api/icwc-test/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: selectedSubmission.id, maxLength }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const result = (await response.json()) as { draft: string; warnings: string[]; history: IcwcDraftHistoryEntry };
      setDrafts((current) => [result.history, ...current]);
      if (!finalRecord) setFinalText(result.draft);
      setMessage(result.warnings.length ? `초안을 저장했습니다. ${result.warnings.join(" ")}` : "초안을 저장했습니다. 교사가 수정한 뒤 최종 문장을 저장해 주세요.");
    });
  }

  async function saveFinal(publish: boolean): Promise<void> {
    if (!client || !review || !finalText.trim()) { setError("교사 검토와 최종 문장을 확인해 주세요."); return; }
    await run("final", async () => {
      const saved = await saveIcwcFinalRecord(client, review.id, finalText.trim());
      const record = publish ? await setIcwcFinalRecordPublished(client, review.id, true) : saved;
      setFinalRecord(record);
      setMessage(publish ? "최종 문장을 저장하고 학생에게 공개했습니다." : "최종 문장을 저장했습니다.");
    });
  }

  const selectedStudent = students.find((item) => item.id === selectedSubmission?.studentId);
  const submissionTeam = teams.find((item) => item.id === selectedSubmission?.teamId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>ICWC · 2학년 과정 테스트</span><h1>보고서 제출부터 학생 열람까지</h1><p>교사·학생 계정으로 같은 자료 흐름을 확인합니다.</p></div>
        <div className={styles.headerActions}><a href="/teacher">기존 교사 화면</a>{userId && client ? <button onClick={() => void run("signout", async () => {
          const { error: signOutError } = await client.auth.signOut(); if (signOutError) throw signOutError;
          setRole(null); setTeams([]); setSubmissions([]); setUserId(null);
        })}>{isAnonymous ? "익명 세션 종료" : "로그아웃"}</button> : null}</div>
      </header>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {message ? <div className={styles.message} role="status">{message}</div> : null}

      {isAnonymous && userId ? <section className={styles.authCard}>
        <div className={styles.sectionTitle}><span>기존 체험 세션</span><h2>이메일 계정으로 전환하기</h2></div>
        <p>이 브라우저는 이전 익명 체험 계정으로 접속 중입니다. 위의 ‘익명 세션 종료’를 누른 뒤 교사 또는 학생 회원가입을 진행해 주세요.</p>
      </section> : !userId ? <section className={styles.authCard}>
        <div className={styles.sectionTitle}><span>01 · 계정</span><h2>{authMode === "signup" ? "회원가입" : "로그인"}</h2></div>
        <div className={styles.tabs}><button className={authMode === "signup" ? styles.active : ""} onClick={() => setAuthMode("signup")}>회원가입</button><button className={authMode === "login" ? styles.active : ""} onClick={() => setAuthMode("login")}>로그인</button></div>
        {authMode === "signup" ? <div className={styles.roleOptions}><button className={requestedRole === "STUDENT" ? styles.selected : ""} onClick={() => setRequestedRole("STUDENT")}>학생으로 가입</button><button className={requestedRole === "TEACHER" ? styles.selected : ""} onClick={() => setRequestedRole("TEACHER")}>교사로 가입</button></div> : null}
        <label>이메일<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>비밀번호<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void authenticate(); }} /></label>
        <button className={styles.primary} disabled={Boolean(busy)} onClick={() => void authenticate()}>{busy === "auth" ? "처리 중…" : authMode === "signup" ? "가입하기" : "로그인"}</button>
        {signupReceipt && (!email.trim() || email.trim() === signupReceipt.email) ? <div className={styles.receipt}>
          <strong>{signupReceipt.requestedRole === "TEACHER" ? "교사" : "학생"} 가입 요청 UID</strong>
          <span>{signupReceipt.email}</span>
          <code className={styles.uid}>{signupReceipt.uid}</code>
          <p>이메일 확인 전에도 이 UID를 관리자에게 전달할 수 있습니다. 역할 권한은 DB 명단 연결 후 적용됩니다.</p>
        </div> : null}
        <p className={styles.hint}>역할 선택은 가입 신청 정보입니다. 실제 접근 권한은 관리자가 Auth UID를 기존 교사·학생 명단에 연결한 뒤 활성화됩니다.</p>
        <p className={styles.hint}>이 화면을 수정하기 전에 이미 가입했다면, 이메일 확인 후 로그인하면 UID가 표시됩니다. 재가입할 필요는 없습니다.</p>
      </section> : role === "PENDING" || role === null ? <section className={styles.authCard}>
        <div className={styles.sectionTitle}><span>계정 연결 대기</span><h2>관리자 연결이 필요합니다</h2></div>
        <p>회원가입은 완료됐지만 기존 교사 또는 학생 명단에 연결되지 않았습니다. 관리자가 아래 Auth UID를 확인해 연결하면 계속할 수 있습니다.</p>
        <code className={styles.uid}>{userId}</code>
        <button className={styles.secondary} onClick={() => setRoleRefresh((count) => count + 1)}>연결 상태 다시 확인</button>
      </section> : <div className={styles.workspace}>
        <div className={styles.profileBar}><div><strong>{profileName}</strong><span>{role === "TEACHER" ? "교사 계정" : "학생 계정"}</span></div><button onClick={() => void run("refresh", refreshWorkspace)}>자료 새로고침</button></div>
        <div className={styles.signedInUid}><span>내 Auth UID</span><code>{userId}</code></div>

        {role === "TEACHER" ? <>
          <section className={styles.card}>
            <div className={styles.sectionTitle}><span>02 · 교사 준비</span><h2>ICWC 팀 만들기</h2></div>
            <div className={styles.row}><label>팀 이름<input value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="예: 2학년 1반 융합탐구팀" /></label><button className={styles.primary} disabled={Boolean(busy)} onClick={() => void createTeam()}>팀 생성</button></div>
            <div className={styles.roster}>{students.map((student) => <label key={student.id}><input type="checkbox" checked={newTeamStudentIds.includes(student.id)} onChange={(event) => setNewTeamStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />{studentLabel(student)}</label>)}</div>
            {!students.length ? <p className={styles.hint}>담당 학생 명단이 없습니다. DB에 학생 명단과 담당 교사 연결을 확인해 주세요.</p> : null}
          </section>
          <section className={styles.card}>
            <div className={styles.sectionTitle}><span>03 · 제출 확인</span><h2>팀 보고서와 개인 소감문</h2></div>
            <label>팀 선택<select value={selectedTeamId} onChange={(event) => { const teamId = event.target.value; setSelectedTeamId(teamId); setSelectedSubmissionId(submissions.find((item) => item.teamId === teamId)?.id ?? ""); }}><option value="">팀 선택</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}</select></label>
            {selectedTeam ? <><p className={styles.hint}>팀원 {teamMembers.filter((member) => member.teamId === selectedTeam.id).map((member) => students.find((student) => student.id === member.studentId)?.name ?? "미확인").join(", ") || "없음"} · 보고서 {selectedTeam.submittedAt ? "제출 완료" : "대기"}</p>{selectedTeam.submittedAt ? <details><summary>추출된 팀 보고서 확인</summary><pre className={styles.reportText}>{selectedTeam.reportText}</pre></details> : null}</> : null}
            <div className={styles.submissionList}>{submissions.filter((item) => !selectedTeamId || item.teamId === selectedTeamId).map((item) => <button key={item.id} className={selectedSubmissionId === item.id ? styles.selected : ""} onClick={() => setSelectedSubmissionId(item.id)}>{students.find((student) => student.id === item.studentId)?.name ?? "학생"} · {item.submittedAt ? "제출 완료" : "작성 중"}</button>)}</div>
            {!submissions.length ? <p className={styles.hint}>아직 학생 소감문 제출이 없습니다.</p> : null}
          </section>
          {selectedSubmission ? <section className={styles.card}>
            <div className={styles.sectionTitle}><span>04 · 교사 검토</span><h2>{selectedStudent?.name ?? "학생"}의 초안 생성</h2></div>
            <p className={styles.hint}>팀: {submissionTeam?.teamName ?? "미확인"} · 소감문: {selectedSubmission.submittedAt ? "제출 완료" : "작성 중"}</p>
            <div className={styles.readBox}><strong>학생 소감문</strong><p>{selectedSubmission.reflectionText || "입력 전"}</p></div>
            <label>교사 코멘트<textarea rows={5} value={teacherComment} onChange={(event) => setTeacherComment(event.target.value)} placeholder="학생에게서 관찰한 역할, 탐구 행동, 협업 과정을 구체적으로 적어 주세요." /></label>
            <div className={styles.row}><label>초안 방향<select value={focus} onChange={(event) => setFocus(event.target.value as IcwcDraftDirection)}><option>탐구내용 중심</option><option>공동체역량 중심</option></select></label><label>글자 수 기준<input type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH} max={MAX_ACTIVITY_RECORD_MAX_LENGTH} value={maxLength} onChange={(event) => setMaxLength(Number(event.target.value))} /></label></div>
            <button className={styles.primary} disabled={Boolean(busy) || !selectedSubmission.submittedAt || !submissionTeam?.submittedAt} onClick={() => void saveReviewAndGenerate()}>{busy === "generate" ? "Groq 초안 생성 중…" : "코멘트 저장하고 초안 생성"}</button>
            <p className={styles.hint}>보고서와 소감문 제출 후 생성합니다. Groq는 목표보다 약 70자 짧게 한 번만 작성합니다.</p>
            {drafts.length ? <div className={styles.draftList}><h3>AI 초안 이력</h3>{drafts.map((draft) => <article key={draft.id}><span>{draft.generationDirection} · {new Date(draft.createdAt).toLocaleString("ko-KR")}</span><p>{draft.draftText}</p><button className={styles.textButton} onClick={() => setFinalText(draft.draftText)}>이 초안을 수정 영역에 가져오기</button></article>)}</div> : null}
            {(review || drafts.length > 0) ? <div className={styles.finalBox}><h3>교사 최종 문장</h3><textarea rows={7} value={finalText} onChange={(event) => setFinalText(event.target.value)} placeholder="AI 초안을 검토하고 수정해 주세요." /><p className={styles.hint}>공백 포함 {Array.from(finalText).length}자 / 기준 {maxLength}자 · {finalRecord?.publishedAt ? "학생에게 공개 중" : "비공개"}</p><div className={styles.actions}><button className={styles.secondary} disabled={Boolean(busy) || !finalText.trim()} onClick={() => void saveFinal(false)}>저장</button><button className={styles.primary} disabled={Boolean(busy) || !finalText.trim()} onClick={() => void saveFinal(true)}>저장하고 학생에게 공개</button>{finalRecord?.publishedAt ? <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void run("final", async () => { if (!client || !review) return; setFinalRecord(await setIcwcFinalRecordPublished(client, review.id, false)); setMessage("학생 공개를 해제했습니다."); })}>공개 해제</button> : null}</div></div> : null}
          </section> : null}
        </> : <>
          <section className={styles.card}>
            <div className={styles.sectionTitle}><span>02 · 학생 제출</span><h2>팀 보고서와 내 소감문</h2></div>
            <label>소속 팀<select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}><option value="">팀 선택</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}</select></label>
            {!teams.length ? <p className={styles.hint}>아직 배정된 ICWC 팀이 없습니다. 담당 교사에게 팀 배정을 요청해 주세요.</p> : null}
            {selectedTeam ? <><p className={styles.hint}>팀 보고서: {selectedTeam.submittedAt ? `${selectedTeam.reportFile?.name ?? "제출 완료"} · 제출됨` : "제출 전"}</p>{!selectedTeam.submittedAt ? <label>2학년 ICWC 보고서 (HWP 또는 DOCX, 최대 10MB)<input type="file" accept=".hwp,.docx" onChange={(event) => setReportFile(event.target.files?.[0] ?? null)} /></label> : null}
              <label>내 소감문<textarea rows={9} maxLength={5000} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="내가 맡은 일, 어려웠던 점과 해결 과정, 팀원과 협력한 구체적인 경험을 적어 주세요." /></label><p className={styles.hint}>소감문 {reflection.length}/5,000자 · {ownSubmission?.submittedAt ? "기존 제출 있음" : "제출 전"}</p><button className={styles.primary} disabled={Boolean(busy) || !reflection.trim()} onClick={() => void submitStudentWork()}>{busy === "submit" ? "제출 중…" : selectedTeam.submittedAt ? "소감문 제출" : "보고서와 소감문 제출"}</button>
            </> : null}
          </section>
          <section className={styles.card}><div className={styles.sectionTitle}><span>03 · 결과 확인</span><h2>교사가 공개한 최종 문장</h2></div>{publishedRecords.length ? publishedRecords.map((record) => <article className={styles.published} key={record.id}><p>{record.finalText}</p><small>공개일 {record.publishedAt ? new Date(record.publishedAt).toLocaleString("ko-KR") : ""}</small></article>) : <p className={styles.hint}>공개된 문장이 아직 없습니다. 교사가 검토·공개하면 이곳에 표시됩니다.</p>}</section>
        </>}
      </div>}
    </main>
  );
}
