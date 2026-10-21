import { z } from "zod";

export const MAX_COMMENT_LENGTH = 1000;
export const MAX_GUESTBOOK_LENGTH = 500;

/** Plain text only: control characters removed, at most one blank line in a row. */
function cleanText(max: number) {
  return z
    .string()
    .transform((s) =>
      s
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(z.string().min(1, "Write something first.").max(max, `At most ${max} characters.`));
}

export const commentSchema = z.object({ body: cleanText(MAX_COMMENT_LENGTH) });
export const guestbookSchema = z.object({ body: cleanText(MAX_GUESTBOOK_LENGTH) });
