export default function Loading() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 w-40 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
      </div>
      <div className="h-96 bg-slate-200 rounded-xl" />
    </div>
  );
}
