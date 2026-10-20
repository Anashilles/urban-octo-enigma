import type { IllustrationPalette } from "@/components/landing/gallery-illustration";
import type { TemplateId } from "./templates";

/** Colours for the 2D template previews, matching each template's 3D materials. */
export const TEMPLATE_PALETTES: Record<TemplateId, IllustrationPalette> = {
  "minimal-white": {
    back: ["#f7f6f2", "#eeece6"],
    left: ["#e9e6df", "#f2f0eb"],
    right: ["#e6e2da", "#f1eee8"],
    ceiling: ["#ffffff", "#f3f1ec"],
    floor: ["#dcc7a4", "#c7ae86"],
    frame: "#1b1a19",
    accentFrame: "#1b1a19",
    trim: "#d8d3c9",
    plank: "#9f875f",
  },
  "warm-romantic": {
    back: ["#efe3cf", "#e2d2b8"],
    left: ["#d9c6a8", "#e6d8c1"],
    right: ["#d4c09f", "#e3d4bb"],
    ceiling: ["#f3eadc", "#e8dcc8"],
    floor: ["#8a5e3e", "#5e3f29"],
    frame: "#c6a66a",
    accentFrame: "#c6a66a",
    trim: "#4a3628",
    plank: "#3a2618",
  },
  "modern-contemporary": {
    back: ["#ebeae7", "#dddbd7"],
    left: ["#cfcdc8", "#dedcd8"],
    right: ["#cac8c3", "#dad8d3"],
    ceiling: ["#3a3b3d", "#2c2d2f"],
    floor: ["#b3b2ae", "#8f8e8a"],
    frame: "#f1efea",
    accentFrame: "#e8e6e0",
    trim: "#9b9993",
    plank: "#6f6e6a",
  },
  "dark-luxury": {
    back: ["#33302d", "#262422"],
    left: ["#1f1d1b", "#2a2826"],
    right: ["#1c1a19", "#282624"],
    ceiling: ["#151413", "#0f0e0d"],
    floor: ["#2a2725", "#121110"],
    frame: "#c6a66a",
    accentFrame: "#c6a66a",
    trim: "#8c7344",
    plank: "#8c7344",
  },
};
