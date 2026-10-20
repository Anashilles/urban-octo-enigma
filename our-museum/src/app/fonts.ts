import { Amiri, Cormorant_Garamond, IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";

/** Display serif for headings (Latin). SIL Open Font License. */
export const displayLatin = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display-latin",
  display: "swap",
});

/** Display serif for Arabic headings. SIL Open Font License. */
export const displayArabic = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-display-ar",
  display: "swap",
});

/** Body sans (Latin). SIL Open Font License. */
export const bodyLatin = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/** Body sans for Arabic. SIL Open Font License. */
export const bodyArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-body-ar",
  display: "swap",
});

export const fontVariables = [displayLatin, displayArabic, bodyLatin, bodyArabic].map((f) => f.variable).join(" ");
