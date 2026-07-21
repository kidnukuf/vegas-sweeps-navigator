import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export default function EDStaffLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();

  const loginMutation = trpc.edStaff.login.useMutation({
    onSuccess: () => {
      toast.success("Welcome! Redirecting to the dashboard…");
      // Small delay so the cookie is set before navigation
      setTimeout(() => setLocation("/admin"), 300);
    },
    onError: (e) => toast.error(e.message ?? "Login failed"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎳</div>
          <h1 className="text-2xl font-bold text-yellow-400 tracking-wide">ED Staff Login</h1>
          <p className="text-gray-400 text-sm mt-1">Event Director Portal Access</p>
        </div>

        {/* Login card */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                autoFocus
                className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 focus:border-yellow-500"
              />
            </div>

            <Button
              type="submit"
              disabled={loginMutation.isPending || !username.trim() || !password}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 mt-2"
            >
              {loginMutation.isPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>

        {/* Back link */}
        <p className="text-center text-xs text-gray-600 mt-4">
          <button
            onClick={() => setLocation("/")}
            className="hover:text-gray-400 transition-colors"
          >
            ← Back to home
          </button>
        </p>
      </div>
    </div>
  );
}
