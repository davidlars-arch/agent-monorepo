import Link from "next/link";
import { Terminal } from "lucide-react";

export function UnityRpgShell() {
  return (
    <main className="min-h-screen bg-white px-5 py-5 text-ink sm:px-7 lg:px-9">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-6xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Unity WebGL Slot
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">FF6-inspired RPG</h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-signal hover:text-signal"
          >
            Back to terminal
          </Link>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-h-[560px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 shadow-sm">
            <iframe
              src="/unity-build/index.html"
              title="FF6-inspired RPG Unity WebGL build"
              className="h-[640px] w-full border-0"
              allow="fullscreen; gamepad"
            />
          </div>

          <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-signal" />
              <h2 className="text-base font-semibold">Mount Plan</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <p>Unity project source belongs in `games/ff6-inspired-rpg/unity-project`.</p>
              <p>WebGL build output belongs in `games/ff6-inspired-rpg/webgl-build`.</p>
              <p>This route embeds the generated Unity WebGL build from `apps/web/public/unity-build`.</p>
              <p>The current Unity slice includes title, room, dialogue, battle, and victory states.</p>
            </div>
            <div className="mt-5 rounded-md bg-zinc-950 p-3 font-mono text-xs text-violet-100">
              $ launch games/ff6-inspired-rpg --webgl
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
