import { AppError } from "../domain/errors";

export type JobItem = {
  slotId: string;
  slotVersion: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type JobSnapshot = {
  contractVersion: number;
  jobId: string;
  projectId: string;
  status: string;
  items: JobItem[];
};

type CreateItem = { slotId: string; slotVersion: string; force?: boolean };

function config() {
  const baseUrl = process.env.WORKER_URL?.trim().replace(/\/$/, "") ?? "";
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim() ?? "";
  if (!baseUrl) throw new AppError("WORKER_UNAVAILABLE", "批量绘制服务没有启动。已保存的页面和占位没有改动。", 503);
  if (!token) throw new AppError("WORKER_UNAVAILABLE", "内部服务令牌没有配置。批量绘制没有开始。", 503);
  return { baseUrl, token };
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const { baseUrl, token } = config();
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Contract-Version": "1",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AppError("WORKER_UNAVAILABLE", "批量绘制服务没有连上。已保存的页面和占位没有改动。", 503);
  }
}

async function read(response: Response): Promise<JobSnapshot> {
  let body: Partial<JobSnapshot> & { code?: string; message?: string; jobId?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new AppError(body.code || "WORKER_UNAVAILABLE", body.message || "绘制服务拒绝了这次请求。页面没有改动。", response.status, body.jobId);
  }
  if (body.contractVersion !== 1 || !body.jobId) {
    throw new AppError("SCHEMA_MISMATCH", "绘制服务的契约版本不一致。请重新启动同一版本的编辑器和绘制服务。", 412);
  }
  return body as JobSnapshot;
}

export async function createDurableJob(input: { projectId: string; idempotencyKey: string; items: CreateItem[] }): Promise<JobSnapshot> {
  const response = await call("/v1/jobs", {
    method: "POST",
    body: JSON.stringify({ contractVersion: 1, ...input }),
  });
  return read(response);
}

export async function readDurableJob(projectId: string, jobId: string): Promise<JobSnapshot> {
  const response = await call(`/v1/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(projectId)}`, { method: "GET" });
  return read(response);
}

export async function cancelDurableJob(projectId: string, jobId: string): Promise<JobSnapshot> {
  const response = await call(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
  return read(response);
}

export async function retryDurableJob(projectId: string, jobId: string): Promise<JobSnapshot> {
  const response = await call(`/v1/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
  return read(response);
}
