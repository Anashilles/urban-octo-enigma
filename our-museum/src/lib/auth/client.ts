"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient, inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    anonymousClient(),
    inferAdditionalFields({
      user: { locale: { type: "string", required: false } },
    }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
