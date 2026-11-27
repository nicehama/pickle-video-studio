'use client';

import { useRef, useState } from 'react';
import { projectDuration } from '@/lib/editor-ops';
import { useEditor } from '@/lib/editor-context';
import { createEmptyProject, createSampleProject, SCENES, uid, BGM_PRESETS } from '@/lib/data';
import { SectionTitle, Pill } from '../ui';

export function MediaPanel() {
  const ed = useEditor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const addScene = (key: string, name: string) => {
    ed.commit((p) => ({
      ...p,
      clips: [
        ...p.clips,
        {
          id: uid('v'),
          track: 'video',
          start: Math.round(ed.time.t * 20) / 20,
          duration: 4,
          label: name,
          sceneKey: key,
          mediaId: `sample:${key}`,
          inPoint: 0,
        },
      ],
    }));
    ed.toast(`샘플 씬 "${name}"을 타임라인에 추가했습니다`);
  };

  return (
    <div className="space-y-4 p-3">
      <div>
        <SectionTitle right={<Pill tone="info">로컬 전용</Pill>}>미디어</SectionTitle>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void ed.addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border border-dashed px-3 py-4 text-center transition ${
            over ? 'border-lime-400/60 bg-lime-400/10' : 'border-white/15 bg-white/[0.02] hover:border-white/30'
          }`}
        >
          <div className="text-[18px]">⬆︎</div>
          <div className="mt-1 text-[12px] font-semibold text-slate-200">영상·오디오 업로드</div>
          <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">
            파일은 브라우저 안에만 머뭅니다 · MP4 · MOV · WebM · MP3
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void ed.addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {ed.assets.length > 0 && (
          <ul className="mt-2 space-y-1">
            {ed.assets.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
                <span className="text-[11px]">🎞</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{a.name}</span>
                <span className="font-mono text-[9.5px] text-slate-500">{a.duration.toFixed(1)}s</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle right={<span className="text-[10px] text-slate-500">바로 체험</span>}>샘플 씬</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {SCENES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => addScene(s.key, s.name)}
              className="group relative overflow-hidden rounded-lg border border-white/10 p-2 text-left transition hover:border-white/30"
              style={{ background: `linear-gradient(140deg, ${s.a}, ${s.b})` }}
            >
              <div className="text-[11px] font-semibold text-white/90">{s.name}</div>
              <div className="text-[9px] text-white/50">{s.subject}</div>
              <span className="absolute right-1 top-1 text-[8px] font-bold text-white/0 transition group-hover:text-lime-300">+ 컷</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle right={<Pill tone="ok">자동 덕킹</Pill>}>배경 음악</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {BGM_PRESETS.map((b) => {
            const active = ed.project.clips.some((c) => c.track === 'bgm' && c.bgmPreset === b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  const dur = Math.max(8, projectDuration(ed.project));
                  ed.commit((p) => ({
                    ...p,
                    music: true,
                    clips: [
                      ...p.clips.filter((c) => c.track !== 'bgm'),
                      { id: uid('m'), track: 'bgm', start: 0, duration: dur, label: b.name, bgmPreset: b.id },
                    ],
                  }));
                  ed.toast(`${b.name} BGM을 깔았습니다`);
                }}
                className={`rounded-lg border px-2 py-1.5 text-left transition ${
                  active ? 'border-lime-400/40 bg-lime-400/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
                }`}
              >
                <div className={`text-[11px] font-semibold ${active ? 'text-lime-200' : 'text-slate-200'}`}>{b.name}</div>
                <div className="text-[9px] leading-tight text-slate-500">{b.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle>프로젝트</SectionTitle>
        <input
          className="field"
          value={ed.project.title}
          onChange={(e) => {
            const v = e.target.value;
            ed.commit((p) => ({ ...p, title: v }));
          }}
          placeholder="프로젝트 이름"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="btn text-[11.5px]"
            onClick={() => {
              ed.replaceProject(createSampleProject());
              ed.toast('샘플 프로젝트(롱폼 20초)를 불러왔습니다');
            }}
          >
            샘플 불러오기
          </button>
          <button
            type="button"
            className="btn text-[11.5px]"
            onClick={() => {
              ed.replaceProject(createEmptyProject());
              ed.toast('새 프로젝트를 시작했습니다');
            }}
          >
            새 프로젝트
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">단축키 (PC)</div>
        <ul className="space-y-1 text-[10.5px] text-slate-400">
          {[
            ['Space', '재생 / 일시정지'],
            ['S', '재생 헤드에서 분할'],
            ['Delete', '선택 클립 삭제'],
            ['⌘/Ctrl + Z', '실행 취소'],
            ['⇧ + ⌘/Ctrl + Z', '다시 실행'],
            ['← / →', '0.5초 이동'],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <kbd className="rounded border border-white/15 bg-ink-950/60 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">{k}</kbd>
              <span className="text-right">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
