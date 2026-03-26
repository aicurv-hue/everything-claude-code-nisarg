export default function Loading() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 w-36 bg-slate-200 rounded-lg" />
      {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
    </div>
  );
}
