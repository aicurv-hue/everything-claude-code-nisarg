export default function Loading() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-slate-200 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-48 bg-slate-200 rounded-xl" />)}
      </div>
    </div>
  );
}
