"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import type { Activity, ActivityCategory, Student, Teacher, TeacherBootstrapResponse } from "../../types";
import { ActivityWorkspace } from "./ActivityWorkspace";

type FlowStep = "home" | "students" | "activities" | "workspace";
type ClassFilter = string;

let bootstrapRequest: Promise<TeacherBootstrapResponse> | null = null;

function loadTeacherData(): Promise<TeacherBootstrapResponse> {
  if (!bootstrapRequest) {
    bootstrapRequest = (async () => {
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        const { error } = await client.auth.signInAnonymously();
        if (error) throw new Error(`익명 세션을 만들지 못했습니다: ${error.message}`);
      }
      const response = await fetch("/api/teacher/bootstrap", { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          ? (payload as { error?: { message?: string } }).error?.message
          : undefined;
        throw new Error(message ?? "교사 데이터를 불러오지 못했습니다.");
      }
      return payload as TeacherBootstrapResponse;
    })().catch((error: unknown) => {
      bootstrapRequest = null;
      throw error;
    });
  }
  return bootstrapRequest;
}

function categoryLabel(category: ActivityCategory) {
  return category === "AUTONOMOUS" ? "자율활동" : "진로활동";
}

function studentDetail(student: Student) {
  return `${student.grade}학년 ${student.classNo}반 ${student.studentNo}번`;
}

export function TeacherFlow() {
  const [step, setStep] = useState<FlowStep>("home");
  const [data, setData] = useState<TeacherBootstrapResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    void loadTeacherData().then((result) => {
      if (!active) return;
      setData(result);
      setSelectedStudent(result.students[0] ?? null);
      setSelectedActivity(result.activities[0] ?? null);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, []);

  const filteredStudents = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return (data?.students ?? []).filter((student) => {
      const matchesClass = classFilter === "all" || `${student.grade}-${student.classNo}` === classFilter;
      const matchesSearch = !normalized || student.name.toLowerCase().includes(normalized) ||
        String(student.studentNo).includes(normalized);
      return matchesClass && matchesSearch;
    });
  }, [classFilter, searchQuery, data]);

  const groupedActivities = useMemo(() => ({
    AUTONOMOUS: (data?.activities ?? []).filter((activity) => activity.category === "AUTONOMOUS"),
    CAREER: (data?.activities ?? []).filter((activity) => activity.category === "CAREER"),
  }), [data]);

  function openWorkspace(activity = selectedActivity, student = selectedStudent) {
    if (!activity || !student) return;
    setSelectedActivity(activity);
    setSelectedStudent(student);
    setStep("workspace");
  }

  if (loadError) return <div className="app-shell"><main className="page-container"><div className="alert error" role="alert">{loadError}</div><button className="button primary" onClick={() => window.location.reload()}>다시 시도</button></main></div>;
  if (!data) return <div className="app-shell"><main className="page-container loading-state"><i className="spinner" />교사 데이터와 체험 학생 명단을 준비하고 있습니다.</main></div>;
  if (!selectedStudent || !selectedActivity) return <div className="app-shell"><main className="page-container"><div className="alert error">학생 또는 활동이 없습니다.</div></main></div>;

  return <div className="app-shell">
    <Header teacher={data.teacher} active={step === "home" ? "dashboard" : "write"} onDashboard={() => setStep("home")} onWrite={() => setStep("students")} />
    {step === "home" && <HomeScreen teacher={data.teacher} students={data.students} activities={data.activities} records={data.records} onStart={() => setStep("students")} onContinue={openWorkspace} />}
    {step === "students" && <StudentSelection classFilter={classFilter} filteredStudents={filteredStudents}
      searchQuery={searchQuery} selectedStudent={selectedStudent} students={data.students} activities={data.activities} records={data.records} onClassFilter={setClassFilter}
      onSearch={setSearchQuery} onSelect={setSelectedStudent} onNext={() => setStep("activities")} />}
    {step === "activities" && <ActivitySelection groupedActivities={groupedActivities} selectedActivity={selectedActivity}
      selectedStudent={selectedStudent} onBack={() => setStep("students")} onChangeStudent={() => setStep("students")}
      onSelect={setSelectedActivity} onNext={() => openWorkspace()} />}
    {step === "workspace" && <ActivityWorkspace key={`${selectedStudent.id}-${selectedActivity.id}`}
      activity={selectedActivity} student={selectedStudent}
      onBack={() => setStep("activities")} onChangeStudent={() => setStep("students")}
      onSaved={() => { bootstrapRequest = null; void loadTeacherData().then(setData); }} />}
  </div>;
}


function Header({
  teacher,
  active,
  onDashboard,
  onWrite,
}: {
  teacher: Teacher;
  active: "dashboard" | "write";
  onDashboard: () => void;
  onWrite: () => void;
}) {
  return (
    <header className="system-header">
      <button className="brand" type="button" onClick={onDashboard}>
        <span className="brand-icon" aria-hidden="true">▤</span>
        <span>학생부 기록 도우미</span>
      </button>
      <nav className="main-nav" aria-label="주요 메뉴">
        <button className={active === "dashboard" ? "active" : ""} onClick={onDashboard}>대시보드</button>
        <button className={active === "write" ? "active" : ""} onClick={onWrite}>학생부 작성</button>
        <button type="button" onClick={onDashboard}>기록 현황 조회</button>
      </nav>
      <div className="teacher-profile">
        <span>{teacher.name}님</span>
        <span className="badge teacher">교사</span>
      </div>
    </header>
  );
}

function HomeScreen({ teacher, students, activities, records, onStart, onContinue }: {
  teacher: Teacher;
  students: Student[];
  activities: Activity[];
  records: TeacherBootstrapResponse["records"];
  onStart: () => void;
  onContinue: (activity: Activity, student: Student) => void;
}) {
  const pending = records.filter((record) => !record.completed).slice(0, 3);
  const completed = records.filter((record) => record.completed).slice(0, 3);
  function recordCard(record: TeacherBootstrapResponse["records"][number]) {
    const student = students.find((item) => item.id === record.studentId);
    const activity = activities.find((item) => item.id === record.activityId);
    if (!student || !activity) return null;
    return <article className={`record-card ${record.completed ? "completed" : ""}`} key={`${record.studentId}:${record.activityId}`}>
      <div className="card-row"><strong>{student.name} ({studentDetail(student)})</strong><span className={`badge ${activity.category.toLowerCase()}`}>{activity.title}</span></div>
      <div className="card-row"><span className="muted">수정: {new Date(record.updatedAt).toLocaleString("ko-KR")}</span>
        <button className="text-button" onClick={() => onContinue(activity, student)}>{record.completed ? "조회 및 수정" : "이어 쓰기"}</button></div>
    </article>;
  }
  return (
    <main className="page-container">
      <section className="welcome-row">
        <div>
          <h1>{teacher.name}님, 안녕하세요</h1>
          <p>오늘도 성실하고 차분한 학교생활기록부 작성을 응원합니다.</p>
        </div>
        <button className="button primary" onClick={onStart}>학생 기록 작성하기</button>
      </section>

      <section className="section-block">
        <h2>담당 활동 요약</h2>
        <div className="activity-summary-grid">
          {activities.map((activity) => (
            <article className={`summary-card ${activity.category.toLowerCase()}`} key={activity.code}>
              <div className="card-row">
                <span className={`badge ${activity.category.toLowerCase()}`}>{categoryLabel(activity.category)}</span>
                <span className="muted">대상 {students.length}명</span>
              </div>
              <div>
                <h3>{activity.title}</h3>
                <p>{activity.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="record-columns">
        <div className="section-block">
          <h2>작성 중인 기록</h2>
          {pending.length ? pending.map(recordCard) : <div className="empty-state compact">작성 중인 기록이 없습니다.</div>}
        </div>
        <div className="section-block">
          <h2>최근 작성 완료된 기록</h2>
          {completed.length ? completed.map(recordCard) : <div className="empty-state compact">완료된 기록이 없습니다.</div>}
        </div>
      </section>
    </main>
  );
}

function StudentSelection({
  classFilter,
  filteredStudents,
  students,
  activities,
  records,
  searchQuery,
  selectedStudent,
  onClassFilter,
  onSearch,
  onSelect,
  onNext,
}: {
  classFilter: ClassFilter;
  filteredStudents: Student[];
  students: Student[];
  activities: Activity[];
  records: TeacherBootstrapResponse["records"];
  searchQuery: string;
  selectedStudent: Student;
  onClassFilter: (filter: ClassFilter) => void;
  onSearch: (query: string) => void;
  onSelect: (student: Student) => void;
  onNext: () => void;
}) {
  return (
    <main className="page-container student-page">
      <div className="page-title">
        <h1>활동 기록 학생 선택</h1>
        <p>나이스 생활기록부 활동을 작성할 학생을 목록에서 선택하십시오.</p>
      </div>
      <section className="filter-card">
        <div className="chip-group">
          {(["all", ...new Set(students.map((student) => `${student.grade}-${student.classNo}`))]).map((filter) => (
            <button className={`chip ${classFilter === filter ? "selected" : ""}`} key={filter} onClick={() => onClassFilter(filter)}>
              {filter === "all" ? "전체" : `${filter.replace("-", "학년 ")}반`}
            </button>
          ))}
        </div>
        <span className="vertical-divider" />
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="학생 이름 또는 학번을 검색하세요..." />
        </label>
      </section>
      <section className="student-table" aria-label="학생 목록">
        <div className="student-row table-head"><span>이름</span><span>학적 정보</span><span>작성 완료 상태 (자율/진로)</span><span>선택</span></div>
        {filteredStudents.length === 0 ? (
          <div className="empty-state">검색 조건에 맞는 학생이 없습니다.</div>
        ) : filteredStudents.map((student) => {
          const selected = student.id === selectedStudent.id;
          const completeCount = (category: ActivityCategory) => records.filter((record) =>
            record.studentId === student.id && record.completed &&
            activities.some((activity) => activity.id === record.activityId && activity.category === category),
          ).length;
          const autonomousCount = activities.filter((activity) => activity.category === "AUTONOMOUS").length;
          const careerCount = activities.filter((activity) => activity.category === "CAREER").length;
          return (
            <button className={`student-row ${selected ? "selected" : ""}`} key={student.id} onClick={() => onSelect(student)}>
              <span className="student-name">{selected && <i className="active-dot" />}{student.name}</span>
              <span>{studentDetail(student)}</span>
              <span className="status-cell"><span><i className="status-dot blue" />자율활동 ({completeCount("AUTONOMOUS")}/{autonomousCount}개 완료)</span><span><i className="status-dot green" />진로활동 ({completeCount("CAREER")}/{careerCount}개 완료)</span></span>
              <span className={`select-label ${selected ? "selected" : ""}`}>{selected ? "선택됨" : "선택하기"}</span>
            </button>
          );
        })}
      </section>
      <footer className="footer-actions">
        <p>현재 선택된 학생: <strong>{selectedStudent.name}</strong> 학생</p>
        <button className="button primary" onClick={onNext}>다음 단계: 활동 선택하기</button>
      </footer>
    </main>
  );
}

function ActivitySelection({
  groupedActivities,
  selectedActivity,
  selectedStudent,
  onBack,
  onChangeStudent,
  onSelect,
  onNext,
}: {
  groupedActivities: Record<ActivityCategory, Activity[]>;
  selectedActivity: Activity;
  selectedStudent: Student;
  onBack: () => void;
  onChangeStudent: () => void;
  onSelect: (activity: Activity) => void;
  onNext: () => void;
}) {
  return (
    <main className="page-container">
      <StudentRibbon student={selectedStudent} onChangeStudent={onChangeStudent} />
      <section className="activity-groups">
        {(["AUTONOMOUS", "CAREER"] as const).map((category) => (
          <div className="activity-group" key={category}>
            <div className="group-heading"><span className={`badge ${category.toLowerCase()}`}>{categoryLabel(category)}</span><h2>{categoryLabel(category)} 그룹</h2></div>
            {groupedActivities[category].map((activity) => {
              const selected = activity.id === selectedActivity.id;
              return (
                <button className={`activity-card ${category.toLowerCase()} ${selected ? "selected" : ""}`} key={activity.id} onClick={() => onSelect(activity)}>
                  <div className="card-row"><span className={`badge ${category.toLowerCase()}`}>{categoryLabel(category)}</span>{selected && <span className="selected-check">✓ 선택됨</span>}</div>
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                </button>
              );
            })}
          </div>
        ))}
      </section>
      <footer className="footer-actions">
        <button className="button secondary" onClick={onBack}>이전 단계로</button>
        <button className="button primary" onClick={onNext}>기록 작성 및 편집실로 이동</button>
      </footer>
    </main>
  );
}

function StudentRibbon({ student, onChangeStudent }: { student: Student; onChangeStudent: () => void }) {
  return (
    <section className="student-ribbon">
      <span className="avatar" aria-hidden="true">♙</span>
      <div><strong>{student.name} 학생의 활동 기록 작성</strong><span>학년·학적: {studentDetail(student)}</span></div>
      <button className="button secondary" onClick={onChangeStudent}>학생 변경</button>
    </section>
  );
}
