import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ok" | "redirect">("loading");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          setStatus("redirect");
          return;
        }
        const contentType = res.headers.get("Content-Type") || "";
        if (!contentType.includes("application/json")) {
          setStatus("redirect");
          return;
        }
        try {
          const data = await res.json();
          if (data?.role === "viewer" || data?.role === "admin") {
            setStatus("ok");
          } else {
            setStatus("redirect");
          }
        } catch {
          setStatus("redirect");
        }
      })
      .catch(() => {
        setStatus("redirect");
      });
  }, []);

  useEffect(() => {
    if (status === "redirect") {
      navigate("/login", { replace: true });
    }
  }, [status, navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/30 to-cream flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-300 animate-spin" />
      </div>
    );
  }

  if (status === "ok") {
    return <>{children}</>;
  }

  return null;
}
