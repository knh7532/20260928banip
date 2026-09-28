/**
 * 라이선스 만료 판정 (2026-08-10).
 *
 * 화면 파일이 아니라 여기 두는 이유는 둘이다. 순수 함수라 테스트에서 시각을 주입해
 * 검증할 수 있고, 컴포넌트 파일이 컴포넌트 아닌 것을 export하면 Fast Refresh가 깨진다.
 */

/** 만료 임박 기준 90일 — 계약 갱신 리드타임이 보통 분기 단위라 그 앞에서 알아야 한다. */
export const LICENSE_WARN_DAYS = 90;

export interface LicenseState {
  tone: "muted" | "green" | "orange" | "red";
  /** 남은 일수. 지났으면 음수, 값이 없으면 `NaN`. */
  days: number;
  label: string;
}

/**
 * 만료까지 남은 기간 → 색과 문구.
 *
 * 값이 없을 때(`NaN`)를 "만료됨"으로 접지 않는다 — 조회 실패와 만료는 전혀 다른 상황이고,
 * 섞으면 멀쩡한 라이선스에 빨간불이 켜진다.
 */
export function licenseState(expirySec: number, nowMs: number = Date.now()): LicenseState {
  if (!Number.isFinite(expirySec)) return { tone: "muted", days: NaN, label: "--" };

  const days = Math.floor((expirySec * 1000 - nowMs) / 86_400_000);
  if (days < 0) return { tone: "red", days, label: `${-days}일 지남` };
  if (days <= LICENSE_WARN_DAYS) return { tone: "orange", days, label: `${days}일 남음` };
  return { tone: "green", days, label: `${days}일 남음` };
}
