"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(_prev: unknown, formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_TOKEN) {
    return { error: "Server not configured." };
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return { error: "Wrong password." };
  }
  cookies().set("nisria_session", process.env.SESSION_TOKEN, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
  redirect("/");
}

export async function logout() {
  cookies().delete("nisria_session");
  redirect("/login");
}
