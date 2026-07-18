"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

type Mode = "image" | "video" | "music" | "voice" | "avatar";
type ReferenceKind = "images" | "videos" | "audio";
type ReferenceFiles = Record<ReferenceKind, File[]>;
type VideoInputSlot = {
  kind: ReferenceKind;
  label: string;
  note: string;
  accept: string;
  limit: number;
};
type VideoInputProfile = {
  title: string;
  summary: string;
  totalLimit: number;
  slots: VideoInputSlot[];
};
type GeneratorStatus = "ready" | "uploading" | "queued" | "processing" | "completed" | "failed";
type AuthView = "login" | "register";
type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  credits: number;
};
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
  image: ["GPT Image 2", "Nano Banana 2", "Nano Banana Pro", "Grok Imagine Image", "FLUX 2 Pro"],
  video: ["Seedance 2.0 Standard", "Seedance 2.0 Fast", "Seedance 2.0 Mini", "Gemini Omni Flash", "Grok Imagine Video 1.5", "Kling 3.0 Pro", "Kling 3.0 Omni 4K", "Kling 3.0 Elements", "Veo 3.1", "Happy Horse 1.1"],
  music: ["Lyria 3", "AudioFlow", "Suno", "Score Composer · CassetteAI"],
  voice: ["GPT Voice", "ElevenLabs", "Voice Forge", "Multilingual Pro"],
  avatar: ["HeyGen Avatar IV", "Avatar One", "Digital Twin", "Performance Capture"],
};

const emptyReferences = (): ReferenceFiles => ({ images: [], videos: [], audio: [] });

const getApiModelKey = (modelName: string) => {
  const keys: Record<string, string> = {
    "GPT Image 2": "gpt_image_2",
    "Nano Banana 2": "nano_banana_2",
    "Nano Banana Pro": "nano_banana_pro",
    "Grok Imagine Image": "grok_imagine_image",
    "FLUX 2 Pro": "flux_2_pro",
    "Seedance 2.0 Standard": "seedance_2_0_standard",
    "Seedance 2.0 Fast": "seedance_2_0_fast",
    "Seedance 2.0 Mini": "seedance_2_0_mini",
    "Kling 3.0 Elements": "kling_3_0_elements",
    "Kling 3.0 Pro": "kling_3_0",
    "Kling 3.0 Omni 4K": "kling_3_0_omni",
    "Gemini Omni Flash": "gemini_omni_flash",
    "Grok Imagine Video 1.5": "grok_imagine_video_1_5",
    "Happy Horse 1.1": "happy_horse_1_1",
    "Veo 3.1": "veo_3_1",
    "Lyria 3": "lyria_3",
    "AudioFlow": "audioflow_elevenlabs",
    "Suno": "suno",
    "Score Composer · CassetteAI": "score_composer_cassetteai",
    "GPT Voice": "gpt_voice",
    "ElevenLabs": "elevenlabs_voice",
    "Voice Forge": "voice_forge",
    "Multilingual Pro": "multilingual_pro",
    "HeyGen Avatar IV": "heygen_avatar_iv",
    "Avatar One": "avatar_one",
    "Digital Twin": "digital_twin",
    "Performance Capture": "performance_capture",
  };
  return keys[modelName] ?? modelName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
};

const extractApiMessage = (value: unknown, fallback: string) => {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "detail", "error"]) {
    const message = record[key];
    if (typeof message === "string" && message.trim()) return message;
    if (message && typeof message === "object") {
      const nested = message as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
  }
  return fallback;
};

const extractMedia = (value: unknown): { url: string; type: "image" | "video" | "audio" } | null => {
  if (value && typeof value === "object") {
    const output = (value as Record<string, unknown>).output;
    if (output && typeof output === "object") {
      const record = output as Record<string, unknown>;
      if (typeof record.url === "string" && /^https:\/\//i.test(record.url)) {
        const type = record.type === "video" || record.type === "audio" ? record.type : "image";
        return { url: record.url, type };
      }
    }
  }
  const seen = new Set<unknown>();
  const candidates: { url: string; score: number; type: "image" | "video" | "audio" }[] = [];

  const visit = (item: unknown, path: string) => {
    if (typeof item === "string" && /^https:\/\//i.test(item)) {
      if (/status|cancel|webhook/i.test(path)) return;
      const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item);
      const isAudio = /\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(item);
      const videoPath = /video|result|output|raw/i.test(path);
      const imagePath = /image|images/i.test(path);
      candidates.push({ url: item, score: (isVideo || isAudio ? 5 : 2) + (videoPath || imagePath ? 2 : 0), type: isVideo ? "video" : isAudio ? "audio" : "image" });
      return;
    }
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}.${index}`));
      return;
    }
    Object.entries(item as Record<string, unknown>).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };

  visit(value, "response");
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score ? { url: candidates[0].url, type: candidates[0].type } : null;
};

const seedanceInputProfile: VideoInputProfile = {
  title: "Multimodal references",
  summary: "Seedance only · 9 images + 3 videos + 3 audio",
  totalLimit: 15,
  slots: [
    { kind: "images", label: "Add images", note: "Max 9", accept: "image/*", limit: 9 },
    { kind: "videos", label: "Add videos", note: "Max 3 · 15s each", accept: "video/*", limit: 3 },
    { kind: "audio", label: "Add audio", note: "Max 3 · 15s each", accept: "audio/*", limit: 3 },
  ],
};

const getVideoInputProfile = (modelName: string): VideoInputProfile => {
  if (modelName.startsWith("Seedance 2.0")) return seedanceInputProfile;

  switch (modelName) {
    case "Kling 3.0 Elements":
      return {
        title: "Video element",
        summary: "Kling 3.0 · one video element reference",
        totalLimit: 1,
        slots: [{ kind: "videos", label: "Add video element", note: "One 3–8s source clip", accept: "video/*", limit: 1 }],
      };
    case "Kling 3.0 Pro":
      return {
        title: "Frame controls",
        summary: "Kling 3.0 Pro · optional start and end frames",
        totalLimit: 2,
        slots: [{ kind: "images", label: "Add start / end frames", note: "Up to 2 images", accept: "image/*", limit: 2 }],
      };
    case "Kling 3.0 Omni 4K":
      return {
        title: "4K frame controls",
        summary: "Kling Omni 4K · first frame required, end frame optional",
        totalLimit: 2,
        slots: [{ kind: "images", label: "Add first / end frames", note: "First image required", accept: "image/*", limit: 2 }],
      };
    case "Gemini Omni Flash":
      return {
        title: "Image references",
        summary: "Gemini Omni Flash · text or reference images via fal.ai",
        totalLimit: 7,
        slots: [{ kind: "images", label: "Add reference images", note: "Up to 7 images", accept: "image/*", limit: 7 }],
      };
    case "Grok Imagine Video 1.5":
      return {
        title: "First frame",
        summary: "Grok Imagine 1.5 · exact image-to-video endpoint",
        totalLimit: 1,
        slots: [{ kind: "images", label: "Add first frame", note: "One image required", accept: "image/*", limit: 1 }],
      };
    case "Veo 3.1":
      return {
        title: "Frame controls",
        summary: "Veo 3.1 · first and last frame",
        totalLimit: 2,
        slots: [{ kind: "images", label: "Add first / last frames", note: "Up to 2 images", accept: "image/*", limit: 2 }],
      };
    case "Happy Horse 1.1":
    default:
      return {
        title: "First frame",
        summary: `${modelName} · image-to-video`,
        totalLimit: 1,
        slots: [{ kind: "images", label: "Add first frame", note: "One image input", accept: "image/*", limit: 1 }],
      };
  }
};

const getAvatarInputProfile = (modelName: string): VideoInputProfile => {
  switch (modelName) {
    case "HeyGen Avatar IV":
      return {
        title: "Photo avatar",
        summary: "Clear-face photo required · script or optional voice audio",
        totalLimit: 2,
        slots: [
          { kind: "images", label: "Add avatar photo", note: "One clear-face image · required", accept: "image/*", limit: 1 },
          { kind: "audio", label: "Add voice audio", note: "Optional · overrides written script", accept: "audio/*", limit: 1 },
        ],
      };
    case "Avatar One":
      return {
        title: "Audio-driven presenter",
        summary: "Character image + voice audio · both required",
        totalLimit: 2,
        slots: [
          { kind: "images", label: "Add presenter image", note: "Human, animal or character", accept: "image/*", limit: 1 },
          { kind: "audio", label: "Add voice audio", note: "MP3, WAV, M4A or AAC", accept: "audio/*", limit: 1 },
        ],
      };
    case "Digital Twin":
      return {
        title: "Digital twin performance",
        summary: "Person image + voice audio under 30 seconds",
        totalLimit: 2,
        slots: [
          { kind: "images", label: "Add person image", note: "One clear full or half-body image", accept: "image/*", limit: 1 },
          { kind: "audio", label: "Add performance audio", note: "Required · maximum 30 seconds", accept: "audio/*", limit: 1 },
        ],
      };
    case "Performance Capture":
    default:
      return {
        title: "Motion transfer",
        summary: "Character image + driving performance video",
        totalLimit: 2,
        slots: [
          { kind: "images", label: "Add character image", note: "One visible full or half body", accept: "image/*", limit: 1 },
          { kind: "videos", label: "Add motion video", note: "Driving performance · required", accept: "video/*", limit: 1 },
        ],
      };
  }
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
    meta: "5 connected models",
  },
  {
    icon: "video" as IconName,
    label: "Video Studio",
    description: "Model-specific video workflows: Seedance multimodal, Kling video and frame control, plus first-frame generation.",
    accent: "coral",
    meta: "10 verified engines",
  },
  {
    icon: "music" as IconName,
    label: "Music Lab",
    description: "Original songs, cinematic scores, stems, sound design and intelligent mastering.",
    accent: "violet",
    meta: "4 connected engines",
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
    { name: "Grok Imagine Image", maker: "XAI", tag: "Aesthetic", art: "ice", features: ["Text to image", "Quality edit"] },
    { name: "FLUX 2 Pro", maker: "BLACK FOREST", tag: "Photo", art: "world", features: ["Photoreal", "Typography"] },
  ],
  video: [
    { name: "Seedance 2.0 Standard", maker: "BYTEDANCE", tag: "1080p+", art: "gold", features: ["9 image + 3 video + 3 audio", "Highest-fidelity native A/V"], credits: "base API rate · from $0.057/sec" },
    { name: "Seedance 2.0 Fast", maker: "BYTEDANCE", tag: "Fast", art: "coral", features: ["Unified multimodal inputs", "480p / 720p high volume"], credits: "live rate checked before launch" },
    { name: "Seedance 2.0 Mini", maker: "BYTEDANCE · KIE", tag: "Fallback", art: "ice", features: ["Kie API route", "Fast drafts + iteration"], credits: "live rate checked before launch" },
    { name: "Gemini Omni Flash", maker: "GOOGLE", tag: "New", art: "world", features: ["Text or image references", "Synchronized audio · 3–10s"] },
    { name: "Grok Imagine Video 1.5", maker: "XAI", tag: "1.5", art: "coral", features: ["First-frame image required", "Audio · up to 1080p"] },
    { name: "Kling 3.0 Pro", maker: "KLING", tag: "Pro", art: "portrait", features: ["Text or start/end frames", "Native audio · 15s"], credits: "live rate checked before launch" },
    { name: "Kling 3.0 Omni 4K", maker: "KLING", tag: "4K", art: "gold", features: ["First frame required", "Optional end frame"] },
    { name: "Kling 3.0 Elements", maker: "KLING", tag: "Elements", art: "sculpture", features: ["Video element reference", "Native sound · 15s"], credits: "base API rate · from $0.07/sec" },
    { name: "Veo 3.1", maker: "GOOGLE", tag: "Native A/V", art: "ice", features: ["First + last frame", "Native A/V"] },
    { name: "Happy Horse 1.1", maker: "ALIBABA", tag: "1080p", art: "coral", features: ["Text or first frame", "Image-to-video"] },
  ],
  music: [
    { name: "Lyria 3", maker: "GOOGLE · FAL", tag: "30 sec", art: "gold", features: ["Vocals + lyrics", "Prompt-to-music"] },
    { name: "AudioFlow", maker: "SHAZAN", tag: "3–600 sec", art: "world", features: ["Cinematic score", "Full-length music"] },
    { name: "Suno", maker: "SUNO AI", tag: "Songs", art: "coral", features: ["Vocals", "Two variations"] },
    { name: "Score Composer · CassetteAI", maker: "SHAZAN · CASSETTEAI", tag: "Score", art: "portrait", features: ["Cinematic score", "30–180 sec"] },
  ],
  voice: [
    { name: "GPT Voice", maker: "OPENAI", tag: "Natural", art: "gold", features: ["Prompt-directed speech", "Multilingual"] },
    { name: "ElevenLabs", maker: "ELEVENLABS", tag: "Expressive", art: "portrait", features: ["Eleven v3", "Emotional delivery"] },
    { name: "Voice Forge", maker: "SHAZAN", tag: "Design", art: "sculpture", features: ["Describe a new voice", "Generated preview"] },
    { name: "Multilingual Pro", maker: "SHAZAN", tag: "Global", art: "ice", features: ["Multilingual speech", "Natural delivery"] },
  ],
  avatar: [
    { name: "HeyGen Avatar IV", maker: "HEYGEN", tag: "Photo", art: "portrait", features: ["Photo + script", "Optional audio lip-sync"] },
    { name: "Avatar One", maker: "SHAZAN", tag: "Presenter", art: "gold", features: ["Image + voice audio", "Talking characters"] },
    { name: "Digital Twin", maker: "SHAZAN", tag: "Custom", art: "ice", features: ["Identity motion", "Audio-driven performance"] },
    { name: "Performance Capture", maker: "SHAZAN", tag: "Motion", art: "sculpture", features: ["Character image", "Driving video transfer"] },
  ],
};

type CreditModel = "seedance" | "kling";
type CreditResolution = "480p" | "720p" | "1080p" | "4K";

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
    name: "Kling 3.0 Elements",
    subtitle: "Element-guided generation with native sound",
    stats: [
      ["1", "video"],
      ["3", "max elements"],
      ["4K", "top mode"],
      ["15s", "output"],
    ],
    features: ["Image, video or audio element references", "Prompt-addressable reusable elements", "Optional native sound and multi-shot generation", "Start and end frame control in Kling 3.0 mode"],
  },
} as const;

const modelUniverse: { name: string; mode: Mode }[] = [
  { name: "GPT Image 2", mode: "image" },
  { name: "Nano Banana 2", mode: "image" },
  { name: "Nano Banana Pro", mode: "image" },
  { name: "Grok Imagine Image", mode: "image" },
  { name: "Seedance 2.0 Standard", mode: "video" },
  { name: "Seedance 2.0 Fast", mode: "video" },
  { name: "Seedance 2.0 Mini", mode: "video" },
  { name: "Kling 3.0 Elements", mode: "video" },
  { name: "Kling 3.0 Pro", mode: "video" },
  { name: "Kling 3.0 Omni 4K", mode: "video" },
  { name: "Gemini Omni Flash", mode: "video" },
  { name: "Grok Imagine Video 1.5", mode: "video" },
  { name: "Happy Horse 1.1", mode: "video" },
  { name: "Veo 3.1", mode: "video" },
  { name: "Lyria 3", mode: "music" },
  { name: "AudioFlow", mode: "music" },
  { name: "Suno", mode: "music" },
  { name: "Score Composer · CassetteAI", mode: "music" },
  { name: "GPT Voice", mode: "voice" },
  { name: "ElevenLabs", mode: "voice" },
  { name: "Voice Forge", mode: "voice" },
  { name: "Multilingual Pro", mode: "voice" },
  { name: "HeyGen Avatar IV", mode: "avatar" },
  { name: "Avatar One", mode: "avatar" },
  { name: "Digital Twin", mode: "avatar" },
  { name: "Performance Capture", mode: "avatar" },
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
  const [references, setReferences] = useState<ReferenceFiles>(emptyReferences);
  const [videoGeneratorOpen, setVideoGeneratorOpen] = useState(false);
  const [studioAccessCode, setStudioAccessCode] = useState("");
  const [generatorStatus, setGeneratorStatus] = useState<GeneratorStatus>("ready");
  const [generatorMessage, setGeneratorMessage] = useState("Ready for a secure SHAZAN render.");
  const [generatorVideoUrl, setGeneratorVideoUrl] = useState("");
  const [generatorOutputType, setGeneratorOutputType] = useState<"image" | "video" | "audio">("video");
  const [generatorRequestId, setGeneratorRequestId] = useState("");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16:9");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoDuration, setVideoDuration] = useState(5);
  const [musicDuration, setMusicDuration] = useState(30);
  const [voicePreset, setVoicePreset] = useState("marin");
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const generatorRunRef = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        const record = payload as { authenticated?: boolean; user?: AuthUser };
        setAuthUser(response.ok && record.authenticated && record.user ? record.user : null);
      })
      .catch(() => {
        if (active) setAuthUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  const currentMode = useMemo(
    () => modes.find((item) => item.id === activeMode) ?? modes[0],
    [activeMode],
  );

  const currentCreditCapability = creditCapabilities[creditModel];
  const referenceTotal = references.images.length + references.videos.length + references.audio.length;
  const videoInputProfile = activeMode === "image"
    ? {
        title: "Image references",
        summary: `${model} · optional generation or edit references`,
        totalLimit: 9,
        slots: [{ kind: "images" as ReferenceKind, label: "Add images", note: "Up to 9 workspace slots", accept: "image/*", limit: 9 }],
      }
    : activeMode === "music"
      ? {
          title: "Text to music",
          summary: model === "Lyria 3" ? "Lyria 3 · fixed 30-second MP3" : `${model} · prompt-driven audio generation`,
          totalLimit: 0,
          slots: [] as VideoInputSlot[],
        }
      : activeMode === "voice"
        ? {
            title: model === "Voice Forge" ? "Voice design" : "Text to speech",
            summary: model === "Voice Forge" ? "Describe age, accent, texture and emotion for a generated voice preview" : `${model} · secure prompt-to-audio generation`,
            totalLimit: 0,
            slots: [] as VideoInputSlot[],
          }
        : activeMode === "avatar"
          ? getAvatarInputProfile(model)
          : getVideoInputProfile(model);
  const baseApiRate = creditModel === "kling" ? 0.07 : 0.057;
  const creditTotal = `$${(baseApiRate * creditDuration).toFixed(2)}+`;
  const creditMath = `$${baseApiRate.toFixed(3)}/sec base rate × ${creditDuration} sec`;
  const generatorBusy = generatorStatus === "uploading" || generatorStatus === "queued" || generatorStatus === "processing";
  const generatorResolutionOptions = activeMode === "avatar"
    ? (model === "HeyGen Avatar IV" ? ["720p", "1080p"] : ["720p"])
    : model === "Kling 3.0 Omni 4K"
    ? ["4K"]
    : model === "Gemini Omni Flash"
      ? ["720p"]
      : model.startsWith("Kling 3.0")
        ? ["720p", "1080p"]
        : model === "Grok Imagine Video 1.5"
          ? ["480p", "720p", "1080p"]
    : model.includes("Fast") || model.includes("Mini")
      ? ["480p", "720p"]
      : model === "Happy Horse 1.1"
        ? ["720p", "1080p"]
        : ["480p", "720p", "1080p", "4K"];
  const generatorAspectRatioOptions = activeMode === "avatar"
    ? ["Source-driven"]
    : model === "Gemini Omni Flash" || model === "Grok Imagine Video 1.5"
    ? ["16:9", "9:16"]
    : model.startsWith("Kling 3.0")
    ? ["16:9", "9:16", "1:1"]
    : ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
  const generatorDurationOptions = model === "Gemini Omni Flash"
    ? [3, 5, 8, 10]
    : model === "Veo 3.1"
      ? [4, 6, 8]
      : model === "Grok Imagine Video 1.5"
        ? [6, 8, 10, 15]
        : [5, 8, 10, 15];
  const musicDurationOptions = model === "Lyria 3" ? [30] : [30, 60, 120, 180];
  const voiceOptions = model === "GPT Voice"
    ? ["marin", "cedar", "coral", "alloy", "nova", "onyx"]
    : ["Rachel", "Aria", "Brian", "Roger"];

  const selectCreditModel = (nextModel: CreditModel) => {
    setCreditModel(nextModel);
    setCreditVideoInput(false);
    setCreditNativeAudio(true);
    if (nextModel === "kling" && creditResolution === "480p") {
      setCreditResolution("720p");
    }
  };

  const toggleVideoInput = () => setCreditVideoInput((value) => !value);

  const addReferences = (kind: ReferenceKind, files: FileList | null, kindLimit: number, totalLimit: number) => {
    if (!files?.length) return;
    setReferences((current) => {
      const currentTotal = current.images.length + current.videos.length + current.audio.length;
      const openTotalSlots = Math.max(0, totalLimit - currentTotal);
      const openKindSlots = Math.max(0, kindLimit - current[kind].length);
      const accepted = Array.from(files)
        .filter((file) => !current[kind].some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))
        .slice(0, Math.min(openTotalSlots, openKindSlots));
      return accepted.length ? { ...current, [kind]: [...current[kind], ...accepted] } : current;
    });
  };

  const clearReferences = () => setReferences(emptyReferences());

  const resetGenerator = () => {
    generatorRunRef.current += 1;
    setGeneratorStatus("ready");
    setGeneratorMessage("Ready for a secure SHAZAN render.");
    setGeneratorVideoUrl("");
    setGeneratorOutputType(activeMode === "image" ? "image" : activeMode === "music" || activeMode === "voice" ? "audio" : "video");
    setGeneratorRequestId("");
  };

  const changeModel = (value: string) => {
    setModel(value);
    if (value === "GPT Voice") setVoicePreset("marin");
    else if (["ElevenLabs", "Multilingual Pro"].includes(value)) setVoicePreset("Rachel");
    else if (value === "Lyria 3") setMusicDuration(30);
    else if (value === "Gemini Omni Flash" || value === "Veo 3.1") setVideoDuration(8);
    else if (value === "Grok Imagine Video 1.5") setVideoDuration(6);
    else setVideoDuration(5);
    clearReferences();
    resetGenerator();
  };

  const switchMode = (mode: Mode) => {
    setActiveMode(mode);
    setModel(modelMap[mode][0]);
    if (mode === "voice") setVoicePreset("marin");
    clearReferences();
    setVideoGeneratorOpen(false);
    resetGenerator();
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
    const nextPrompt = prompt.trim() || (activeMode === "voice" && model === "Voice Forge"
      ? "Warm cinematic Indian narrator, deep resonant tone, precise Hindi and English pronunciation, calm authority"
      : promptIdeas[activeMode]);
    if (!prompt.trim()) setPrompt(nextPrompt);

    if (activeMode === "video" || activeMode === "image" || activeMode === "music" || activeMode === "voice" || activeMode === "avatar") {
      if (generatorStatus === "failed") resetGenerator();
      setGeneratorOutputType(activeMode === "image" ? "image" : activeMode === "music" || activeMode === "voice" ? "audio" : "video");
      setCreationReady(false);
      setVideoGeneratorOpen(true);
      return;
    }
    setGenerating(false);
    setCreationReady(true);
  };

  const requestVideoRender = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setGeneratorStatus("failed");
      setGeneratorMessage("Generate karne se pehle prompt likhiye.");
      return;
    }

    if (model.startsWith("Seedance 2.0") && references.audio.length > 0 && references.images.length + references.videos.length === 0) {
      setGeneratorStatus("failed");
      setGeneratorMessage("Seedance audio reference ke saath kam se kam ek image ya video reference bhi chahiye.");
      return;
    }
    if ((model === "Grok Imagine Video 1.5" || model === "Kling 3.0 Omni 4K") && references.images.length === 0) {
      setGeneratorStatus("failed");
      setGeneratorMessage(`${model} ke liye ek first-frame image required hai.`);
      return;
    }
    if (activeMode === "avatar") {
      const missingImage = references.images.length === 0;
      const missingAudio = (model === "Avatar One" || model === "Digital Twin") && references.audio.length === 0;
      const missingVideo = model === "Performance Capture" && references.videos.length === 0;
      if (missingImage || missingAudio || missingVideo) {
        setGeneratorStatus("failed");
        setGeneratorMessage(missingImage
          ? `${model} ke liye character image required hai.`
          : missingAudio
            ? `${model} ke liye voice audio required hai.`
            : "Performance Capture ke liye driving video required hai.");
        return;
      }
    }

    const runId = generatorRunRef.current + 1;
    generatorRunRef.current = runId;
    setGeneratorVideoUrl("");
    setGeneratorOutputType(activeMode === "image" ? "image" : activeMode === "music" || activeMode === "voice" ? "audio" : "video");
    setGeneratorRequestId("");

    try {
      const uploadFile = async (file: File) => {
        const response = await fetch("/api/studio/upload", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Studio-Access": studioAccessCode,
          },
          body: file,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractApiMessage(payload, `Upload failed (${response.status})`));
        if (typeof payload.url !== "string") throw new Error("Secure upload URL nahi mila.");
        return payload.url as string;
      };

      const hasReferences = referenceTotal > 0;
      if (hasReferences) {
        setGeneratorStatus("uploading");
        setGeneratorMessage(`${referenceTotal} reference file${referenceTotal === 1 ? "" : "s"} secure upload ho rahe hain…`);
      } else {
        setGeneratorStatus("queued");
        setGeneratorMessage("SHAZAN render request prepare ho rahi hai…");
      }

      const [imageReferences, videoReferences, audioReferences] = await Promise.all([
        Promise.all(references.images.map(uploadFile)),
        Promise.all(references.videos.map(uploadFile)),
        Promise.all(references.audio.map(uploadFile)),
      ]);
      if (generatorRunRef.current !== runId) return;

      const normalizedResolution = generatorResolutionOptions.includes(videoResolution) ? videoResolution : "720p";
      const argumentsPayload: Record<string, unknown> = {
        prompt: cleanPrompt,
        aspect_ratio: activeMode === "avatar" ? "source" : generatorAspectRatioOptions.includes(videoAspectRatio) ? videoAspectRatio : "16:9",
        duration: activeMode === "music" ? musicDuration : videoDuration,
        resolution: normalizedResolution,
      };

      if (activeMode === "voice") argumentsPayload.voice = voicePreset;

      if (activeMode === "avatar") {
        if (imageReferences.length) argumentsPayload.image_references = imageReferences;
        if (audioReferences.length) argumentsPayload.audio_references = audioReferences;
        if (videoReferences.length) argumentsPayload.video_references = videoReferences;
      } else if (activeMode === "image") {
        if (imageReferences.length) argumentsPayload.image_references = imageReferences;
      } else if (model.startsWith("Seedance 2.0")) {
        argumentsPayload.generate_audio = true;
        if (imageReferences.length) argumentsPayload.image_references = imageReferences;
        if (videoReferences.length) argumentsPayload.video_references = videoReferences;
        if (audioReferences.length) argumentsPayload.audio_references = audioReferences;
      } else if (model === "Kling 3.0 Pro" || model === "Kling 3.0 Omni 4K") {
        argumentsPayload.sound = "on";
        if (imageReferences[0]) argumentsPayload.start_image = imageReferences[0];
        if (imageReferences[1]) argumentsPayload.end_image = imageReferences[1];
      } else if (model === "Kling 3.0 Elements") {
        argumentsPayload.sound = "on";
        if (videoReferences.length) argumentsPayload.video_references = videoReferences;
      } else {
        if (imageReferences[0]) {
          argumentsPayload.start_image = imageReferences[0];
          argumentsPayload.image_url = imageReferences[0];
        }
        if (imageReferences[1]) argumentsPayload.end_image = imageReferences[1];
      }

      setGeneratorStatus("queued");
      setGeneratorMessage("Request accepted hone ka wait kar rahe hain…");
      const submitResponse = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Studio-Access": studioAccessCode },
        body: JSON.stringify({ model: getApiModelKey(model), arguments: argumentsPayload }),
      });
      let payload: unknown = await submitResponse.json().catch(() => ({}));
      if (!submitResponse.ok) throw new Error(extractApiMessage(payload, `Generation failed (${submitResponse.status})`));
      if (generatorRunRef.current !== runId) return;

      let responseRecord = payload as Record<string, unknown>;
      const requestId = typeof responseRecord.request_id === "string" ? responseRecord.request_id : "";
      if (requestId) setGeneratorRequestId(requestId);

      for (let attempt = 0; attempt < 120; attempt += 1) {
        const status = typeof responseRecord.status === "string" ? responseRecord.status.toLowerCase() : "queued";
        const media = extractMedia(payload);
        if (status === "completed" && media) {
          setGeneratorVideoUrl(media.url);
          setGeneratorOutputType(media.type);
          setGeneratorStatus("completed");
          setGeneratorMessage(`${media.type === "image" ? "Image" : media.type === "audio" ? "Audio" : "Video"} ready hai — preview ya download kar sakte hain.`);
          return;
        }
        if (["failed", "nsfw", "canceled", "cancelled"].includes(status)) {
          throw new Error(extractApiMessage(payload, status === "nsfw" ? "Prompt moderation mein reject hua; failed task charge nahi hoga." : `Generation ${status}.`));
        }
        if (!requestId) throw new Error("Render service ne request ID return nahi ki.");

        setGeneratorStatus(status === "in_progress" || status === "processing" ? "processing" : "queued");
        setGeneratorMessage(status === "in_progress" || status === "processing" ? `SHAZAN ${activeMode} render kar raha hai…` : "Request queue mein hai…");
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        if (generatorRunRef.current !== runId) return;

        const statusResponse = await fetch(`/api/studio/status/${encodeURIComponent(requestId)}`, {
          cache: "no-store",
          headers: { "X-Studio-Access": studioAccessCode },
        });
        payload = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(extractApiMessage(payload, `Status check failed (${statusResponse.status})`));
        responseRecord = payload as Record<string, unknown>;
      }
      throw new Error("Render abhi bhi process ho raha hai. Request ID save hai; thodi der baad dobara check karein.");
    } catch (error) {
      if (generatorRunRef.current !== runId) return;
      setGeneratorStatus("failed");
      setGeneratorMessage(error instanceof Error ? error.message : "Generation start nahi ho saki.");
    }
  };

  const openAuth = (view: AuthView) => {
    setAuthView(view);
    setAuthError("");
    setAuthPassword("");
    setAuthConfirm("");
    setAuthOpen(true);
    setMobileOpen(false);
    setAccountOpen(false);
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authView === "register" && authPassword !== authConfirm) {
      setAuthError("Dono passwords match nahi karte.");
      return;
    }
    setAuthSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch(`/api/auth/${authView}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authView === "register"
          ? { name: authName, email: authEmail, password: authPassword }
          : { email: authEmail, password: authPassword }),
      });
      const responseText = await response.text();
      let payload: { authenticated?: boolean; user?: AuthUser; error?: string; message?: string } = {};
      try { payload = JSON.parse(responseText); } catch { payload = {}; }
      if (!response.ok || !payload.authenticated || !payload.user) {
        throw new Error(payload.message || payload.error || `Account request failed (${response.status}).`);
      }
      setAuthUser(payload.user);
      setAuthPassword("");
      setAuthConfirm("");
      setAuthOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Account service unavailable hai.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = async () => {
    setAccountOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      setAuthUser(null);
    }
  };

  const passwordRules = {
    length: authPassword.length >= 12,
    mixed: /[a-z]/.test(authPassword) && /[A-Z]/.test(authPassword),
    number: /[0-9]/.test(authPassword),
    symbol: /[^A-Za-z0-9]/.test(authPassword),
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

        <div className="header-actions">
          {authUser ? (
            <div className="account-shell">
              <button className="account-pill" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}>
                <span>{authUser.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                <b>{authUser.name.split(" ")[0]}</b>
                <Icon name="chevron" size={15} />
              </button>
              {accountOpen && (
                <div className="account-menu">
                  <small>SHAZAN ACCOUNT</small>
                  <b>{authUser.name}</b>
                  <span>{authUser.email}</span>
                  <div><span>Available credits</span><strong>{authUser.credits}</strong></div>
                  <button onClick={logout}>Sign out <Icon name="arrow" size={15} /></button>
                </div>
              )}
            </div>
          ) : (
            <button className="auth-trigger" onClick={() => openAuth("login")} disabled={authLoading}>
              {authLoading ? "Account" : "Sign in"}
            </button>
          )}
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
        </div>
      </header>

      {authOpen && (
        <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setAuthOpen(false); }}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <aside className="auth-visual">
              <span className="auth-visual-mark"><Icon name="sparkle" size={22} /></span>
              <div>
                <small>PRIVATE CREATIVE IDENTITY</small>
                <h2>Your worlds.<br /><em>Safely yours.</em></h2>
                <p>One secure SHAZAN account for projects, credits and every generation.</p>
              </div>
              <ul>
                <li><Icon name="check" size={16} /> Secure HttpOnly session</li>
                <li><Icon name="check" size={16} /> Strong password protection</li>
                <li><Icon name="check" size={16} /> Credits linked to your account</li>
              </ul>
            </aside>

            <div className="auth-form-panel">
              <button className="auth-close" onClick={() => setAuthOpen(false)} aria-label="Close account window"><Icon name="close" size={20} /></button>
              <span className="auth-eyebrow">SHAZAN AI ACCESS</span>
              <h2 id="auth-title">{authView === "login" ? "Welcome back." : "Create your account."}</h2>
              <p>{authView === "login" ? "Sign in to continue your creative universe." : "Set up your secure identity for projects and credits."}</p>

              <div className="auth-tabs" role="tablist" aria-label="Account action">
                <button className={authView === "login" ? "active" : ""} onClick={() => { setAuthView("login"); setAuthError(""); }} role="tab" aria-selected={authView === "login"}>Sign in</button>
                <button className={authView === "register" ? "active" : ""} onClick={() => { setAuthView("register"); setAuthError(""); }} role="tab" aria-selected={authView === "register"}>Register</button>
              </div>

              <form onSubmit={submitAuth}>
                {authView === "register" && (
                  <label><span>Full name</span><input value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" maxLength={40} required placeholder="Your name" /></label>
                )}
                <label><span>Email address</span><input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="you@example.com" /></label>
                <label><span>Password</span><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authView === "register" ? "new-password" : "current-password"} minLength={authView === "register" ? 12 : undefined} maxLength={128} required placeholder={authView === "register" ? "Minimum 12 characters" : "Enter your password"} /></label>
                {authView === "register" && (
                  <>
                    <label><span>Confirm password</span><input type="password" value={authConfirm} onChange={(event) => setAuthConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Repeat your password" /></label>
                    <div className="password-rules" aria-label="Password requirements">
                      <span className={passwordRules.length ? "valid" : ""}><i /> 12+ characters</span>
                      <span className={passwordRules.mixed ? "valid" : ""}><i /> Upper + lowercase</span>
                      <span className={passwordRules.number ? "valid" : ""}><i /> Number</span>
                      <span className={passwordRules.symbol ? "valid" : ""}><i /> Symbol</span>
                    </div>
                  </>
                )}
                {authError && <div className="auth-error" role="alert"><Icon name="sliders" size={17} /><span>{authError}</span></div>}
                <button className="auth-submit" disabled={authSubmitting} type="submit">
                  {authSubmitting ? <span className="loader" /> : <Icon name="sparkle" size={18} />}
                  {authSubmitting ? "Please wait…" : authView === "login" ? "Secure sign in" : "Create account"}
                </button>
              </form>
              <small className="auth-security-note">Passwords raw form mein store nahi hote. Secure hashing aur private server session use hota hai.</small>
              <button className="auth-switch" onClick={() => { setAuthView(authView === "login" ? "register" : "login"); setAuthError(""); }}>
                {authView === "login" ? "New to SHAZAN? Create an account" : "Already registered? Sign in"}
              </button>
            </div>
          </section>
        </div>
      )}

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

            {(activeMode === "image" || activeMode === "video" || activeMode === "avatar") && (
              <div className="reference-bay">
                <div className="reference-head">
                  <span><Icon name="layers" size={18} /><b>{activeMode === "image" ? "Image references" : videoInputProfile.title}</b></span>
                  <small>{activeMode !== "image"
                    ? `${videoInputProfile.summary} · ${referenceTotal}/${videoInputProfile.totalLimit} attached`
                    : `${references.images.length}/9 workspace slots · character, style or composition`}</small>
                  {referenceTotal > 0 && <button onClick={clearReferences}>Clear all</button>}
                </div>

                <div className={`reference-slots ${activeMode === "image" || videoInputProfile.slots.length === 1 ? "single-slot" : ""}`}>
                  {activeMode === "image" ? (
                    <label className={references.images.length ? "reference-upload has-files" : "reference-upload"}>
                      <input type="file" accept="image/*" multiple onChange={(event) => { addReferences("images", event.currentTarget.files, 9, 9); event.currentTarget.value = ""; }} />
                      <Icon name="image" size={19} />
                      <span><b>{references.images.length ? `${references.images.length} attached` : "Add images"}</b><small>9 workspace slots</small></span>
                      <em>+</em>
                    </label>
                  ) : videoInputProfile.slots.map((slot) => (
                    <label className={references[slot.kind].length ? "reference-upload has-files" : "reference-upload"} key={`${model}-${slot.kind}`}>
                      <input
                        type="file"
                        accept={slot.accept}
                        multiple={slot.limit > 1}
                        onChange={(event) => { addReferences(slot.kind, event.currentTarget.files, slot.limit, videoInputProfile.totalLimit); event.currentTarget.value = ""; }}
                      />
                      <Icon name={slot.kind === "images" ? "image" : slot.kind === "videos" ? "video" : "music"} size={19} />
                      <span><b>{references[slot.kind].length ? `${references[slot.kind].length} attached` : slot.label}</b><small>{slot.note}</small></span>
                      <em>+</em>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="control-row">
              <label className="select-control model-control">
                <span><Icon name="sparkle" size={18} /> Model</span>
                <select value={model} onChange={(event) => changeModel(event.target.value)}>
                  {modelMap[activeMode].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="select-control">
                <span><Icon name={activeMode === "music" ? "music" : activeMode === "voice" ? "voice" : "expand"} size={17} /> {activeMode === "music" ? "Track length" : activeMode === "voice" ? (model === "Voice Forge" ? "Mode" : "Voice") : activeMode === "avatar" ? "Framing" : "Aspect ratio"}</span>
                {activeMode === "music" ? (
                  <select value={musicDurationOptions.includes(musicDuration) ? musicDuration : musicDurationOptions[0]} onChange={(event) => setMusicDuration(Number(event.target.value))}>
                    {musicDurationOptions.map((option) => <option value={option} key={option}>{option} sec</option>)}
                  </select>
                ) : activeMode === "voice" ? (
                  model === "Voice Forge" ? <select defaultValue="Design preview"><option>Design preview</option></select> : <select value={voiceOptions.includes(voicePreset) ? voicePreset : voiceOptions[0]} onChange={(event) => setVoicePreset(event.target.value)}>{voiceOptions.map((option) => <option key={option}>{option}</option>)}</select>
                ) : activeMode === "avatar" ? (
                  <select value="Source-driven" aria-readonly="true"><option>Source-driven</option></select>
                ) : (
                  <select value={videoAspectRatio} onChange={(event) => setVideoAspectRatio(event.target.value)}>
                    <option value="16:9">16:9 Widescreen</option><option value="9:16">9:16 Vertical</option><option value="1:1">1:1 Square</option><option value="4:3">4:3 Landscape</option>
                  </select>
                )}
              </label>
              <label className="select-control">
                <span><Icon name="cube" size={17} /> {activeMode === "music" || activeMode === "voice" ? "Format" : "Quality"}</span>
                {activeMode === "music" || activeMode === "voice" ? <select defaultValue="MP3"><option>MP3</option></select> : (
                  <select value={activeMode === "video" || activeMode === "avatar" ? (generatorResolutionOptions.includes(videoResolution) ? videoResolution : generatorResolutionOptions[0]) : "2k"} onChange={(event) => { if (activeMode === "video" || activeMode === "avatar") setVideoResolution(event.target.value); }}>
                    {(activeMode === "video" || activeMode === "avatar" ? generatorResolutionOptions : ["1k", "2k", "4k"]).map((option) => <option key={option}>{option}</option>)}
                  </select>
                )}
              </label>
              {activeMode !== "music" && activeMode !== "voice" && activeMode !== "avatar" && <label className="select-control hide-small">
                <span><Icon name="layers" size={17} /> Style</span>
                <select defaultValue="Cinematic">
                  <option>Cinematic</option><option>Photoreal</option><option>Editorial</option><option>Anime</option>
                </select>
              </label>}
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
                onClick={() => changeModel(card.name)}
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
            <span><small>API connection pending</small><b>{currentMode.label} generator abhi public render ke liye connected nahi hai</b></span>
            <button onClick={() => setCreationReady(false)} aria-label="Close result"><Icon name="close" size={17} /></button>
          </div>
        )}
      </section>

      {videoGeneratorOpen && (
        <div className="video-generator-overlay" role="presentation">
          <section className="video-generator-modal" role="dialog" aria-modal="true" aria-labelledby="video-generator-title">
            <header className="video-generator-header">
              <span className="generator-brand"><Icon name={activeMode} size={20} /></span>
              <span><small>SHAZAN {activeMode.toUpperCase()} GENERATOR</small><b id="video-generator-title">{model}</b></span>
              <button onClick={() => setVideoGeneratorOpen(false)} aria-label={`Close ${activeMode} generator`}><Icon name="close" size={21} /></button>
            </header>

            <div className="video-generator-body">
              <div className={generatorVideoUrl ? "generator-preview has-result" : "generator-preview"}>
                <span className="generator-preview-badge"><Icon name="sparkle" size={14} /> {videoInputProfile.title}</span>
                {generatorVideoUrl ? (
                  generatorOutputType === "video" ? (
                    <video src={generatorVideoUrl} controls playsInline preload="metadata" />
                  ) : generatorOutputType === "audio" ? (
                    <audio src={generatorVideoUrl} controls preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={generatorVideoUrl} alt={`${model} generated result`} />
                  )
                ) : (
                  <>
                    <span className={generatorBusy ? "generator-play is-loading" : "generator-play"}><Icon name={generatorBusy ? "sparkle" : "play"} size={32} /></span>
                    <span className="generator-preview-copy"><small>{generatorBusy ? "SHAZAN RENDER" : "PREVIEW CANVAS"}</small><b>{generatorBusy ? generatorMessage : `Your generated ${activeMode} will appear here`}</b></span>
                  </>
                )}
              </div>

              <div className="generator-settings">
                <div className="generator-model-row">
                  <span><small>SELECTED MODEL</small><b>{model}</b></span>
                  <em>{model.startsWith("Seedance 2.0") ? "Multimodal" : videoInputProfile.title}</em>
                </div>

                <label className="generator-prompt">
                  <span>{activeMode === "voice" ? (model === "Voice Forge" ? "Voice description" : "Script") : "Prompt"}</span>
                  <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
                </label>

                <div className="generator-control-grid">
                  {activeMode === "music" ? (
                    <>
                      <label><span>Track length</span><select value={musicDurationOptions.includes(musicDuration) ? musicDuration : musicDurationOptions[0]} onChange={(event) => setMusicDuration(Number(event.target.value))}>{musicDurationOptions.map((option) => <option value={option} key={option}>{option} sec</option>)}</select></label>
                      <label><span>Output</span><select value="MP3" aria-readonly="true"><option>MP3 audio</option></select></label>
                    </>
                  ) : activeMode === "voice" ? (
                    <>
                      {model === "Voice Forge" ? <label><span>Mode</span><select defaultValue="Design preview"><option>Design preview</option></select></label> : <label><span>Voice</span><select value={voiceOptions.includes(voicePreset) ? voicePreset : voiceOptions[0]} onChange={(event) => setVoicePreset(event.target.value)}>{voiceOptions.map((option) => <option key={option}>{option}</option>)}</select></label>}
                      <label><span>Output</span><select defaultValue="MP3"><option>MP3 audio</option></select></label>
                    </>
                  ) : activeMode === "avatar" ? (
                    <>
                      <label><span>Framing</span><select value="Source-driven" aria-readonly="true"><option>Source-driven</option></select></label>
                      <label><span>Resolution</span><select value={generatorResolutionOptions.includes(videoResolution) ? videoResolution : generatorResolutionOptions[0]} onChange={(event) => setVideoResolution(event.target.value)}>{generatorResolutionOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                    </>
                  ) : (
                    <>
                      <label><span>Aspect</span><select value={generatorAspectRatioOptions.includes(videoAspectRatio) ? videoAspectRatio : "16:9"} onChange={(event) => setVideoAspectRatio(event.target.value)}>{generatorAspectRatioOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                      <label><span>Resolution</span><select value={generatorResolutionOptions.includes(videoResolution) ? videoResolution : "720p"} onChange={(event) => setVideoResolution(event.target.value)}>{generatorResolutionOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                      {activeMode === "video" && <label><span>Duration</span><select value={generatorDurationOptions.includes(videoDuration) ? videoDuration : generatorDurationOptions[0]} onChange={(event) => setVideoDuration(Number(event.target.value))}>{generatorDurationOptions.map((option) => <option value={option} key={option}>{option} sec</option>)}</select></label>}
                    </>
                  )}
                </div>

                <div className="generator-input-summary">
                  <span><Icon name="layers" size={17} /><b>{videoInputProfile.title}</b></span>
                  <small>{videoInputProfile.summary}</small>
                  {activeMode === "voice" && <small>This output is AI-generated speech, not a human recording.</small>}
                  <div>
                    {videoInputProfile.slots.length === 0 && <i>Prompt only</i>}
                    {videoInputProfile.slots.map((slot) => (
                      <i key={slot.kind}>{references[slot.kind].length}/{slot.limit} {slot.kind}</i>
                    ))}
                  </div>
                  {referenceTotal > 0 && <p>{[...references.images, ...references.videos, ...references.audio].map((file) => file.name).join(" · ")}</p>}
                </div>

                <label className="generator-access-code">
                  <span>Owner access code</span>
                  <input
                    type="password"
                    value={studioAccessCode}
                    onChange={(event) => setStudioAccessCode(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Cloudflare STUDIO_ACCESS_CODE"
                  />
                  <small>Credits wallet launch hone tak paid renders owner-only hain.</small>
                </label>

                {generatorStatus !== "ready" && (
                  <div className={`generator-api-notice status-${generatorStatus}`} role="status">
                    <Icon name={generatorStatus === "completed" ? "check" : generatorStatus === "failed" ? "sliders" : "sparkle"} size={19} />
                    <span><b>{generatorStatus === "completed" ? "Render complete" : generatorStatus === "failed" ? "Render could not start" : generatorStatus === "uploading" ? "Uploading references" : generatorStatus === "queued" ? "Queued" : "Rendering"}</b><small>{generatorMessage}{generatorRequestId ? ` · Request ${generatorRequestId}` : ""}</small></span>
                  </div>
                )}

                <div className="generator-actions">
                  <button className="generator-back" onClick={() => setVideoGeneratorOpen(false)}>Back to inputs</button>
                  <button className="generator-render" onClick={requestVideoRender} disabled={generatorBusy}><Icon name="sparkle" size={18} /> {generatorBusy ? "Generating…" : generatorStatus === "completed" ? "Generate another" : `Generate ${activeMode}`}</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="latest-models-section" aria-labelledby="latest-models-title">
        <div className="latest-models-heading">
          <div>
            <p className="kicker">LIVE MODEL LIBRARY · JULY 2026</p>
            <h2 id="latest-models-title">Every frontier model.<br /><em>One command center.</em></h2>
          </div>
          <p>Switch engines without rebuilding your prompt. Every video model exposes only the input controls it actually supports.</p>
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
              <span><small>MODEL-SPECIFIC VIDEO INPUTS</small><b>Director-grade Video Models</b></span>
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
            <h2 id="credit-lab-title">Know every input.<br /><em>See the base cost.</em></h2>
          </div>
          <p>Choose a model and settings before you generate. Verified reference capacity and the current public base-rate estimate stay visible at every step.</p>
        </div>

        <div className="credit-model-tabs" role="tablist" aria-label="Credit model">
          <button className={creditModel === "seedance" ? "active" : ""} onClick={() => selectCreditModel("seedance")} role="tab" aria-selected={creditModel === "seedance"}>
            <span><Icon name="video" size={20} /></span><b>Seedance 2.0 Standard</b><small>from $0.057/sec</small>
          </button>
          <button className={creditModel === "kling" ? "active" : ""} onClick={() => selectCreditModel("kling")} role="tab" aria-selected={creditModel === "kling"}>
            <span><Icon name="layers" size={20} /></span><b>Kling 3.0 Elements</b><small>from $0.07/sec</small>
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
                ? "Use up to 15 assets total in one instruction, within per-type caps of 9 images, 3 videos and 3 audio clips."
                : "Kling Elements accepts prompt-addressable image, video or audio elements. It is not presented as Seedance-style 9 + 3 + 3 multimodal input."}
            </p>
          </article>

          <article className="credit-calculator">
            <header><span><small>BASE API COST PREVIEW</small><b>Generation estimate</b></span><Icon name="sliders" size={22} /></header>

            <div className="calculator-fields">
              <label>
                <span>Resolution</span>
                <select value={creditResolution} onChange={(event) => setCreditResolution(event.target.value as CreditResolution)}>
                  {creditModel === "seedance" && <option>480p</option>}
                  <option>720p</option>
                  <option>1080p</option>
                  <option>4K</option>
                </select>
              </label>
              <label>
                <span>Duration</span>
                <select value={creditDuration} onChange={(event) => setCreditDuration(Number(event.target.value))}>
                  <option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option>
                </select>
              </label>
            </div>

            <div className="calculator-toggles">
              <button className={creditVideoInput ? "active" : ""} onClick={toggleVideoInput} aria-pressed={creditVideoInput}>
                <span><Icon name="video" size={18} /><b>Video reference</b></span><i />
              </button>
              <button className={creditNativeAudio ? "active" : ""} onClick={() => setCreditNativeAudio((value) => !value)} aria-pressed={creditNativeAudio}>
                <span><Icon name="voice" size={18} /><b>Native audio</b></span><i />
              </button>
            </div>

            {creditModel === "kling" && creditVideoInput && <p className="calculator-info">Kling 3.0 uses the uploaded clip as a prompt-addressable video element.</p>}
            {creditModel === "seedance" && <p className="calculator-info">Seedance keeps image, video and audio references inside its dedicated multimodal workflow.</p>}

            <div className="credit-total">
              <span><small>PUBLIC BASE ESTIMATE</small><b>{creditTotal}</b><em>{creditMath}</em></span>
              <span className="credit-coin"><Icon name="sparkle" size={25} /></span>
            </div>
            <p className="rate-note">Base public API estimate only; mode and resolution can change actual usage. SHAZAN customer credits will launch only after wallet and rate-lock are connected.</p>
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
