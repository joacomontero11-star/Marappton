-- Nobody signed out may call any of these.
revoke execute on function public.handle_new_user(), public.follow_auto_accept(), public.is_admin(),
  public.is_follower(uuid, uuid), public.can_view_profile(uuid, uuid), public.can_view_run(uuid, uuid, public.visibility),
  public.user_raffles(uuid), public.active_raffle_counts(uuid[]), public.raffle_stats(uuid), public.draw_raffle(uuid)
  from public, anon;
-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user(), public.follow_auto_accept() from authenticated;
-- Signed-in users need the privacy helpers (row rules use them) and the raffle functions,
-- which check permissions themselves.
grant execute on function public.is_admin(), public.is_follower(uuid, uuid), public.can_view_profile(uuid, uuid),
  public.can_view_run(uuid, uuid, public.visibility), public.user_raffles(uuid), public.active_raffle_counts(uuid[]),
  public.raffle_stats(uuid), public.draw_raffle(uuid) to authenticated;
