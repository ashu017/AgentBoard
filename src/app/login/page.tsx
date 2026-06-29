import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { devLoginEnabled } from "@/lib/dev-flags";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <LoginClient devEnabled={devLoginEnabled()} />;
}
