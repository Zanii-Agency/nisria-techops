"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCredentials, identityCookieValue, USER_COOKIE } from "../../lib/auth";

export async function login(_prev: unknown, formData: FormData) {
  const identifier = String(formData.get("identifier") || "");
  const password = String(formData.get("password") || "");

  if (!process.env.SESSION_TOKEN) {
    return { error: "Server not configured." };
  }

  const user = verifyCredentials(identifier, password);
  if (!user) {
    return { error: "Wrong email or password." };
  }

  const identity = identityCookieValue(user.id);
  if (!identity) {
    return { error: "Server not configured." };
  }

  const opts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  };
  // Gate cookie proves "logged in"; identity cookie carries WHO.
  cookies().set("nisria_session", process.env.SESSION_TOKEN, opts);
  cookies().set(USER_COOKIE, identity, opts);
  redirect("/");
}

export async function logout() {
  cookies().delete("nisria_session");
  cookies().delete(USER_COOKIE);
  redirect("/login");
}
