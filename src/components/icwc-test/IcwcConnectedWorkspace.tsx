"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type AppSupabaseClient } from "../../lib/supabase/client";
import {
  createIcwcTeam,
  ensureCurrentTeacherActivities,
  getCurrentStudentIcwcSubmission,
  getIcwcStudentReview,
  getIcwcTeacherSubmissions,
  getIcwcTeamMembers,
  getIcwcTeams,
  getPublishedIcwcFinalRecordsForCurrentStudent,
  getStudents,
  saveCurrentStudentIcwcReflection,
  saveIcwcFinalRecord,
  saveIcwcStudentReview,
  setIcwcFinalRecordPublished,
  uploadIcwcTeamReportFile,
} from "../../services/database";
import type {
  IcwcDraftDirection,
  IcwcFinalRecord,
  IcwcStudentReview,
  IcwcStudentSubmission,
  IcwcTeam,
  IcwcTeamMember,
  Student,
} from "../../types";
import styles from "./icwc-connected.module.css";

type Role = "TEACHER" | "STUDENT" | "PENDING" | null;
type RequestedRole = "TEACHER" | "STUDENT";
type View = "workspace" | "create-team";

interface ReportInspection {
  teamId: string;
  path: string;
  hasImages: boolean;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

async function apiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `요청 실패 (${response.status})`;
  } catch {
    return `요청 실패 (${response.status})`;
  }
}

function studentNumber(student: Student): string {
  return `${student.grade}${String(student.classNo).padStart(2, "0")}${String(student.studentNo).padStart(2, "0")}`;
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString("ko-KR") : "";
}

function StatusMarker({ complete, label }: { complete: boolean; label: string }) {
  return <span
    aria-label={`${label} ${complete ? "제출 완료" : "미제출"}`}
    className={`${styles.statusMarker} ${complete ? styles.statusComplete : styles.statusPending}`}
    role="img"
    title={`${label} ${complete ? "제출 완료" : "미제출"}`}
  />;
}

type ReportHeadingLevel = "primary" | "secondary";

function isReportTopic(line: string): boolean {
  return /^\s*(?:\[?\s*)?주제\s*[:：]/u.test(line);
}

function reportHeadingLevel(line: string, afterReferences: boolean): ReportHeadingLevel | null {
  const compact = line.replace(/\s+/gu, " ").trim();
  if (/^[<＜\[]?\s*참고\s*문헌\s*[>＞\]]?$/u.test(compact)) return "primary";
  if (afterReferences || compact.length > 62) return null;
  if (/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVXLC]+)\.\s*\S/u.test(compact)) return "primary";
  if (/^\d{1,2}\.\s*(?:연구|이론|탐구|실험|분석|결과|설계|검증|방법|목적|필요성)/u.test(compact)) return "secondary";
  return null;
}

function ExtractedReportViewer({ reportText }: { reportText: string }) {
  const paragraphs = reportText.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  const characterCount = Array.from(reportText).length;
  let referencesStarted = false;
  return <details className={styles.extractedReport}>
    <summary>추출된 보고서 텍스트 보기 <span>{paragraphs.length}문단 · {characterCount.toLocaleString()}자</span></summary>
    <div className={styles.reportReader}>
      {paragraphs.map((paragraph, index) => {
        const level = reportHeadingLevel(paragraph, referencesStarted);
        if (/^[<＜\[]?\s*참고\s*문헌\s*[>＞\]]?$/u.test(paragraph.replace(/\s+/gu, " ").trim())) {
          referencesStarted = true;
        }
        const className = isReportTopic(paragraph)
          ? styles.reportTopic
          : level === "primary"
          ? styles.reportHeadingPrimary
          : level === "secondary"
            ? styles.reportHeadingSecondary
            : styles.reportParagraph;
        return <p key={index} className={className}>{paragraph}</p>;
      })}
    </div>
  </details>;
}

export function IcwcConnectedWorkspace() {
  const [client, setClient] = useState<AppSupabaseClient | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profileName, setProfileName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("STUDENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingRefresh, setPendingRefresh] = useState(0);

  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<IcwcTeam[]>([]);
  const [members, setMembers] = useState<IcwcTeamMember[]>([]);
  const [submissions, setSubmissions] = useState<IcwcStudentSubmission[]>([]);
  const [publishedRecords, setPublishedRecords] = useState<IcwcFinalRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gradeFilter, setGradeFilter] = useState<number | "ALL">("ALL");
  const [view, setView] = useState<View>("workspace");

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamStudentIds, setNewTeamStudentIds] = useState<string[]>([]);
  const [builderGrade, setBuilderGrade] = useState(2);
  const [builderClass, setBuilderClass] = useState<number | "ALL">("ALL");

  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reflection, setReflection] = useState("");
  const [ownSubmission, setOwnSubmission] = useState<IcwcStudentSubmission | null>(null);
  const [review, setReview] = useState<IcwcStudentReview | null>(null);
  const [teacherComment, setTeacherComment] = useState("");
  const [focus, setFocus] = useState<IcwcDraftDirection>("탐구내용 중심");
  const [finalRecord, setFinalRecord] = useState<IcwcFinalRecord | null>(null);
  const [finalText, setFinalText] = useState("");
  const [reportInspection, setReportInspection] = useState<ReportInspection | null>(null);

  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const selectedSubmission = submissions.find(
    (item) => item.teamId === selectedTeamId && item.studentId === selectedStudentId,
  ) ?? null;
  const selectedMembers = members.filter((member) => member.teamId === selectedTeamId);
  const assignedStudentIds = useMemo(
    () => new Set(members.map((member) => member.studentId)),
    [members],
  );
  const builderClasses = useMemo(
    () => [...new Set(students.filter((student) => student.grade === builderGrade).map((student) => student.classNo))].sort((a, b) => a - b),
    [students, builderGrade],
  );
  const builderStudents = students.filter(
    (student) => student.grade === builderGrade && (builderClass === "ALL" || student.classNo === builderClass),
  );

  useEffect(() => {
    try {
      const supabase = createClient();
      setClient(supabase);
      let active = true;
      let anonymousSignOutTimer: number | null = null;
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user.is_anonymous) {
          setUserId(null);
          setAuthReady(false);
          if (anonymousSignOutTimer === null) {
            // Supabase auth calls must run after the synchronous auth callback returns.
            anonymousSignOutTimer = window.setTimeout(() => {
              anonymousSignOutTimer = null;
              void supabase.auth.signOut({ scope: "local" }).then(({ error: signOutError }) => {
                if (!active || !signOutError) return;
                setError(errorText(signOutError));
                setAuthReady(true);
              });
            }, 0);
          }
          return;
        }
        setUserId(session?.user.id ?? null);
        setAuthReady(true);
      });
      return () => {
        active = false;
        if (anonymousSignOutTimer !== null) window.clearTimeout(anonymousSignOutTimer);
        listener.subscription.unsubscribe();
      };
    } catch (caught) {
      setError(errorText(caught));
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!client || !userId) {
      setRole(null);
      return;
    }
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
      } catch (caught) {
        if (active) setError(errorText(caught));
      }
    })();
    return () => { active = false; };
  }, [client, userId, pendingRefresh]);

  async function run(label: string, action: () => Promise<void>): Promise<void> {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  }

  async function refreshWorkspace(): Promise<void> {
    if (!client || (role !== "TEACHER" && role !== "STUDENT")) return;
    if (role === "TEACHER") await ensureCurrentTeacherActivities(client);
    const [teamList, memberList, roster] = await Promise.all([
      getIcwcTeams(client),
      getIcwcTeamMembers(client),
      getStudents(client),
    ]);
    setTeams(teamList);
    setMembers(memberList);
    setStudents(roster);
    setSelectedTeamId((current) => teamList.some((team) => team.id === current) ? current : teamList[0]?.id ?? "");
    if (role === "TEACHER") {
      const submissionList = await getIcwcTeacherSubmissions(client);
      setSubmissions(submissionList);
    } else {
      setPublishedRecords(await getPublishedIcwcFinalRecordsForCurrentStudent(client));
    }
  }

  useEffect(() => {
    if (role !== "TEACHER" && role !== "STUDENT") return;
    void refreshWorkspace().catch((caught) => setError(errorText(caught)));
    // Mutations refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, role]);

  useEffect(() => {
    const first = members.find((member) => member.teamId === selectedTeamId)?.studentId ?? "";
    setSelectedStudentId((current) => members.some(
      (member) => member.teamId === selectedTeamId && member.studentId === current,
    ) ? current : first);
  }, [members, selectedTeamId]);

  useEffect(() => {
    if (!client || role !== "TEACHER" || !selectedTeam?.reportFile) {
      setReportInspection(null);
      return;
    }
    const { id: teamId, reportFile } = selectedTeam;
    let active = true;
    setReportInspection(null);
    void fetch(`/api/icwc-test/report?teamId=${encodeURIComponent(teamId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response));
        return response.json() as Promise<{ hasImages?: unknown }>;
      })
      .then((data) => {
        if (active && typeof data.hasImages === "boolean") {
          setReportInspection({ teamId, path: reportFile.path, hasImages: data.hasImages });
        }
      })
      .catch((caught) => {
        if (active) setError(errorText(caught));
      });
    return () => { active = false; };
  }, [client, role, selectedTeam]);

  useEffect(() => {
    if (!client || role !== "STUDENT" || !selectedTeamId) return;
    void getCurrentStudentIcwcSubmission(client, selectedTeamId).then((saved) => {
      setOwnSubmission(saved);
      setReflection(saved?.reflectionText ?? "");
    }).catch((caught) => setError(errorText(caught)));
  }, [client, role, selectedTeamId]);

  useEffect(() => {
    if (!client || role !== "TEACHER" || !selectedSubmission) {
      setReview(null);
      setTeacherComment("");
      setFocus("탐구내용 중심");
      setFinalRecord(null);
      setFinalText("");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const saved = await getIcwcStudentReview(client, selectedSubmission.id);
        if (!active) return;
        setReview(saved);
        setTeacherComment(saved?.teacherComment ?? "");
        setFocus(saved?.draftFocus ?? "탐구내용 중심");
        if (!saved) return;
        const { data, error: finalError } = await client
          .from("icwc_final_records")
          .select("*")
          .eq("review_id", saved.id)
          .maybeSingle();
        if (finalError) throw finalError;
        if (!active) return;
        const record: IcwcFinalRecord | null = data ? {
          id: data.id,
          reviewId: data.review_id,
          teacherId: data.teacher_id,
          studentId: data.student_id,
          activityId: data.activity_id,
          finalText: data.final_text,
          publishedAt: data.published_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        } : null;
        setFinalRecord(record);
        setFinalText(record?.finalText ?? "");
      } catch (caught) {
        if (active) setError(errorText(caught));
      }
    })();
    return () => { active = false; };
  }, [client, role, selectedSubmission]);

  async function authenticate(): Promise<void> {
    if (!client || !email.trim() || password.length < 6) {
      setError("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    await run("auth", async () => {
      if (authMode === "signup") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { requested_role: requestedRole } },
        });
        if (authError) throw authError;
        setMessage(data.session
          ? `가입되었습니다. 명단 연결용 UID: ${data.user?.id ?? "확인 중"}`
          : "가입되었습니다. 이메일 인증 후 로그인해 주세요.");
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    });
  }

  async function signOut(): Promise<void> {
    if (!client) return;
    await run("signout", async () => {
      const { error: authError } = await client.auth.signOut();
      if (authError) throw authError;
      setRole(null);
      setUserId(null);
      setTeams([]);
    });
  }

  async function createTeam(): Promise<void> {
    if (!client) return;
    if (!newTeamName.trim()) {
      setError("팀 이름을 입력해 주세요.");
      return;
    }
    if (newTeamStudentIds.length < 3 || newTeamStudentIds.length > 4) {
      setError("팀원은 3명 이상 4명 이하로 선택해 주세요.");
      return;
    }
    await run("create-team", async () => {
      const activities = await ensureCurrentTeacherActivities(client);
      const activity = activities.find((item) => item.code === "AUTONOMOUS_ICAN_WECAN");
      if (!activity) throw new Error("ICWC 활동 정보를 찾지 못했습니다.");
      const created = await createIcwcTeam(client, {
        activityId: activity.id,
        teamName: newTeamName,
        studentIds: newTeamStudentIds,
      });
      setNewTeamName("");
      setNewTeamStudentIds([]);
      await refreshWorkspace();
      setSelectedTeamId(created.id);
      setView("workspace");
      setMessage("팀을 만들고 학생들을 배정했습니다.");
    });
  }

  async function submitStudentWork(submit: boolean): Promise<void> {
    if (!client || !selectedTeam) return;
    if (submit && !reflection.trim()) {
      setError("제출하려면 소감문을 입력해 주세요.");
      return;
    }
    const shouldSubmitReport = submit && reportFile !== null;
    const replacesReport = shouldSubmitReport && Boolean(selectedTeam.submittedAt);
    await run(submit ? "submit" : "save-reflection", async () => {
      if (shouldSubmitReport && reportFile) {
        const lowerName = reportFile.name.toLowerCase();
        if (!lowerName.endsWith(".hwp") && !lowerName.endsWith(".docx")) {
          throw new Error("보고서는 HWP 또는 DOCX 파일만 업로드할 수 있습니다.");
        }
        const metadata = await uploadIcwcTeamReportFile(client, {
          teamId: selectedTeam.id,
          originalName: reportFile.name,
          mimeType: lowerName.endsWith(".hwp")
            ? "application/x-hwp"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          body: reportFile,
        });
        const response = await fetch("/api/icwc-test/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: selectedTeam.id, ...metadata }),
        });
        if (!response.ok) throw new Error(await apiError(response));
      }
      const saved = await saveCurrentStudentIcwcReflection(client, {
        teamId: selectedTeam.id,
        reflectionText: reflection.trim(),
        submit,
      });
      setOwnSubmission(saved);
      if (shouldSubmitReport) setReportFile(null);
      await refreshWorkspace();
      setMessage(submit
        ? shouldSubmitReport
          ? replacesReport ? "공통 보고서를 교체하고 소감문을 제출했습니다." : "보고서와 소감문을 제출했습니다."
          : "소감문을 제출했습니다."
        : "소감문을 임시 저장했습니다.");
    });
  }

  async function saveReview(): Promise<void> {
    if (!client || !selectedSubmission) {
      setError("학생이 소감문을 제출한 뒤 검토할 수 있습니다.");
      return;
    }
    await run("review", async () => {
      const saved = await saveIcwcStudentReview(client, {
        submissionId: selectedSubmission.id,
        teacherComment: teacherComment.trim(),
        draftFocus: focus,
      });
      setReview(saved);
      setMessage("교사 코멘트와 초안 방향을 저장했습니다.");
    });
  }

  async function saveFinal(publish: boolean): Promise<void> {
    if (!client || !review || !finalText.trim()) {
      setError("검토를 저장하고 최종 문장을 입력해 주세요.");
      return;
    }
    await run("final", async () => {
      const saved = await saveIcwcFinalRecord(client, review.id, finalText.trim());
      const result = publish ? await setIcwcFinalRecordPublished(client, review.id, true) : saved;
      setFinalRecord(result);
      setMessage(publish ? "최종 문장을 저장하고 학생에게 공개했습니다." : "최종 문장을 저장했습니다.");
    });
  }

  if (!authReady) {
    return <main className={styles.authPage}>
      <div className={styles.authBrand}><span>R</span><strong>Recordly</strong></div>
      <section className={styles.authCard}><p className={styles.subtle}>로그인 상태를 확인하고 있습니다…</p></section>
    </main>;
  }

  if (!userId) {
    return <main className={styles.authPage}>
      <div className={styles.authBrand}><span>R</span><strong>Recordly</strong></div>
      <section className={styles.authCard}>
        <p className={styles.eyebrow}>ICWC 협동심화탐구프로젝트</p>
        <h1>{authMode === "login" ? "다시 만나 반가워요" : "새 계정 만들기"}</h1>
        <p className={styles.subtle}>학생 제출부터 교사 기록까지 한 공간에서 진행합니다.</p>
        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? <div className={styles.message}>{message}</div> : null}
        <div className={styles.tabs}>
          <button className={authMode === "login" ? styles.active : ""} onClick={() => setAuthMode("login")}>로그인</button>
          <button className={authMode === "signup" ? styles.active : ""} onClick={() => setAuthMode("signup")}>회원가입</button>
        </div>
        {authMode === "signup" ? <div className={styles.roleOptions}>
          <button className={requestedRole === "STUDENT" ? styles.selected : ""} onClick={() => setRequestedRole("STUDENT")}>학생</button>
          <button className={requestedRole === "TEACHER" ? styles.selected : ""} onClick={() => setRequestedRole("TEACHER")}>교사</button>
        </div> : null}
        <label>이메일<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>비밀번호<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void authenticate(); }} /></label>
        <button className={styles.primary} disabled={busy === "auth"} onClick={() => void authenticate()}>{busy === "auth" ? "처리 중…" : authMode === "login" ? "로그인" : "가입하기"}</button>
      </section>
    </main>;
  }

  if (role === "PENDING" || role === null) {
    return <main className={styles.authPage}>
      <section className={styles.authCard}>
        <p className={styles.eyebrow}>명단 연결 대기</p>
        <h1>계정을 학교 명단에 연결해 주세요</h1>
        <p className={styles.subtle}>관리자에게 아래 Auth UID를 전달하면 교사 또는 학생 화면이 열립니다.</p>
        <code className={styles.uid}>{userId}</code>
        {error ? <div className={styles.error}>{error}</div> : null}
        <div className={styles.actionRow}>
          <button className={styles.primary} onClick={() => setPendingRefresh((value) => value + 1)}>연결 상태 확인</button>
          <button className={styles.secondary} onClick={() => void signOut()}>로그아웃</button>
        </div>
      </section>
    </main>;
  }

  return <main className={styles.app}>
    <header className={styles.header}>
      <div className={styles.brand}><span>R</span><strong>Recordly</strong><em>ICWC</em></div>
      <div className={styles.account}><strong>{profileName}</strong><span>{role === "TEACHER" ? "담당 교사" : "학생"}</span><button onClick={() => void signOut()}>로그아웃</button></div>
    </header>
    {error ? <div className={styles.toastError} role="alert"><span>{error}</span><button aria-label="오류 알림 닫기" onClick={() => setError("")}>×</button></div> : null}
    {message ? <div className={styles.toast} role="status"><span>{message}</span><button aria-label="알림 닫기" onClick={() => setMessage("")}>×</button></div> : null}

    {role === "TEACHER" && view === "create-team" ? <section className={styles.builderPage}>
      <div className={styles.pageHeading}><div><p className={styles.eyebrow}>새 팀 개설</p><h1>함께 탐구할 학생을 선택하세요</h1></div><button className={styles.secondary} onClick={() => setView("workspace")}>작업공간으로</button></div>
      <div className={styles.builderGrid}>
        <article className={styles.panel}>
          <h2>1. 학년·반 선택</h2>
          <div className={styles.filterRow}>{[1, 2, 3].map((grade) => <button key={grade} className={builderGrade === grade ? styles.filterActive : ""} onClick={() => { setBuilderGrade(grade); setBuilderClass("ALL"); }}>{grade}학년</button>)}</div>
          <div className={styles.filterRow}><button className={builderClass === "ALL" ? styles.filterActive : ""} onClick={() => setBuilderClass("ALL")}>전체</button>{builderClasses.map((classNo) => <button key={classNo} className={builderClass === classNo ? styles.filterActive : ""} onClick={() => setBuilderClass(classNo)}>{classNo}반</button>)}</div>
          <h2>2. 팀원 선택 <small>{newTeamStudentIds.length}/4</small></h2>
          <div className={styles.studentGrid}>{builderStudents.map((student) => {
            const chosen = newTeamStudentIds.includes(student.id);
            const assigned = assignedStudentIds.has(student.id);
            return <button key={student.id} disabled={assigned} className={chosen ? styles.studentSelected : ""} onClick={() => setNewTeamStudentIds((current) => chosen ? current.filter((id) => id !== student.id) : current.length < 4 ? [...current, student.id] : current)}>
              <strong>{student.name}</strong><span>{studentNumber(student)}</span><em>{assigned ? "배정됨" : chosen ? "선택됨" : ""}</em>
            </button>;
          })}</div>
          {!builderStudents.length ? <p className={styles.empty}>해당 학년·반 학생이 없습니다.</p> : null}
        </article>
        <aside className={styles.panel}>
          <h2>3. 팀 정보</h2>
          <label>팀 이름<input value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="예: 반도체 AI 탐구팀" /></label>
          <div className={styles.selectedList}>{newTeamStudentIds.map((id) => {
            const student = students.find((item) => item.id === id);
            return student ? <div key={id}><span>{student.name}</span><small>{studentNumber(student)}</small><button onClick={() => setNewTeamStudentIds((current) => current.filter((studentId) => studentId !== id))}>×</button></div> : null;
          })}</div>
          <p className={styles.helper}>팀원은 최소 3명, 최대 4명입니다.</p>
          <button className={styles.primary} disabled={busy === "create-team" || newTeamStudentIds.length < 3} onClick={() => void createTeam()}>{busy === "create-team" ? "만드는 중…" : "팀 만들기"}</button>
        </aside>
      </div>
    </section> : role === "TEACHER" ? <TeacherWorkspace
      teams={teams}
      members={members}
      students={students}
      selectedTeam={selectedTeam}
      selectedTeamId={selectedTeamId}
      selectedStudent={selectedStudent}
      selectedStudentId={selectedStudentId}
      selectedMembers={selectedMembers}
      selectedSubmission={selectedSubmission}
      submissions={submissions}
      gradeFilter={gradeFilter}
      setGradeFilter={setGradeFilter}
      setSelectedTeamId={setSelectedTeamId}
      setSelectedStudentId={setSelectedStudentId}
      openCreateTeam={() => setView("create-team")}
      teacherComment={teacherComment}
      setTeacherComment={setTeacherComment}
      focus={focus}
      setFocus={setFocus}
      review={review}
      saveReview={() => void saveReview()}
      finalText={finalText}
      setFinalText={setFinalText}
      finalRecord={finalRecord}
      reportHasImages={reportInspection?.teamId === selectedTeam?.id && reportInspection?.path === selectedTeam?.reportFile?.path
        ? reportInspection?.hasImages ?? false
        : false}
      saveFinal={(publish) => void saveFinal(publish)}
      busy={busy}
    /> : <StudentWorkspace
      teams={teams}
      members={members}
      students={students}
      selectedTeam={selectedTeam}
      selectedTeamId={selectedTeamId}
      setSelectedTeamId={setSelectedTeamId}
      reportFile={reportFile}
      setReportFile={setReportFile}
      reflection={reflection}
      setReflection={setReflection}
      ownSubmission={ownSubmission}
      publishedRecords={publishedRecords}
      submit={(value) => void submitStudentWork(value)}
      busy={busy}
    />}
  </main>;
}

interface TeacherWorkspaceProps {
  teams: IcwcTeam[];
  members: IcwcTeamMember[];
  students: Student[];
  selectedTeam: IcwcTeam | null;
  selectedTeamId: string;
  selectedStudent: Student | null;
  selectedStudentId: string;
  selectedMembers: IcwcTeamMember[];
  selectedSubmission: IcwcStudentSubmission | null;
  submissions: IcwcStudentSubmission[];
  gradeFilter: number | "ALL";
  setGradeFilter: (value: number | "ALL") => void;
  setSelectedTeamId: (value: string) => void;
  setSelectedStudentId: (value: string) => void;
  openCreateTeam: () => void;
  teacherComment: string;
  setTeacherComment: (value: string) => void;
  focus: IcwcDraftDirection;
  setFocus: (value: IcwcDraftDirection) => void;
  review: IcwcStudentReview | null;
  saveReview: () => void;
  finalText: string;
  setFinalText: (value: string) => void;
  finalRecord: IcwcFinalRecord | null;
  reportHasImages: boolean;
  saveFinal: (publish: boolean) => void;
  busy: string;
}

function TeacherWorkspace(props: TeacherWorkspaceProps) {
  const visibleTeams = props.teams.filter((team) => {
    if (props.gradeFilter === "ALL") return true;
    return props.members.some((member) => member.teamId === team.id && props.students.find((student) => student.id === member.studentId)?.grade === props.gradeFilter);
  });
  return <div className={styles.teacherWorkspace}>
    <aside className={styles.teamSidebar}>
      <div className={styles.sidebarTitle}><div><p className={styles.eyebrow}>담당 팀</p><h2>ICWC 팀 목록</h2></div><button onClick={props.openCreateTeam}>+ 새 팀</button></div>
      <div className={styles.gradeTabs}>{(["ALL", 1, 2, 3] as const).map((grade) => <button key={grade} className={props.gradeFilter === grade ? styles.active : ""} onClick={() => props.setGradeFilter(grade)}>{grade === "ALL" ? "전체" : `${grade}학년`}</button>)}</div>
      <div className={styles.markerLegend}><span><StatusMarker complete label="보고서" /> 보고서</span><span><StatusMarker complete label="소감문" /> 소감문</span><span><StatusMarker complete={false} label="미제출" /> 미제출</span></div>
      <div className={styles.teamCards}>{visibleTeams.map((team) => {
        const teamMembers = props.members.filter((member) => member.teamId === team.id);
        return <article key={team.id} className={team.id === props.selectedTeamId ? styles.teamSelected : ""}>
          <button className={styles.teamHeading} onClick={() => props.setSelectedTeamId(team.id)}><span>{team.teamName}</span><StatusMarker complete={Boolean(team.submittedAt)} label="공통 보고서" /></button>
          <div className={styles.memberGrid}>{teamMembers.map((member) => {
            const student = props.students.find((item) => item.id === member.studentId);
            const submission = props.submissions.find((item) => item.teamId === team.id && item.studentId === member.studentId);
            return student ? <button key={student.id} className={student.id === props.selectedStudentId ? styles.memberSelected : ""} onClick={() => { props.setSelectedTeamId(team.id); props.setSelectedStudentId(student.id); }}><span className={styles.memberIdentity}><strong>{student.name}</strong><small>{studentNumber(student)}</small></span><StatusMarker complete={Boolean(submission?.submittedAt)} label="개인 소감문" /></button> : null;
          })}</div>
        </article>;
      })}</div>
      {!visibleTeams.length ? <p className={styles.empty}>아직 만든 팀이 없습니다.</p> : null}
    </aside>
    <section className={styles.submissionPanel}>
      <div className={styles.panelTitle}><div><p className={styles.eyebrow}>{props.selectedTeam?.teamName ?? "팀을 선택하세요"}</p><h1>{props.selectedStudent ? `${props.selectedStudent.name} 제출` : "학생을 선택하세요"}</h1></div></div>
      {props.selectedTeam ? <>
        <div className={styles.documentCard}><span>팀 보고서</span><strong>{props.selectedTeam.reportFile?.name ?? "아직 제출되지 않았습니다"}</strong><small>{props.selectedTeam.submittedAt ? dateLabel(props.selectedTeam.submittedAt) : "팀원 중 한 명이 제출할 수 있습니다"}</small></div>
        {props.selectedTeam.reportFile ? <ExtractedReportViewer reportText={props.selectedTeam.reportText} /> : null}
        {props.reportHasImages ? <p className={styles.imageWarning} role="alert">이미지 또는 시각 자료가 포함된 보고서입니다. 이미지 내용은 텍스트로 추출되지 않으므로, 평가 전 원문 파일도 확인해 주세요.</p> : null}
        <article className={styles.reflectionCard}><span>개인 소감문</span><p>{props.selectedSubmission?.reflectionText || "아직 작성된 소감문이 없습니다."}</p><small>{props.selectedSubmission?.submittedAt ? `제출 ${dateLabel(props.selectedSubmission.submittedAt)}` : "제출 대기"}</small></article>
      </> : <p className={styles.empty}>왼쪽 팀 카드에서 학생을 바로 선택하세요.</p>}
    </section>
    <aside className={styles.reviewPanel}>
      <p className={styles.eyebrow}>교사 검토</p><h2>{props.selectedStudent?.name ?? "학생 선택"}</h2>
      <label>교사 코멘트<textarea rows={7} value={props.teacherComment} onChange={(event) => props.setTeacherComment(event.target.value)} placeholder="학생이 맡은 역할과 협업 과정에서 관찰한 점을 적어 주세요." /></label>
      <span className={styles.fieldTitle}>초안 방향</span>
      <div className={styles.focusOptions}><button className={props.focus === "탐구내용 중심" ? styles.focusActive : ""} onClick={() => props.setFocus("탐구내용 중심")}>탐구내용 중심</button><button className={props.focus === "공동체역량 중심" ? styles.focusActive : ""} onClick={() => props.setFocus("공동체역량 중심")}>공동체역량 중심</button></div>
      <button className={styles.secondaryWide} disabled={!props.selectedSubmission || props.busy === "review"} onClick={props.saveReview}>{props.busy === "review" ? "저장 중…" : "코멘트·방향 저장"}</button>
      <button className={styles.aiDisabled} disabled>AI 초안 생성 · 다음 단계에서 연결</button>
      <div className={styles.finalEditor}>
        <div><h3>교사 최종 기록</h3><small>{Array.from(props.finalText).length}자 · {props.finalRecord?.publishedAt ? "학생 공개 중" : "비공개"}</small></div>
        <textarea rows={8} value={props.finalText} onChange={(event) => props.setFinalText(event.target.value)} placeholder="AI 연결 전에는 교사가 직접 입력해 흐름을 테스트할 수 있습니다." />
        <div className={styles.actionRow}><button className={styles.secondary} disabled={!props.review || !props.finalText.trim()} onClick={() => props.saveFinal(false)}>저장</button><button className={styles.primary} disabled={!props.review || !props.finalText.trim()} onClick={() => props.saveFinal(true)}>저장·학생 공개</button></div>
      </div>
    </aside>
  </div>;
}

interface StudentWorkspaceProps {
  teams: IcwcTeam[];
  members: IcwcTeamMember[];
  students: Student[];
  selectedTeam: IcwcTeam | null;
  selectedTeamId: string;
  setSelectedTeamId: (value: string) => void;
  reportFile: File | null;
  setReportFile: (value: File | null) => void;
  reflection: string;
  setReflection: (value: string) => void;
  ownSubmission: IcwcStudentSubmission | null;
  publishedRecords: IcwcFinalRecord[];
  submit: (value: boolean) => void;
  busy: string;
}

function StudentWorkspace(props: StudentWorkspaceProps) {
  const teamMembers = props.members.filter((member) => member.teamId === props.selectedTeamId);
  return <section className={styles.studentWorkspace}>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>내 팀 작업공간</p><h1>ICWC 제출</h1></div>{props.teams.length > 1 ? <select value={props.selectedTeamId} onChange={(event) => props.setSelectedTeamId(event.target.value)}>{props.teams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}</select> : null}</div>
    {!props.selectedTeam ? <div className={styles.panel}><p className={styles.empty}>아직 배정된 팀이 없습니다. 담당 교사에게 팀 배정을 요청하세요.</p></div> : <>
      <div className={styles.studentTeamBar}><div><span>우리 팀</span><strong>{props.selectedTeam.teamName}</strong></div><div>{teamMembers.map((member) => {
        const student = props.students.find((item) => item.id === member.studentId);
        return student ? <span key={student.id}>{student.name}<small>{studentNumber(student)}</small></span> : null;
      })}</div></div>
      <div className={styles.studentSubmitGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}><div><p className={styles.eyebrow}>팀 공통</p><h2>보고서 업로드</h2></div><span className={props.selectedTeam.submittedAt ? styles.statusDone : styles.statusWaiting}>{props.selectedTeam.submittedAt ? "제출 완료" : "제출 전"}</span></div>
          {props.selectedTeam.submittedAt ? <div className={styles.uploadedFile}><strong>{props.selectedTeam.reportFile?.name ?? "보고서"}</strong><small>{dateLabel(props.selectedTeam.submittedAt)}</small><label className={styles.replaceFile}><input type="file" accept=".hwp,.docx" onChange={(event) => props.setReportFile(event.target.files?.[0] ?? null)} /><span>파일 교체</span></label>{props.reportFile ? <em>교체 예정: {props.reportFile.name}</em> : null}</div> : <label className={styles.dropzone}><input type="file" accept=".hwp,.docx" onChange={(event) => props.setReportFile(event.target.files?.[0] ?? null)} /><span>HWP 또는 DOCX 파일 선택</span><small>최대 10MB · 팀원 한 명만 업로드하면 됩니다</small>{props.reportFile ? <strong>{props.reportFile.name}</strong> : null}</label>}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelTitle}><div><p className={styles.eyebrow}>개인 작성</p><h2>나의 소감문</h2></div><span className={props.ownSubmission?.submittedAt ? styles.statusDone : styles.statusWaiting}>{props.ownSubmission?.submittedAt ? "제출 완료" : "작성 중"}</span></div>
          <textarea rows={12} maxLength={5000} value={props.reflection} onChange={(event) => props.setReflection(event.target.value)} placeholder="내가 맡은 역할, 어려웠던 점과 해결 과정, 팀원과 협력한 구체적인 경험을 작성하세요." />
          <div className={styles.counter}>{props.reflection.length}/5,000자</div>
        </article>
      </div>
      <div className={styles.submitActions}><button className={styles.secondary} disabled={Boolean(props.busy)} onClick={() => props.submit(false)}>임시 저장</button><button className={styles.primary} disabled={Boolean(props.busy) || !props.reflection.trim()} onClick={() => props.submit(true)}>{props.busy === "submit" ? "제출 중…" : !props.reportFile ? "소감문 제출" : props.selectedTeam.submittedAt ? "보고서 교체·소감문 제출" : "보고서·소감문 제출"}</button></div>
    </>}
    <section className={styles.resultSection}><p className={styles.eyebrow}>교사 기록</p><h2>공개된 학교생활기록부 내용</h2>{props.publishedRecords.length ? props.publishedRecords.map((record) => <article key={record.id} className={styles.finalResult}><p>{record.finalText}</p><small>{dateLabel(record.publishedAt)}</small></article>) : <p className={styles.empty}>교사가 최종 문장을 공개하면 이곳에서 확인할 수 있습니다.</p>}</section>
  </section>;
}
