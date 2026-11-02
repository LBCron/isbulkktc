-- Carries the provider avatar onto accounts created before `profiles.avatar_url`
-- existed.
--
-- `avatar_url` / `given_name` / `family_name` were added in
-- 20261031140000_v4_oauth_profile_autofill.sql. `handle_new_auth_user` fills
-- them on INSERT, but its `on conflict (id) do nothing` means an account that
-- already existed is left alone, and `sync_oauth_profile` only runs on a fresh
-- OAuth sign-in. So every social account created before that migration keeps a
-- null avatar until its owner happens to sign in again — confirmed against the
-- live project, where four of the five social accounts carry a provider picture
-- in `raw_user_meta_data` but a null `profiles.avatar_url`.
--
-- The 20261031160000 backfill repaired the name pair; this one repairs the
-- avatar. It reads only the account's own provider metadata and only fills a
-- null column, so an avatar the user set themselves is never overwritten.

update public.profiles p
set avatar_url = coalesce(p.avatar_url, c.avatar_url)
from auth.users u
cross join lateral public.oauth_profile_claims(u.raw_user_meta_data) c
where
  u.id = p.id
  and p.avatar_url is null
  and c.avatar_url is not null;
