export default function Loading() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 w-36 bg-slate-200 rounded-lg" />
      <div className="h-12 bg-slate-200 rounded-xl" />
      {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
    </div>
  );
}
