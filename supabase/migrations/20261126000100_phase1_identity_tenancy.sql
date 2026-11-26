-- Phase 1: Supabase identity, institutions, memberships, and tenant isolation.
create extension if not exists pgcrypto;

create type public.institution_role as enum ('owner', 'admin', 'teacher', 'examiner');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.institution_role not null default 'teacher',
  created_at timestamptz not null default now(),
  unique (institution_id, user_id)
);

create index institution_members_user_id_idx on public.institution_members(user_id);
create index institution_members_institution_id_idx on public.institution_members(institution_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger institutions_set_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- SECURITY DEFINER helpers avoid recursive RLS evaluation on membership checks.
create or replace function public.is_active_member(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.institution_members m
    where m.institution_id = p_institution_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_institution_role(
  p_institution_id uuid,
  p_allowed_roles public.institution_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.institution_members m
    where m.institution_id = p_institution_id
      and m.user_id = auth.uid()
      and m.role = any(p_allowed_roles)
  );
$$;

create or replace function public.create_institution(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 2 and 100 then
    raise exception 'Invalid institution name' using errcode = '22023';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 48 then
    raise exception 'Invalid institution slug' using errcode = '22023';
  end if;

  insert into public.institutions (name, slug, created_by)
  values (trim(p_name), p_slug, v_user_id)
  returning id into v_institution_id;

  insert into public.institution_members (institution_id, user_id, role)
  values (v_institution_id, v_user_id, 'owner');

  return v_institution_id;
end;
$$;

revoke all on function public.create_institution(text, text) from public;
revoke all on function public.is_active_member(uuid) from public;
revoke all on function public.has_institution_role(uuid, public.institution_role[]) from public;
grant execute on function public.create_institution(text, text) to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_institution_role(uuid, public.institution_role[]) to authenticated;

-- Explicit table/column grants complement RLS and prevent clients changing
-- immutable ownership and identity columns.
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.institutions to authenticated;
grant update (name, slug) on public.institutions to authenticated;
grant select, insert, delete on public.institution_members to authenticated;
grant update (role) on public.institution_members to authenticated;

alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_members enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "institutions_select_members"
on public.institutions for select to authenticated
using (public.is_active_member(id));

create policy "institutions_update_admins"
on public.institutions for update to authenticated
using (public.has_institution_role(id, array['owner', 'admin']::public.institution_role[]))
with check (public.has_institution_role(id, array['owner', 'admin']::public.institution_role[]));

create policy "members_select_same_institution"
on public.institution_members for select to authenticated
using (public.is_active_member(institution_id));

create policy "members_insert_admins"
on public.institution_members for insert to authenticated
with check (
  public.has_institution_role(institution_id, array['owner']::public.institution_role[])
  or (
    role = 'teacher'
    and public.has_institution_role(institution_id, array['admin']::public.institution_role[])
  )
);

create policy "members_update_admins"
on public.institution_members for update to authenticated
using (
  user_id <> auth.uid()
  and (
    public.has_institution_role(institution_id, array['owner']::public.institution_role[])
    or (
      role = 'teacher'
      and public.has_institution_role(institution_id, array['admin']::public.institution_role[])
    )
  )
)
with check (
  public.has_institution_role(institution_id, array['owner']::public.institution_role[])
  or (
    role = 'teacher'
    and public.has_institution_role(institution_id, array['admin']::public.institution_role[])
  )
);

create policy "members_delete_admins"
on public.institution_members for delete to authenticated
using (
  user_id <> auth.uid()
  and (
    public.has_institution_role(institution_id, array['owner']::public.institution_role[])
    or (
      role = 'teacher'
      and public.has_institution_role(institution_id, array['admin']::public.institution_role[])
    )
  )
);

-- Authenticated users can only access their own membership records or records
-- for institutions where they are already members, as defined above.
