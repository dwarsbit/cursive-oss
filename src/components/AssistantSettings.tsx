import { Loader2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isDesktop, openExternal } from "@scholarkit/editor/lib/platform";
import { BUTTON } from "@scholarkit/editor/components/Dialog";
import type { AssistantLayout } from "@scholarkit/assistant";
import {
  assistantSnapshot,
  choosable,
  isLocalUrl,
  NO_ASSISTANT,
  providerById,
  receiverOf,
  saveAssistant,
  sourceOf,
  subscribeAssistant,
  type AssistantSettings as Settings,
  type AssistantSource,
} from "@/lib/assistant/providers";
import { hasKey, listModels, setKey } from "@/lib/assistant/transport";
import { t, tn } from "@scholarkit/i18n";
import { Select } from "@scholarkit/editor/components/Select";

const FIELD =
  "h-7 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring";
const OTHER = "__other__";

type Loaded =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; models: string[] }
  | { state: "error"; message: string };

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The assistant's settings: our model or a provider with your own key, or
 * a model on this computer, and how it shows. Says where your text goes.
 */
export function AssistantSettings({
  account = false,
}: {
  /** Whether a Scholarkit account is signed in: our model needs one. */
  account?: boolean;
}) {
  const settings = useSyncExternalStore(subscribeAssistant, assistantSnapshot);
  const source = sourceOf(settings, account);
  const ours = source === "scholarkit";
  // The provider's fields show while it answers, or when there is no account.
  const provider = ours ? null : providerById(settings.provider);
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });
  const [keyKept, setKeyKept] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = (next: Partial<Settings>) => saveAssistant({ ...settings, ...next });

  // Whether a key is kept for the provider: asked of the credential store.
  useEffect(() => {
    let current = true;
    if (provider && isDesktop)
      void hasKey(provider.id).then((kept) => current && setKeyKept(kept));
    return () => {
      current = false;
    };
  }, [provider]);

  const load = async (from: Settings) => {
    if (!from.baseUrl.trim()) return;
    setLoaded({ state: "loading" });
    try {
      setLoaded({ state: "ok", models: await listModels(from) });
    } catch (error) {
      setLoaded({ state: "error", message: messageOf(error) });
    }
  };

  const choose = (id: string) => {
    const next = providerById(id);
    setLoaded({ state: "idle" });
    setTyping(false);
    setKeyKept(null);
    if (!next) {
      saveAssistant({
        ...NO_ASSISTANT,
        source: settings.source,
        layout: settings.layout,
      });
      return;
    }
    const saved: Settings = {
      ...settings,
      provider: next.id,
      baseUrl: next.baseUrl ?? "",
      model: next.models[0] ?? "",
    };
    saveAssistant(saved);
    if (!next.needsKey && next.baseUrl) void load(saved);
  };

  const keepKey = async (value: string) => {
    if (!provider || !value.trim()) return;
    setProblem(null);
    try {
      await setKey(provider.id, value);
      setKeyKept(true);
      void load(settings);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const forgetKey = async () => {
    if (!provider) return;
    try {
      await setKey(provider.id, "");
      setKeyKept(false);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const known = provider?.models ?? [];
  const fetched = loaded.state === "ok" ? loaded.models : [];
  const options = [...known, ...fetched.filter((m) => !known.includes(m))];
  const listed = settings.model !== "" && options.includes(settings.model);
  const other = typing || (settings.model !== "" && !listed);
  const receiver = receiverOf(settings, account);
  const local = provider !== null && !provider.needsKey && provider.id !== "custom";

  return (
    <section>
      <h3 className="text-[13px] font-medium">{t("Assistant")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          "The assistant rewrites what you select, finds papers to cite and checks your references. Every change is a card you apply, or not.",
        )}{" "}
        {account
          ? t(
              "It runs on our model with Plus and Pro, or on your own provider or a model on this computer.",
            )
          : isDesktop
            ? t(
                "Without a Scholarkit account, it runs on your own provider or a model on this computer.",
              )
            : t(
                "In the browser it works with a model on this computer; for a provider, use the desktop app.",
              )}
      </p>
      <div className="settings-grid mt-2">
        {account && (
          <>
            <label htmlFor="assistant-source">{t("Answers from")}</label>
            <Select
              id="assistant-source"
              className={FIELD}
              value={source}
              options={[
                { value: "scholarkit", label: t("Scholarkit AI (Plus and Pro)") },
                {
                  value: "own",
                  label: isDesktop
                    ? t("Your provider or a model on this computer")
                    : t("A model on this computer"),
                },
              ]}
              onChange={(next) => save({ source: next as AssistantSource })}
            />
          </>
        )}
        <label htmlFor="assistant-layout">{t("Show it as")}</label>
        <Select
          id="assistant-layout"
          className={FIELD}
          value={settings.layout}
          options={[
            { value: "floating", label: t("A bar over the page") },
            { value: "docked", label: t("A panel on the right") },
          ]}
          onChange={(next) => save({ layout: next as AssistantLayout })}
        />
      </div>
      {ours ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "What the assistant reads for your question goes to our model, hosted by Mistral in the EU. It isn't kept or used for training.",
          )}
        </p>
      ) : (
        <>
          <div className="settings-grid mt-2">
            <label htmlFor="assistant-provider">{t("Provider")}</label>
            <Select
              id="assistant-provider"
              className={FIELD}
              value={provider?.id ?? ""}
              options={[
                { value: "", label: t("Off") },
                ...choosable().map((p) => ({
                  value: p.id as string,
                  label:
                    !p.needsKey && p.id !== "custom"
                      ? `${p.name} ${t("(on this computer)")}`
                      : p.name,
                })),
              ]}
              onChange={choose}
            />

            {provider?.id === "custom" && (
              <>
                <label htmlFor="assistant-url">{t("Address")}</label>
                <input
                  id="assistant-url"
                  key={`url:${settings.baseUrl}`}
                  className={FIELD}
                  placeholder="https://example.com/v1"
                  defaultValue={settings.baseUrl}
                  onBlur={(event) => {
                    const baseUrl = event.target.value.trim();
                    if (baseUrl !== settings.baseUrl) save({ baseUrl });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </>
            )}

            {provider &&
              isDesktop &&
              (provider.needsKey || provider.id === "custom") && (
                <>
                  <label htmlFor="assistant-key">{t("API key")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="assistant-key"
                      key={`key:${provider.id}:${keyKept}`}
                      type="password"
                      autoComplete="off"
                      className={FIELD}
                      placeholder={
                        keyKept
                          ? t("A key is kept")
                          : provider.needsKey
                            ? t("Paste your key")
                            : t("None")
                      }
                      onBlur={(event) => void keepKey(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                    {keyKept && (
                      <button
                        type="button"
                        className="h-7 flex-none text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => void forgetKey()}
                      >
                        {t("Forget")}
                      </button>
                    )}
                  </div>
                </>
              )}

            {provider && (
              <>
                <label htmlFor="assistant-model">{t("Model")}</label>
                <div className="flex flex-col gap-1.5">
                  <Select
                    id="assistant-model"
                    className={FIELD}
                    value={other ? OTHER : listed ? settings.model : ""}
                    placeholder={t("Choose a model")}
                    options={[
                      ...options.map((m) => ({ value: m, label: m })),
                      { value: OTHER, label: t("Other…") },
                    ]}
                    onChange={(model) => {
                      if (model === OTHER) {
                        setTyping(true);
                        return;
                      }
                      setTyping(false);
                      save({ model });
                    }}
                  />
                  {other && (
                    <input
                      key={`model:${settings.model}`}
                      className={FIELD}
                      aria-label={t("Model name")}
                      placeholder={t("Model name")}
                      autoFocus={typing}
                      defaultValue={listed ? "" : settings.model}
                      onBlur={(event) => {
                        const model = event.target.value.trim();
                        if (model && model !== settings.model) save({ model });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {provider && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <button
                type="button"
                className={BUTTON}
                disabled={loaded.state === "loading" || !settings.baseUrl.trim()}
                onClick={() => void load(settings)}
              >
                {loaded.state === "loading" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    {t("Checking…")}
                  </span>
                ) : (
                  t("Check the connection")
                )}
              </button>
              <span
                role="status"
                className={
                  loaded.state === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {loaded.state === "ok"
                  ? tn(
                      loaded.models.length,
                      "Connected. {count} model to choose from.",
                      "Connected. {count} models to choose from.",
                    )
                  : loaded.state === "error"
                    ? local
                      ? t("{name} didn't answer. Is it running?", {
                          name: provider.name,
                        })
                      : loaded.message
                    : ""}
              </span>
              {provider.keyUrl && (
                <button
                  type="button"
                  className="text-tint-foreground underline-offset-2 hover:underline"
                  onClick={() => openExternal(provider.keyUrl!)}
                >
                  {t("Get a key")}
                </button>
              )}
            </div>
          )}

          {provider && (
            <p className="mt-2 text-xs text-muted-foreground">
              {!isDesktop && !isLocalUrl(settings.baseUrl)
                ? t(
                    "In the browser, the assistant needs an address on this computer, such as http://localhost:11434/v1.",
                  )
                : receiver
                  ? t(
                      "The pages the assistant reads go to {receiver}. Your key is kept in your system's credential store and sent only there.",
                      { receiver },
                    )
                  : t("The model runs on this computer. Nothing leaves it.")}
            </p>
          )}
          {problem && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {problem}
            </p>
          )}
        </>
      )}
    </section>
  );
}
