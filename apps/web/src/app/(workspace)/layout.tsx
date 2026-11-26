import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { auth } from "@/auth";

export default async function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <WorkspaceShell email={session.user.email ?? "Signed-in user"}>{children}</WorkspaceShell>;
}
