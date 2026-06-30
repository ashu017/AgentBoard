import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { devLoginEnabled } from "@/lib/dev-flags";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/board");
  const { error } = await searchParams;
  return <LoginClient devEnabled={devLoginEnabled()} oauthError={error === "oauth"} />;
}
