import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <WorkspaceShell email={user.email ?? "Signed-in user"}>{children}</WorkspaceShell>;
}
