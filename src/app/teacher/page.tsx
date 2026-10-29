import { redirect } from "next/navigation";

export const metadata = {
  title: "학생부 기록 도우미",
};

export default function TeacherPage() {
  redirect("/icwc-test");
}
