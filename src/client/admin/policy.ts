import type { DuplicatePolicy, StatusResponse } from "../types";

export function resolveDuplicatePolicy(status: StatusResponse | null): DuplicatePolicy {
  if (
    status?.duplicatePolicy === "allow" ||
    status?.duplicatePolicy === "queue" ||
    status?.duplicatePolicy === "played"
  ) {
    return status.duplicatePolicy;
  }
  return status?.allowDuplicateRequests === false ? "queue" : "allow";
}

export function dupPolicyToast(policy: DuplicatePolicy): string {
  if (policy === "queue") return "대기열 중복만 차단합니다.";
  if (policy === "played") {
    return "이번 방송에서 부른 곡도 차단합니다. 대기열 비우기로 초기화됩니다.";
  }
  return "중복 신청을 허용합니다.";
}
