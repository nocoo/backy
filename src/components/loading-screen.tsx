/**
 * Full-screen loading overlay with orbital spinner around the app logo.
 */
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-300">
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex h-48 w-48 items-center justify-center rounded-full bg-secondary dark:bg-[#171717] ring-1 ring-border overflow-hidden p-6">
          <div className="text-4xl font-semibold text-primary font-display">B</div>
        </div>
        {/* Orbital spinner */}
        <div className="absolute inset-[-4px] rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
      </div>
    </div>
  );
}
