"use client";

import { useMemo, useRef, useState } from "react";

type Mode = "image" | "video" | "music" | "voice" | "avatar";
type ReferenceKind = "images" | "videos" | "audio";
type ReferenceFiles = Record<ReferenceKind, string[]>;
type IconName =
  | Mode
  | "sparkle"
  | "arrow"
  | "chevron"
  | "magic"
  | "upscale"
  | "remove"
  | "expand"
  | "cube"
  | "layers"
  | "cut"
  | "menu"
  | "close"
  | "play"
  | "check"
  | "sliders";

const modes: { id: Mode; label: string; placeholder: string }[] = [
  { id: "image", label: "Image", placeholder: "Describe the world you want to create..." },
  { id: "video", label: "Video", placeholder: "Describe a scene, camera move, mood and action..." },
  { id: "music", label: "Music", placeholder: "Describe the sound, emotion, voice and energy..." },
  { id: "voice", label: "Voice", placeholder: "Write what your cinematic voice should say..." },
  { id: "avatar", label: "Avatar", placeholder: "Describe your presenter, performance and setting..." },
];

const modelMap: Record<Mode, string[]> = {
  image: ["GPT Image 2", "Nano Banana 2", "Nano Banana Pro", "Nano Banana 2 Lite", "Luma UNI-1.1", "FLUX Pro"],
  video: ["Seedance 2.0 Standard", "Seedance 2.0 Fast", "Seedance 2.0 Mini", "Kling 3.0 Omni", "Kling 3.0", "Happy Horse 1.1", "Sora 2", "Veo 3.1", "Runway Gen-4.5", "Luma Ray3.2", "Luma Ray3.14"],
  music: ["Lyria 3", "AudioFlow", "Suno", "Udio", "Score Composer"],
  voice: ["GPT Realtime Voice", "ElevenLabs", "Voice Forge", "Multilingual Pro"],
  avatar: ["HeyGen Avatar IV", "Avatar One", "Digital Twin", "Performance Capture"],
};

const promptIdeas: Record<Mode, string> = {
  image: "A lone queen facing a molten celestial horizon, midnight landscape, cinematic 65mm film",
  video: "A masked rider enters a rain-soaked neon tunnel, low tracking shot, grounded IMAX realism",
  music: "Epic romantic rock anthem, soaring male vocal, live drums, cinematic strings, unforgettable hook",
  voice: "Some worlds are discovered. The greatest ones are imagined.",
  avatar: "Elegant Indian film director presenting a cinematic AI universe in a dark golden studio",
};

const toolGroups = [
  {
    icon: "image" as IconName,
    label: "Image Studio",
    description: "GPT Image, Nano Banana and frontier image engines for generation, editing and consistent visual worlds.",
    accent: "gold",
    meta: "6 frontier models",
  },
  {
    icon: "video" as IconName,
    label: "Video Studio",
    description: "Multimodal text, image, audio and video generation with native sound, storyboards and character lock.",
    accent: "coral",
    meta: "11 video engines",
  },
  {
    icon: "music" as IconName,
    label: "Music Lab",
    description: "Original songs, cinematic scores, stems, sound design and intelligent mastering.",
    accent: "violet",
    meta: "8 engines",
  },
  {
    icon: "voice" as IconName,
    label: "Voice Forge",
    description: "Natural multilingual speech, dubbing, voice design and emotional direction.",
    accent: "blue",
    meta: "32 languages",
  },
  {
    icon: "avatar" as IconName,
    label: "Avatar Director",
    description: "Build digital presenters, talking characters and lip-synced performances.",
    accent: "pearl",
    meta: "Real-time",
  },
  {
    icon: "magic" as IconName,
    label: "Magic Editor",
    description: "Remove, replace, relight, expand, upscale and transform in one visual workspace.",
    accent: "emerald",
    meta: "20+ tools",
  },
];

const quickTools: { icon: IconName; label: string; copy: string }[] = [
  { icon: "upscale", label: "Upscale 8K", copy: "Recover cinematic detail" },
  { icon: "remove", label: "Remove object", copy: "Clean any frame precisely" },
  { icon: "expand", label: "Generative expand", copy: "Reframe without limits" },
  { icon: "cut", label: "Background studio", copy: "Cut, replace and relight" },
  { icon: "cube", label: "3D generator", copy: "Turn ideas into assets" },
  { icon: "layers", label: "Train a model", copy: "Keep characters consistent" },
];

type CatalogModel = {
  name: string;
  maker: string;
  tag: string;
  art: string;
  features: string[];
  credits?: string;
};

const modelCatalog: Record<Mode, CatalogModel[]> = {
  image: [
    { name: "GPT Image 2", maker: "OPENAI", tag: "Latest", art: "sculpture", features: ["Generate + edit", "High fidelity"] },
    { name: "Nano Banana 2", maker: "GOOGLE", tag: "4K", art: "gold", features: ["Multi-reference", "Video to image"] },
    { name: "Nano Banana Pro", maker: "GOOGLE", tag: "Pro", art: "portrait", features: ["Precision control", "Brand consistency"] },
    { name: "Nano Banana 2 Lite", maker: "GOOGLE", tag: "Fast", art: "ice", features: ["Low latency", "High volume"] },
    { name: "Luma UNI-1.1", maker: "LUMA", tag: "Brand", art: "coral", features: ["Style memory", "Creative direction"] },
    { name: "FLUX Pro", maker: "BLACK FOREST", tag: "Photo", art: "world", features: ["Photoreal", "Typography"] },
  ],
  video: [
    { name: "Seedance 2.0 Standard", maker: "BYTEDANCE", tag: "1080p+", art: "gold", features: ["9 image + 3 video + 3 audio", "Highest-fidelity native A/V"], credits: "credit mode · from 35 cr" },
    { name: "Seedance 2.0 Fast", maker: "BYTEDANCE", tag: "Fast", art: "coral", features: ["480p / 720p", "High-volume native A/V"], credits: "credit or unlimited mode" },
    { name: "Seedance 2.0 Mini", maker: "BYTEDANCE", tag: "Mini", art: "ice", features: ["Lightweight generation", "Fast drafts + iteration"], credits: "provider rate at checkout" },
    { name: "Kling 3.0 Omni", maker: "KLING", tag: "Omni", art: "sculpture", features: ["7 image or video reference", "Native audio · 15s"], credits: "6–16 cr / sec" },
    { name: "Kling 3.0", maker: "KLING", tag: "Director", art: "portrait", features: ["Multi-shot", "Character lock", "15s"], credits: "6–12 cr / sec" },
    { name: "Happy Horse 1.1", maker: "ALIBABA", tag: "1080p", art: "coral", features: ["T2V + I2V + reference", "Audio + lip-sync"] },
    { name: "Sora 2", maker: "OPENAI", tag: "Audio", art: "world", features: ["Text + image", "Synced sound"] },
    { name: "Veo 3.1", maker: "GOOGLE", tag: "Native A/V", art: "ice", features: ["Extend + keyframes", "Image direction"] },
    { name: "Runway Gen-4.5", maker: "RUNWAY", tag: "Cinema", art: "gold", features: ["Text + image", "Motion control"] },
    { name: "Luma Ray3.2", maker: "LUMA", tag: "Pro", art: "portrait", features: ["Frame control", "Cut continuity"] },
    { name: "Luma Ray3.14", maker: "LUMA", tag: "Fast", art: "sculpture", features: ["Native 1080p", "Video modify"] },
  ],
  music: [
    { name: "Lyria 3", maker: "GOOGLE", tag: "Music", art: "gold", features: ["Text to music", "Instrumental control"] },
    { name: "AudioFlow", maker: "SHAZAN", tag: "Score", art: "world", features: ["Cinematic score", "Stem export"] },
    { name: "Suno", maker: "SUNO", tag: "Songs", art: "coral", features: ["Vocals", "Full songs"] },
    { name: "Udio", maker: "UDIO", tag: "Studio", art: "ice", features: ["Music creation", "Remix"] },
  ],
  voice: [
    { name: "GPT Realtime Voice", maker: "OPENAI", tag: "Live", art: "gold", features: ["Realtime", "Multilingual"] },
    { name: "ElevenLabs", maker: "ELEVENLABS", tag: "Voice", art: "portrait", features: ["Voice design", "Dubbing"] },
    { name: "Voice Forge", maker: "SHAZAN", tag: "Character", art: "sculpture", features: ["Emotional direction", "Voice library"] },
  ],
  avatar: [
    { name: "HeyGen Avatar IV", maker: "HEYGEN", tag: "Avatar", art: "portrait", features: ["Talking avatar", "Lip-sync"] },
    { name: "Avatar One", maker: "SHAZAN", tag: "Live", art: "gold", features: ["Presenter", "Scene direction"] },
    { name: "Digital Twin", maker: "SHAZAN", tag: "Custom", art: "ice", features: ["Identity", "Custom voice"] },
  ],
};

type CreditModel = "seedance" | "kling";
type CreditResolution = "480p" | "720p" | "1080p" | "4K";

const seedancePricing: Record<CreditResolution, { base: number; video: [number, number] }> = {
  "480p": { base: 35, video: [39, 86] },
  "720p": { base: 76, video: [84, 186] },
  "1080p": { base: 187, video: [206, 457] },
  "4K": { base: 389, video: [420, 933] },
};

const creditCapabilities = {
  seedance: {
    maker: "BYTEDANCE SEED",
    name: "Seedance 2.0 Standard",
    subtitle: "Highest-fidelity unified 4-modal generation",
    stats: [
      ["9", "images"],
      ["3", "videos"],
      ["3", "audio clips"],
      ["15s", "multi-shot"],
    ],
    features: ["Text + image + video + audio in one prompt", "Native dual-channel audio", "Video extension and controlled editing", "480p, 720p, 1080p and 4K API output"],
  },
  kling: {
    maker: "KLING AI",
    name: "Kling 3.0 Omni",
    subtitle: "All-in-one reference, elements and native audio",
    stats: [
      ["7", "images"],
      ["1", "video"],
      ["4", "refs with video"],
      ["15s", "output"],
    ],
    features: ["Text + images + video + reusable elements", "Native audio and multi-shot generation", "2–4 multi-angle images per character element", "5–30s voice clip can bind a character voice"],
  },
} as const;

const modelUniverse: { name: string; mode: Mode }[] = [
  { name: "GPT Image 2", mode: "image" },
  { name: "Nano Banana 2", mode: "image" },
  { name: "Nano Banana Pro", mode: "image" },
  { name: "Seedance 2.0 Standard", mode: "video" },
  { name: "Seedance 2.0 Fast", mode: "video" },
  { name: "Seedance 2.0 Mini", mode: "video" },
  { name: "Kling 3.0 Omni", mode: "video" },
  { name: "Happy Horse 1.1", mode: "video" },
  { name: "Sora 2", mode: "video" },
  { name: "Veo 3.1", mode: "video" },
  { name: "Runway Gen-4.5", mode: "video" },
  { name: "Luma Ray3.2", mode: "video" },
  { name: "Lyria 3", mode: "music" },
  { name: "ElevenLabs", mode: "voice" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.4" /><path d="m4 17 4.8-4.6 3.3 3 2.6-2.3L20 18" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m10 9 4 3-4 3Z" /><path d="m17 9 4-2v10l-4-2" /></>,
    music: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    voice: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></>,
    avatar: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    sparkle: <><path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    magic: <><path d="m15 4 5 5L8 21H3v-5Z" /><path d="m13 6 5 5M5 4v4M3 6h4M19 15v5M16.5 17.5h5" /></>,
    upscale: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="m3 8 6-5M21 8l-6-5M3 16l6 5M21 16l-6 5" /></>,
    remove: <><path d="m4 15 8-8 5 5-8 8H4Z" /><path d="m14 5 2-2 5 5-2 2M12 20h9" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    cube: <><path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    cut: <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.5 8.5 11 7M8.5 15.5l11-7" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    play: <path d="m9 7 8 5-8 5Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    sliders: <><path d="M4 7h6M14 7h6M4 17h10M18 17h2" /><circle cx="12" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></>,
  };

  return <svg {...shared}>{paths[name]}</svg>;
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(modelMap.image[0]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creationReady, setCreationReady] = useState(false);
  const [creditModel, setCreditModel] = useState<CreditModel>("seedance");
  const [creditResolution, setCreditResolution] = useState<CreditResolution>("720p");
  const [creditDuration, setCreditDuration] = useState(5);
  const [creditVideoInput, setCreditVideoInput] = useState(false);
  const [creditNativeAudio, setCreditNativeAudio] = useState(true);
  const [references, setReferences] = useState<ReferenceFiles>({ images: [], videos: [], audio: [] });
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const currentMode = useMemo(
    () => modes.find((item) => item.id === activeMode) ?? modes[0],
    [activeMode],
  );

  const currentCreditCapability = creditCapabilities[creditModel];
  const referenceTotal = references.images.length + references.videos.length + references.audio.length;
  const isSeedance = activeMode === "video" && model.startsWith("Seedance 2.0");
  const klingResolution = creditResolution === "1080p" ? "1080p" : "720p";
  const klingRate = creditVideoInput
    ? (klingResolution === "1080p" ? 16 : 12)
    : creditNativeAudio
      ? (klingResolution === "1080p" ? 12 : 9)
      : (klingResolution === "1080p" ? 8 : 6);
  const seedanceCredit = seedancePricing[creditResolution];
  const creditTotal = creditModel === "kling"
    ? `${klingRate * creditDuration} credits`
    : creditVideoInput
      ? `${seedanceCredit.video[0]}–${seedanceCredit.video[1]} credits`
      : `${seedanceCredit.base} credits`;
  const creditMath = creditModel === "kling"
    ? `${klingRate} cr/sec × ${creditDuration} seconds`
    : creditVideoInput
      ? `per render · varies with 2–15s reference video`
      : `per render · image/audio references included`;

  const selectCreditModel = (nextModel: CreditModel) => {
    setCreditModel(nextModel);
    setCreditVideoInput(false);
    setCreditNativeAudio(true);
    if (nextModel === "kling" && (creditResolution === "480p" || creditResolution === "4K")) {
      setCreditResolution("720p");
    }
  };

  const toggleVideoInput = () => {
    setCreditVideoInput((value) => {
      const nextValue = !value;
      if (creditModel === "kling" && nextValue) setCreditNativeAudio(false);
      return nextValue;
    });
  };

  const addReferences = (kind: ReferenceKind, files: FileList | null, kindLimit: number) => {
    if (!files?.length) return;
    setReferences((current) => {
      const currentTotal = activeMode === "video"
        ? current.images.length + current.videos.length + current.audio.length
        : current.images.length;
      const totalLimit = activeMode === "video" ? 12 : 9;
      const openTotalSlots = Math.max(0, totalLimit - currentTotal);
      const openKindSlots = Math.max(0, kindLimit - current[kind].length);
      const accepted = Array.from(files)
        .map((file) => file.name)
        .filter((name) => !current[kind].includes(name))
        .slice(0, Math.min(openTotalSlots, openKindSlots));
      return accepted.length ? { ...current, [kind]: [...current[kind], ...accepted] } : current;
    });
  };

  const clearReferences = () => setReferences({ images: [], videos: [], audio: [] });

  const switchMode = (mode: Mode) => {
    setActiveMode(mode);
    setModel(modelMap[mode][0]);
    setCreationReady(false);
  };

  const goToCreate = (mode?: Mode) => {
    if (mode) switchMode(mode);
    document.querySelector("#create")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => promptRef.current?.focus(), 650);
    setMobileOpen(false);
  };

  const chooseModel = (mode: Mode, value: string) => {
    switchMode(mode);
    setModel(value);
    document.querySelector("#create")?.scrollIntoView({ behavior: "smooth" });
  };

  const generate = () => {
    if (!prompt.trim()) setPrompt(promptIdeas[activeMode]);
    setGenerating(true);
    setCreationReady(false);
    window.setTimeout(() => {
      setGenerating(false);
      setCreationReady(true);
    }, 1800);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#create" aria-label="Shazan AI home">
          <span className="brand-mark"><Icon name="sparkle" size={19} /></span>
          <span>SHAZAN AI</span>
        </a>

        <nav className={mobileOpen ? "nav-links open" : "nav-links"} aria-label="Main navigation">
          <a href="#create" onClick={() => setMobileOpen(false)}>Create</a>
          <a href="#models" onClick={() => setMobileOpen(false)}>Models</a>
          <a href="#credits" onClick={() => setMobileOpen(false)}>Credits</a>
          <a href="#enhance" onClick={() => setMobileOpen(false)}>Enhance</a>
          <a href="#community" onClick={() => setMobileOpen(false)}>Community</a>
          <a href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</a>
        </nav>

        <button className="header-cta" onClick={() => goToCreate()}>
          <Icon name="sparkle" size={17} /> Start creating
        </button>
        <button
          className="menu-button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <Icon name={mobileOpen ? "close" : "menu"} size={23} />
        </button>
      </header>

      <section className="hero" id="create">
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-shadow" aria-hidden="true" />
        <div className="ember-field" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>

        <div className="hero-copy">
          <h1>Imagine it.<br />Direct it.<br />Bring it to life.</h1>
        </div>

        <div className="command-wrap">
          <div className="command-deck">
            <div className="mode-tabs" role="tablist" aria-label="Creation type">
              {modes.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={activeMode === item.id}
                  className={activeMode === item.id ? "active" : ""}
                  onClick={() => switchMode(item.id)}
                >
                  <Icon name={item.id} size={21} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="prompt-row">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={currentMode.placeholder}
                aria-label={`${currentMode.label} prompt`}
                rows={2}
              />
              <button
                className="surprise-button"
                aria-label="Try a creative prompt"
                title="Surprise me"
                onClick={() => setPrompt(promptIdeas[activeMode])}
              >
                <Icon name="magic" size={23} />
              </button>
              <button className="generate-button" onClick={generate} disabled={generating}>
                {generating ? <span className="loader" /> : <Icon name="sparkle" size={20} />}
                {generating ? "Creating..." : "Generate"}
              </button>
            </div>

            {(activeMode === "image" || activeMode === "video") && (
              <div className="reference-bay">
                <div className="reference-head">
                  <span><Icon name="layers" size={18} /><b>{activeMode === "video" ? "Multimodal references" : "Image references"}</b></span>
                  <small>{activeMode === "video"
                    ? isSeedance
                      ? `Seedance · ${referenceTotal}/12 assets total`
                      : `${referenceTotal} attached · selected model limits apply`
                    : `${references.images.length}/9 workspace slots · character, style or composition`}</small>
                  {referenceTotal > 0 && <button onClick={clearReferences}>Clear all</button>}
                </div>

                <div className={`reference-slots ${activeMode === "image" ? "image-only" : ""}`}>
                  <label className={references.images.length ? "reference-upload has-files" : "reference-upload"}>
                    <input type="file" accept="image/*" multiple onChange={(event) => { addReferences("images", event.currentTarget.files, 9); event.currentTarget.value = ""; }} />
                    <Icon name="image" size={19} />
                    <span><b>{references.images.length ? `${references.images.length} attached` : "Add images"}</b><small>{activeMode === "video" ? "Seedance max 9" : "9 workspace slots"}</small></span>
                    <em>+</em>
                  </label>

                  {activeMode === "video" && (
                    <>
                      <label className={references.videos.length ? "reference-upload has-files" : "reference-upload"}>
                        <input type="file" accept="video/*" multiple onChange={(event) => { addReferences("videos", event.currentTarget.files, 3); event.currentTarget.value = ""; }} />
                        <Icon name="video" size={19} />
                        <span><b>{references.videos.length ? `${references.videos.length} attached` : "Add videos"}</b><small>Seedance max 3 · 15s</small></span>
                        <em>+</em>
                      </label>
                      <label className={references.audio.length ? "reference-upload has-files" : "reference-upload"}>
                        <input type="file" accept="audio/*" multiple onChange={(event) => { addReferences("audio", event.currentTarget.files, 3); event.currentTarget.value = ""; }} />
                        <Icon name="music" size={19} />
                        <span><b>{references.audio.length ? `${references.audio.length} attached` : "Add audio"}</b><small>Seedance max 3 · 15s</small></span>
                        <em>+</em>
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="control-row">
              <label className="select-control model-control">
                <span><Icon name="sparkle" size={18} /> Model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {modelMap[activeMode].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="select-control">
                <span><Icon name="expand" size={17} /> Aspect ratio</span>
                <select defaultValue="16:9 Widescreen">
                  <option>16:9 Widescreen</option><option>9:16 Vertical</option><option>1:1 Square</option><option>4:5 Portrait</option>
                </select>
              </label>
              <label className="select-control">
                <span><Icon name="cube" size={17} /> Quality</span>
                <select defaultValue="Ultra">
                  <option>Ultra</option><option>High</option><option>Fast</option>
                </select>
              </label>
              <label className="select-control hide-small">
                <span><Icon name="layers" size={17} /> Style</span>
                <select defaultValue="Cinematic">
                  <option>Cinematic</option><option>Photoreal</option><option>Editorial</option><option>Anime</option>
                </select>
              </label>
              <button className="settings-button" aria-label="Advanced generation settings">
                <Icon name="sliders" size={20} />
              </button>
            </div>
          </div>

          <div className="model-rail" id="models">
            {modelCatalog[activeMode].map((card) => (
              <button
                className="model-card"
                key={card.name}
                onClick={() => setModel(card.name)}
              >
                <span className={`model-art ${card.art}`} />
                <span className="model-info"><small>{card.maker}</small><b>{card.name}</b><em>{card.tag}</em></span>
              </button>
            ))}
            <button className="rail-next" aria-label="See more models"><Icon name="chevron" size={22} /></button>
          </div>
        </div>

        {creationReady && (
          <div className="creation-toast" role="status">
            <span className="toast-preview" />
            <span><small>Creation complete</small><b>Your {currentMode.label.toLowerCase()} is ready</b></span>
            <button onClick={() => setCreationReady(false)} aria-label="Close result"><Icon name="close" size={17} /></button>
          </div>
        )}
      </section>

      <section className="latest-models-section" aria-labelledby="latest-models-title">
        <div className="latest-models-heading">
          <div>
            <p className="kicker">LIVE MODEL LIBRARY · JULY 2026</p>
            <h2 id="latest-models-title">Every frontier model.<br /><em>One command center.</em></h2>
          </div>
          <p>Switch engines without rebuilding your prompt. Image and multimodal video models sit inside the same cinematic workflow.</p>
        </div>

        <div className="latest-model-groups">
          <article className="latest-model-family image-family">
            <header>
              <span className="family-icon"><Icon name="image" size={24} /></span>
              <span><small>IMAGE GENERATION + EDITING</small><b>Latest Image Intelligence</b></span>
              <em>{modelCatalog.image.length} models</em>
            </header>
            <div className="latest-card-grid">
              {modelCatalog.image.map((item) => (
                <button key={item.name} onClick={() => chooseModel("image", item.name)}>
                  <span className={`latest-card-art ${item.art}`}><Icon name="image" size={22} /></span>
                  <span className="latest-card-copy"><small>{item.maker}</small><b>{item.name}</b><span className="model-feature-list">{item.features.map((feature) => <i key={feature}>{feature}</i>)}</span>{item.credits && <strong className="model-credit">{item.credits}</strong>}</span>
                  <em>{item.tag}</em><Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          </article>

          <article className="latest-model-family video-family">
            <header>
              <span className="family-icon"><Icon name="video" size={24} /></span>
              <span><small>MULTIMODAL VIDEO + NATIVE AUDIO</small><b>Director-grade Video Models</b></span>
              <em>{modelCatalog.video.length} models</em>
            </header>
            <div className="latest-card-grid video-model-grid">
              {modelCatalog.video.map((item) => (
                <button key={item.name} onClick={() => chooseModel("video", item.name)}>
                  <span className={`latest-card-art ${item.art}`}><Icon name="video" size={22} /></span>
                  <span className="latest-card-copy"><small>{item.maker}</small><b>{item.name}</b><span>{item.features.map((feature) => <i key={feature}>{feature}</i>)}</span></span>
                  <em>{item.tag}</em><Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="credit-lab-section" id="credits" aria-labelledby="credit-lab-title">
        <div className="credit-lab-heading">
          <div>
            <p className="kicker">NO SURPRISE BILLING · VERIFIED LIMITS</p>
            <h2 id="credit-lab-title">Know every input.<br /><em>See every credit.</em></h2>
          </div>
          <p>Choose a model and settings before you generate. The exact model rate and reference capacity stay visible at every step.</p>
        </div>

        <div className="credit-model-tabs" role="tablist" aria-label="Credit model">
          <button className={creditModel === "seedance" ? "active" : ""} onClick={() => selectCreditModel("seedance")} role="tab" aria-selected={creditModel === "seedance"}>
            <span><Icon name="video" size={20} /></span><b>Seedance 2.0 Standard</b><small>from 35 credits</small>
          </button>
          <button className={creditModel === "kling" ? "active" : ""} onClick={() => selectCreditModel("kling")} role="tab" aria-selected={creditModel === "kling"}>
            <span><Icon name="layers" size={20} /></span><b>Kling 3.0 Omni</b><small>6–16 credits/sec</small>
          </button>
        </div>

        <div className="credit-lab-grid">
          <article className="capability-ledger">
            <header>
              <span className="ledger-orb"><Icon name={creditModel === "seedance" ? "video" : "layers"} size={27} /></span>
              <span><small>{currentCreditCapability.maker}</small><b>{currentCreditCapability.name}</b><em>{currentCreditCapability.subtitle}</em></span>
              <span className="verified-badge"><Icon name="check" size={13} /> Verified</span>
            </header>

            <div className="input-ledger">
              {currentCreditCapability.stats.map(([value, label]) => (
                <span key={label}><b>{value}</b><small>{label}</small></span>
              ))}
            </div>

            <ul>
              {currentCreditCapability.features.map((feature) => <li key={feature}><Icon name="check" size={16} /> {feature}</li>)}
            </ul>

            <p className="ledger-note">
              {creditModel === "seedance"
                ? "Use up to 12 assets total in one instruction, within per-type caps of 9 images, 3 videos and 3 audio clips."
                : "With a video input, Kling allows up to four additional images/elements; without video, up to seven."}
            </p>
          </article>

          <article className="credit-calculator">
            <header><span><small>LIVE CREDIT CALCULATOR</small><b>Generation estimate</b></span><Icon name="sliders" size={22} /></header>

            <div className="calculator-fields">
              <label>
                <span>Resolution</span>
                <select value={creditResolution} onChange={(event) => setCreditResolution(event.target.value as CreditResolution)}>
                  {creditModel === "seedance" && <option>480p</option>}
                  <option>720p</option>
                  <option>1080p</option>
                  {creditModel === "seedance" && <option>4K</option>}
                </select>
              </label>
              <label>
                <span>Duration</span>
                <select value={creditDuration} onChange={(event) => setCreditDuration(Number(event.target.value))} disabled={creditModel === "seedance"}>
                  <option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option>
                </select>
                {creditModel === "seedance" && <small>Seedance billed per render</small>}
              </label>
            </div>

            <div className="calculator-toggles">
              <button className={creditVideoInput ? "active" : ""} onClick={toggleVideoInput} aria-pressed={creditVideoInput}>
                <span><Icon name="video" size={18} /><b>Video reference</b></span><i />
              </button>
              <button className={creditNativeAudio ? "active" : ""} onClick={() => setCreditNativeAudio((value) => !value)} aria-pressed={creditNativeAudio} disabled={creditModel === "kling" && creditVideoInput}>
                <span><Icon name="voice" size={18} /><b>Native audio</b></span><i />
              </button>
            </div>

            {creditModel === "kling" && creditVideoInput && <p className="calculator-warning">Kling 3.0 Omni does not currently support native audio when a video reference is supplied.</p>}
            {creditModel === "seedance" && <p className="calculator-info">Native audio is included in Seedance 2.0 pricing; the audio switch does not add credits.</p>}

            <div className="credit-total">
              <span><small>ESTIMATED CHARGE</small><b>{creditTotal}</b><em>{creditMath}</em></span>
              <span className="credit-coin"><Icon name="sparkle" size={25} /></span>
            </div>
            <p className="rate-note">Provider-aligned launch estimate. Your final charge is always shown before generation.</p>
          </article>
        </div>
      </section>

      <section className="studio-section" id="enhance">
        <div className="section-heading">
          <div>
            <p className="kicker">ONE STUDIO · EVERY MEDIUM</p>
            <h2>Your entire creative department,<br /><em>inside one universe.</em></h2>
          </div>
          <p>Move from first thought to final frame without breaking your flow. Every tool speaks the same visual language and remembers your direction.</p>
        </div>

        <div className="tool-grid">
          {toolGroups.map((tool, index) => (
            <button className={`tool-card ${index === 0 ? "featured" : ""}`} key={tool.label} onClick={() => goToCreate(index < 5 ? modes[index].id : "image")}>
              <span className={`tool-icon ${tool.accent}`}><Icon name={tool.icon} size={28} /></span>
              <span className="tool-meta">{tool.meta}</span>
              <span className="tool-content"><b>{tool.label}</b><span>{tool.description}</span></span>
              <span className="tool-arrow"><Icon name="arrow" size={20} /></span>
            </button>
          ))}
        </div>

        <div className="quick-tools">
          {quickTools.map((tool) => (
            <button key={tool.label} onClick={() => goToCreate("image")}>
              <Icon name={tool.icon} size={21} /><span><b>{tool.label}</b><small>{tool.copy}</small></span><Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </section>

      <section className="flow-section">
        <div className="flow-copy">
          <p className="kicker">SHAZAN FLOW</p>
          <h2>From a spark to a <em>finished universe.</em></h2>
          <p>Generate a hero frame. Animate it. Add dialogue, score and sound design. Then enhance the final cut—all without rebuilding your vision in five different apps.</p>
          <ul>
            <li><Icon name="check" size={17} /> One project memory across every tool</li>
            <li><Icon name="check" size={17} /> Scene, character and style consistency</li>
            <li><Icon name="check" size={17} /> Professional timeline and version history</li>
          </ul>
          <button className="text-link" onClick={() => goToCreate()}><span>Enter the studio</span><Icon name="arrow" size={19} /></button>
        </div>

        <div className="flow-workspace" aria-label="Creative workflow preview">
          <div className="workspace-top"><span className="mini-brand"><Icon name="sparkle" size={13} /></span><b>Celestial Kingdom</b><small>Saved just now</small><button>Export</button></div>
          <div className="workspace-body">
            <aside><button className="active"><Icon name="image" size={18} /></button><button><Icon name="video" size={18} /></button><button><Icon name="music" size={18} /></button><button><Icon name="voice" size={18} /></button></aside>
            <div className="workspace-canvas"><div className="canvas-art"><button aria-label="Play preview"><Icon name="play" size={28} /></button></div><div className="timeline"><span className="timeline-head" /><div className="track visual"><i /><i /><i /></div><div className="track audio"><i /><i /></div></div></div>
            <div className="workspace-panel"><small>SCENE DIRECTION</small><b>The last city at dawn</b><p>Slow dolly forward. Volumetric gold light. Wind through the cloak.</p><div><span>16:9</span><span>8 sec</span><span>4K</span></div><button><Icon name="sparkle" size={15} /> Generate shot</button></div>
          </div>
        </div>
      </section>

      <section className="model-universe">
        <div className="section-heading compact">
          <div><p className="kicker">MODEL UNIVERSE</p><h2>The world&apos;s creative intelligence.<br /><em>One elegant gateway.</em></h2></div>
          <p>Choose the right engine for every shot—or let SHAZAN Auto select it from your intent.</p>
        </div>
        <div className="logo-river" aria-label="Available model families">
          {modelUniverse.map((item, index) => (
            <button key={item.name} onClick={() => chooseModel(item.mode, item.name)}>
              <span className={`logo-orb orb-${(index % 5) + 1}`}><Icon name={item.mode} size={19} /></span>
              {item.name}<Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      </section>

      <section className="community-section" id="community">
        <div className="community-copy"><p className="kicker">MADE WITH SHAZAN</p><h2>Dreams look better<br /><em>when they move.</em></h2><button onClick={() => goToCreate()}>Create your first world <Icon name="arrow" size={18} /></button></div>
        <div className="gallery-grid">
          <article className="gallery-card tall portrait"><span><b>Glass Empress</b><small>Photoreal · 4K</small></span></article>
          <article className="gallery-card wide world"><span><b>Last Light</b><small>Cinematic XL</small></span><button aria-label="Play Last Light"><Icon name="play" size={22} /></button></article>
          <article className="gallery-card small sculpture"><span><b>Golden Memory</b><small>Editorial</small></span></article>
          <article className="gallery-card small coral"><span><b>Solar Bloom</b><small>Motion study</small></span></article>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="pricing-heading"><p className="kicker">START CREATING</p><h2>Built for the next generation<br />of <em>storytellers.</em></h2><p>Start free. Upgrade when your imagination needs more room.</p></div>
        <div className="price-grid">
          <article><small>EXPLORER</small><h3>Free</h3><p>Discover the studio and create your first worlds.</p><ul><li><Icon name="check" size={16} /> 100 welcome credits</li><li><Icon name="check" size={16} /> Core image and audio tools</li><li><Icon name="check" size={16} /> Community gallery</li></ul><button onClick={() => goToCreate()}>Start free</button></article>
          <article className="popular"><span className="popular-label">MOST POPULAR</span><small>CREATOR</small><h3>₹1,999 <em>/month</em></h3><p>For filmmakers, artists and full-time creators.</p><ul><li><Icon name="check" size={16} /> 3,000 monthly credits</li><li><Icon name="check" size={16} /> All premium models</li><li><Icon name="check" size={16} /> 4K video and commercial use</li><li><Icon name="check" size={16} /> Priority generations</li></ul><button onClick={() => goToCreate()}>Choose Creator</button></article>
          <article><small>STUDIO</small><h3>Custom</h3><p>Shared workspaces, private models and scale.</p><ul><li><Icon name="check" size={16} /> Team workspace</li><li><Icon name="check" size={16} /> Custom model training</li><li><Icon name="check" size={16} /> API and priority support</li></ul><button onClick={() => goToCreate()}>Talk to us</button></article>
        </div>
      </section>

      <footer>
        <div className="footer-brand"><span className="brand-mark"><Icon name="sparkle" size={19} /></span><span><b>SHAZAN AI</b><small>Make what the world has never seen.</small></span></div>
        <div className="footer-links"><a href="#create">Create</a><a href="#models">Models</a><a href="#credits">Credits</a><a href="#enhance">Tools</a><a href="#pricing">Pricing</a></div>
        <small>© 2026 SHAZAN AI. Built for imagination.</small>
      </footer>
    </main>
  );
}
