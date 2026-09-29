import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Kargo Hiring" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-teal-700">Kargo</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Hiring</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with Arjun&apos;s account.</p>
        </div>
        <LoginForm
          initialError={error === "not_allowed" ? "This account isn't allowed. Only Arjun can sign in." : null}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        />
      </div>
    </main>
  );
}
