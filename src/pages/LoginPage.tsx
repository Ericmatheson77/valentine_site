import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/viewer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        navigate("/", { replace: true });
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/30 to-cream flex items-center justify-center px-4">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-rose-100/50 p-8 w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <Heart className="w-7 h-7 text-rose-400 fill-rose-200" />
        </div>
        <h1 className="font-display text-xl text-rose-600 font-semibold mb-1">
          Our Love Story
        </h1>
        <p className="text-sm text-rose-400 mb-6">Enter our password to continue</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-xl border border-rose-200 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent mb-3"
            autoFocus
          />
          {error && (
            <p className="text-red-500 text-xs mb-3 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              "Enter"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
