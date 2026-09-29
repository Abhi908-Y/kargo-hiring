import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Kargo Hiring" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-teal-700">Kargo</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Hiring</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with Arjun&apos;s account.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
