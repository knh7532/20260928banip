/**
 * 드릴다운 화면의 토스트 (S3).
 *
 * 컴포넌트 파일과 분리한 이유는 react-refresh 규칙 때문이다 — 한 파일이 컴포넌트와
 * 훅을 함께 내보내면 fast refresh가 동작하지 않는다.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function useToast(): [ReactNode, (message: ReactNode, ms?: number) => void] {
  const [message, setMessage] = useState<ReactNode>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: ReactNode, ms = 4000) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = message === null ? null : (
    <div className="sqm-toast" role="status">{message}</div>
  );
  return [node, show];
}
