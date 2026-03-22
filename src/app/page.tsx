import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#050505] text-white overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-4xl w-full text-center space-y-8 animate-fade-in">
        <div className="inline-block px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm font-medium mb-4">
          <span className="text-primary mr-2">New</span> LinkedIn Automation Platform
        </div>

        <h1 className="text-6xl font-bold tracking-tight sm:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
          Scale Your Presence <br /> with Smart AI
        </h1>

        <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
          The ultimate engine for Personal Branding and Corporate Growth.
          Research, generate, and schedule LinkedIn posts with the power of advanced AI.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-primary hover:bg-accent text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-primary/25 active:scale-95"
          >
            Get Started Free
          </Link>
          <Link
            href="/dashboard/create"
            className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl border border-white/10 transition-all backdrop-blur-sm"
          >
            Create a Post
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-20 text-left">
          <Link href="/dashboard" className="glass-card p-8 space-y-4 hover:border-primary/30 transition-colors">
            <h3 className="text-xl font-bold text-primary">Individual</h3>
            <p className="text-white/50">Elevate your personal brand with AI-driven content that resonates with your professional network.</p>
          </Link>
          <Link href="/dashboard" className="glass-card p-8 space-y-4 hover:border-primary/30 transition-colors">
            <h3 className="text-xl font-bold text-primary">Corporate</h3>
            <p className="text-white/50">Manage company page presence with automated industry research and metric-focused posting.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
