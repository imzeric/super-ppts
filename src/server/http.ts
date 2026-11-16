import { AppError } from "../domain/errors";

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  console.error("request failed");
  return Response.json({ code: "INTERNAL", message: "内部错误，请重试。" }, { status: 500 });
}
