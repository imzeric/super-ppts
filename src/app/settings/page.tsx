"use client";

import { useEffect, useState } from "react";
import { Frame } from "@/components/Frame";
import { readJson } from "@/lib/model";

type Profile = { capability: "text" | "vision" | "image"; baseUrl: string; model: string; hasKey: boolean; keyMask: string | null; source: string };

const COPY = {
  text: "文本规划",
  vision: "视觉理解",
  image: "插图生成",
} as const;

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { baseUrl: string; model: string; apiKey: string }>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function apply(next: Profile[]) {
    setProfiles(next);
    setDrafts(Object.fromEntries(next.map((profile) => [profile.capability, { baseUrl: profile.baseUrl, model: profile.model, apiKey: "" }])));
  }

  useEffect(() => {
    void fetch("/api/settings")
      .then((response) => readJson<{ profiles: Profile[] }>(response))
      .then((body) => apply(body.profiles))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <Frame step="settings">
      <section className="sheet">
        <p className="kicker">接口</p>
        <h1>第三方模型只保存在这台机器。</h1>
        <p className="lede">文本和视觉走 OpenAI 兼容的 chat/completions。视觉请求会带上 image_url。插图走 images/generations，只要 b64_json。密钥留空不会覆盖已保存的值。清除是单独动作。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {profiles.map((profile) => {
          const draft = drafts[profile.capability] ?? { baseUrl: "", model: "", apiKey: "" };
          return (
            <article className="section-card" key={profile.capability}>
              <h2>{COPY[profile.capability]}</h2>
              <p className="meta" aria-label={`${COPY[profile.capability]}密钥状态`}>
                {profile.hasKey ? `密钥${profile.keyMask}，来源 ${profile.source}` : "未设置密钥"}
              </p>
              <label>
                {COPY[profile.capability]}地址
                <input aria-label={`${COPY[profile.capability]}地址`} value={draft.baseUrl} onChange={(event) => setDrafts({ ...drafts, [profile.capability]: { ...draft, baseUrl: event.target.value } })} />
              </label>
              <label>
                {COPY[profile.capability]}模型
                <input aria-label={`${COPY[profile.capability]}模型`} value={draft.model} onChange={(event) => setDrafts({ ...drafts, [profile.capability]: { ...draft, model: event.target.value } })} />
              </label>
              <label>
                {COPY[profile.capability]}密钥
                <input aria-label={`${COPY[profile.capability]}密钥`} type="password" value={draft.apiKey} placeholder="留空则不修改已保存的密钥" onChange={(event) => setDrafts({ ...drafts, [profile.capability]: { ...draft, apiKey: event.target.value } })} />
              </label>
              <div className="row">
                <button
                  className="seal"
                  type="button"
                  onClick={() =>
                    void fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ capability: profile.capability, baseUrl: draft.baseUrl, model: draft.model, apiKey: draft.apiKey }),
                    })
                      .then((response) => readJson<Profile>(response))
                      .then(async (saved) => {
                        const all = await readJson<{ profiles: Profile[] }>(await fetch("/api/settings"));
                        apply(all.profiles);
                        setNotice(`${COPY[saved.capability]}已保存。`);
                      })
                      .catch((reason: Error) => setError(reason.message))
                  }
                >
                  保存{COPY[profile.capability]}
                </button>
                <button
                  className="quiet"
                  type="button"
                  onClick={() =>
                    void fetch("/api/settings/clear", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ capability: profile.capability }),
                    })
                      .then(async (response) => {
                        await readJson(response);
                        apply((await readJson<{ profiles: Profile[] }>(await fetch("/api/settings"))).profiles);
                        setNotice(`${COPY[profile.capability]}密钥已清除。`);
                      })
                      .catch((reason: Error) => setError(reason.message))
                  }
                >
                  清除{COPY[profile.capability]}密钥
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </Frame>
  );
}
