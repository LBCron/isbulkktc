begin;

-- Google does not send `given_name` / `family_name`; it sends `name` and
-- `full_name`. Before 20261031150000_v4_oauth_derived_names.sql the claims
-- reader left the pair null for every Google account, so the account card
-- rendered a name next to two empty first/last fields. These assertions pin the
-- derivation, the provider-precedence rule and the single-token edge case.

select plan(15);

-- A Google payload: only the combined name is present.
select is(
  (
    select given_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz","picture":"https://example.test/a.jpg"}'::jsonb
    )
  ),
  'Ayşe',
  'given_name is derived from the first token of a Google full_name'
);

select is(
  (
    select family_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz"}'::jsonb
    )
  ),
  'Yılmaz',
  'family_name is derived from the remainder of a Google full_name'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz"}'::jsonb
    )
  ),
  'Ayşe Yılmaz',
  'the combined display name is unchanged'
);

-- A LinkedIn payload already carries the pair; it must win over the split.
select is(
  (
    select given_name
    from public.oauth_profile_claims(
      '{"name":"Yılmaz, Ayşe","given_name":"Ayşe","family_name":"Yılmaz"}'::jsonb
    )
  ),
  'Ayşe',
  'an explicit provider given_name wins over the derived one'
);

select is(
  (
    select family_name
    from public.oauth_profile_claims(
      '{"name":"Yılmaz, Ayşe","given_name":"Ayşe","family_name":"Yılmaz"}'::jsonb
    )
  ),
  'Yılmaz',
  'an explicit provider family_name wins over the derived one'
);

-- A mononym has no family name; an empty string would violate the column CHECK
-- for a value the candidate never typed, so it must stay null.
select is(
  (
    select family_name
    from public.oauth_profile_claims('{"full_name":"Madonna"}'::jsonb)
  ),
  null,
  'a single-token name yields a null family name, never an empty string'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims('{}'::jsonb)
  ),
  null,
  'an empty provider payload yields no display name'
);

-- The normalisation the TypeScript `deriveDisplayName` helper mirrors. These
-- pin the exact semantics the JS reader had to be rewritten to match (PR #68),
-- so a future change to the SQL that the helper does not follow turns red here
-- rather than shipping a greeting that disagrees with the stored profile.

-- `btrim` without a character set strips only spaces (U+0020): a non-breaking
-- space is part of the name, not padding.
select is(
  (
    select display_name
    from public.oauth_profile_claims(
      jsonb_build_object('display_name', chr(160) || 'Ada' || chr(160))
    )
  ),
  chr(160) || 'Ada' || chr(160),
  'a non-breaking space is not trimmed, because btrim strips only U+0020'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(jsonb_build_object('display_name', '  Ada  '))
  ),
  'Ada',
  'surrounding spaces are trimmed'
);

-- `_meta ->> 'display_name'` coerces a JSON number or boolean to its text form.
select is(
  (
    select display_name
    from public.oauth_profile_claims(jsonb_build_object('display_name', 42))
  ),
  '42',
  'a numeric claim is coerced to text, not treated as absent'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(jsonb_build_object('display_name', true))
  ),
  'true',
  'a boolean claim is coerced to text, not treated as absent'
);

-- `coalesce` stops at the first non-null, and the `concat_ws` pair fallback is
-- itself never null — so a control-only `display_name` yields no name and the
-- `full_name` is never reached. A *space*-only value is null after `btrim`, so
-- it does fall through.
select is(
  (
    select display_name
    from public.oauth_profile_claims(
      jsonb_build_object('display_name', chr(9), 'full_name', 'Grace')
    )
  ),
  null,
  'a control-only display_name does not fall through to full_name'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(
      jsonb_build_object('display_name', ' ', 'full_name', 'Grace')
    )
  ),
  'Grace',
  'a space-only display_name does fall through to full_name'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(
      jsonb_build_object('display_name', 'A' || chr(127) || 'B')
    )
  ),
  'AB',
  'control characters are stripped from the middle of a name'
);

-- `left(..., 80)` counts characters, not bytes: 90 astral emoji must cap at 80
-- whole characters rather than splitting a surrogate pair.
select is(
  (
    select char_length(display_name)
    from public.oauth_profile_claims(
      jsonb_build_object('display_name', repeat(chr(128512), 90))
    )
  ),
  80,
  'the 80-character cap counts characters, not bytes'
);

select * from finish();

rollback;
