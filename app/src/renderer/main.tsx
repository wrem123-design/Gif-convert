import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/app.css";

interface RootErrorBoundaryState {
  error: Error | null;
}

class RootErrorBoundary extends React.Component<React.PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Renderer crash:", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f131c",
          color: "#f5f7fb",
          padding: "32px"
        }}
      >
        <div
          style={{
            width: "min(720px, 100%)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(15, 23, 42, 0.96)",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)"
          }}
        >
          <strong style={{ fontSize: "18px" }}>렌더러 오류로 화면을 표시하지 못했습니다.</strong>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>
            앱은 실행 중이지만 렌더러에서 예외가 발생했습니다. 아래 메시지를 확인한 뒤 새로고침하거나 앱을 다시 실행하세요.
          </p>
          <pre
            style={{
              margin: 0,
              padding: "14px",
              overflow: "auto",
              borderRadius: "12px",
              background: "#020617",
              color: "#fda4af",
              fontSize: "12px",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {this.state.error.stack || this.state.error.message}
          </pre>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
