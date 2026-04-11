import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <span className="font-bold text-xl text-slate-900">Cridl</span>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg">
              Sign in
            </Link>
            <Link href="/dashboard" className="text-sm bg-[#0A66C2] text-white px-4 py-2 rounded-lg hover:bg-[#0854a0] transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-sm font-medium text-[#0A66C2] mb-3">AI LinkedIn Ghostwriter</p>
            <h1 className="text-5xl font-bold text-slate-900 leading-tight mb-6">
              Your LinkedIn presence,<br />on autopilot.
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-md">
              Cridl researches, writes, and schedules LinkedIn posts in your voice — so you show up consistently without the effort.
            </p>
            <div className="flex gap-4">
              <Link href="/dashboard" className="bg-[#0A66C2] text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-[#0854a0] transition-colors">
                Start writing free
              </Link>
              <Link href="/login" className="border border-slate-200 text-slate-700 px-6 py-3 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Sign in
              </Link>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#0A66C2] flex items-center justify-center text-white text-xs font-bold">N</div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Neel · AI Ghostwriter</p>
                <p className="text-xs text-slate-400">Generating your post...</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed mb-4">
              <p>Three years ago I almost quit.</p>
              <p className="mt-2">Not because the work was hard — but because I felt invisible on LinkedIn.</p>
              <p className="mt-2">Here&apos;s what changed everything...</p>
            </div>
            <div className="flex gap-2">
              <span className="text-xs bg-blue-50 text-[#0A66C2] px-3 py-1 rounded-full font-medium">Storytelling</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full">Scheduled · Tue 9am</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Strip */}
      <section className="py-16 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#0A66C2]">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.606 10.606Z" />
            </svg>
            <h3 className="text-base font-semibold text-slate-900 mt-3 mb-1">Deep research, instantly</h3>
            <p className="text-sm text-slate-500">Cridl synthesizes trends, keywords, and your niche into a post brief before a single word is written.</p>
          </div>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#0A66C2]">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            <h3 className="text-base font-semibold text-slate-900 mt-3 mb-1">Written in your voice</h3>
            <p className="text-sm text-slate-500">Neel, our AI ghostwriter, learns your tone, style, and stories over time — no generic AI output.</p>
          </div>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-[#0A66C2]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <h3 className="text-base font-semibold text-slate-900 mt-3 mb-1">Publish at the right time</h3>
            <p className="text-sm text-slate-500">Queue posts, run multi-week campaigns, and let Cridl publish automatically while you focus elsewhere.</p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-12 text-center">
          <div>
            <p className="text-3xl font-bold text-slate-900">500+</p>
            <p className="text-sm text-slate-500 mt-1">Posts published</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">3×</p>
            <p className="text-sm text-slate-500 mt-1">Faster content</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">2-in-1</p>
            <p className="text-sm text-slate-500 mt-1">Individual + Corporate</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">100%</p>
            <p className="text-sm text-slate-500 mt-1">Your voice</p>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-[#0A66C2]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Start building your LinkedIn presence today.</h2>
          <p className="text-blue-100 mb-8">Free to start. No credit card required.</p>
          <Link href="/dashboard" className="bg-white text-[#0A66C2] px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors inline-block">
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <span className="text-sm text-slate-400">© 2026 Cridl. All rights reserved.</span>
          <span className="text-sm text-slate-400">app.cridl.com</span>
        </div>
      </footer>
    </>
  );
}
