export default function Loading() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      <div className="h-8 w-32 bg-slate-200 rounded-lg" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-9 w-24 bg-slate-200 rounded-lg" />)}
      </div>
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-200 rounded-xl" />)}
      </div>
    </div>
  );
}
