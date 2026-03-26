export default function Loading() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-5 animate-pulse">
      <div className="h-8 w-40 bg-slate-200 rounded-lg" />
      <div className="h-12 bg-slate-200 rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-200 rounded-lg" />)}
      </div>
      <div className="h-40 bg-slate-200 rounded-xl" />
    </div>
  );
}
