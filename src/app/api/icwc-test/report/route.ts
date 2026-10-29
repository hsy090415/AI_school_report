import { AiRequestError } from "../../../../lib/ai/errors";
import { aiErrorResponse, readJson } from "../../../../lib/ai/http";
import { extractIcwcReportText, hasIcwcReportImages } from "../../../../lib/files/icwc-report";
import { createClient } from "../../../../lib/supabase/server";
import { getIcwcTeamById, saveIcwcTeamReport } from "../../../../services/database";

interface ReportRequest {
  teamId?: unknown;
  path?: unknown;
  name?: unknown;
  sizeBytes?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request)) as ReportRequest;
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sizeBytes = body.sizeBytes;
    const extension = name.toLowerCase().split(".").pop();
    if (!/^[a-f\d-]{36}$/iu.test(teamId) || !name || (extension !== "hwp" && extension !== "docx")) {
      throw new AiRequestError("INVALID_REQUEST", "팀과 HWP/DOCX 보고서 정보를 확인해 주세요.");
    }
    if (!path.startsWith(`icwc/${teamId}/`) || !path.endsWith(`.${extension}`) || path.slice(`icwc/${teamId}/`.length).includes("/")) {
      throw new AiRequestError("INVALID_REQUEST", "보고서 파일 경로가 올바르지 않습니다.");
    }
    if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024) {
      throw new AiRequestError("INVALID_REQUEST", "보고서 크기는 10MB 이하여야 합니다.");
    }

    const client = await createClient();
    const team = await getIcwcTeamById(client, teamId);
    if (!team) return Response.json({ error: { message: "접근 가능한 ICWC 팀을 찾을 수 없습니다." } }, { status: 403 });

    const { data: file, error: downloadError } = await client.storage.from("student-reports").download(path);
    if (downloadError || !file) return Response.json({ error: { message: "업로드한 보고서를 읽을 수 없습니다." } }, { status: 400 });
    if (file.size !== sizeBytes) throw new AiRequestError("INVALID_REQUEST", "보고서 파일 크기가 일치하지 않습니다.");

    const reportText = extractIcwcReportText(new Uint8Array(await file.arrayBuffer()), name);
    const mimeType = extension === "hwp"
      ? "application/x-hwp"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const saved = await saveIcwcTeamReport(client, {
      teamId,
      reportText,
      file: { path, name: name.slice(0, 255), mimeType, sizeBytes },
      submit: true,
    });
    if (team.reportFile?.path && team.reportFile.path !== path) {
      // The new document is already safely stored and referenced by the team.
      // A cleanup failure must not undo a successful replacement.
      await client.storage.from("student-reports").remove([team.reportFile.path]);
    }
    return Response.json({
      team: saved,
      extractedCharacters: Array.from(reportText).length,
      replaced: Boolean(team.reportFile?.path),
    });
  } catch (error) {
    if (error instanceof AiRequestError) return aiErrorResponse(error);
    return Response.json({ error: { message: "보고서 제출에 실패했습니다. 로그인 상태와 팀 연결을 확인해 주세요." } }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() ?? "";
    if (!/^[a-f\d-]{36}$/iu.test(teamId)) {
      throw new AiRequestError("INVALID_REQUEST", "팀 정보를 확인해 주세요.");
    }

    const client = await createClient();
    const team = await getIcwcTeamById(client, teamId);
    if (!team?.reportFile) {
      return Response.json({ error: { message: "제출된 팀 보고서를 찾을 수 없습니다." } }, { status: 404 });
    }

    const { data: file, error: downloadError } = await client.storage
      .from("student-reports")
      .download(team.reportFile.path);
    if (downloadError || !file) {
      return Response.json({ error: { message: "제출된 보고서를 읽을 수 없습니다." } }, { status: 400 });
    }

    return Response.json({
      hasImages: hasIcwcReportImages(new Uint8Array(await file.arrayBuffer()), team.reportFile.name),
    });
  } catch (error) {
    if (error instanceof AiRequestError) return aiErrorResponse(error);
    return Response.json({ error: { message: "보고서의 이미지 포함 여부를 확인하지 못했습니다." } }, { status: 500 });
  }
}
