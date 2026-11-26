"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createInstitutionSchema } from "@/lib/validations/institution";

export async function createInstitution(formData: FormData) {
  const parsed = createInstitutionSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=invalid_institution");
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { error } = await supabase.rpc("create_institution", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    const code = error.code === "23505" ? "slug_taken" : "institution_create_failed";
    redirect(`/dashboard?error=${code}`);
  }

  redirect("/dashboard?created=1");
}
