-- Example raffles and challenges (the ones described in the brief).
-- Run after the migration. To make someone admin:
--   update public.profiles set is_admin = true where username = '<usuario>';

with r as (
  insert into public.raffles (title, description, prize, sponsor, status, starts_at, ends_at, draw_at)
  values
    ('Sorteo Primavera Allende', 'Sumá kilómetros esta primavera y participá.', 'Chequeo deportivo completo en el Sanatorio Allende', 'Sanatorio Allende', 'active', now(), now() + interval '30 days', now() + interval '31 days'),
    ('Zapatillas de running', 'Desafíos de constancia y superación.', 'Un par de zapatillas de running', 'Marca auspiciante', 'active', now(), now() + interval '30 days', now() + interval '31 days'),
    ('Corredores todo terreno', 'Para quienes salen con lluvia o frío.', 'Campera rompeviento + reloj GPS', 'Marca auspiciante', 'active', now(), now() + interval '60 days', now() + interval '61 days')
  returning id, title
)
insert into public.challenges (raffle_id, title, description, category, rule, status, starts_at, ends_at)
select r.id, c.title, c.description, c.category::public.challenge_category, c.rule::jsonb, 'active', now(), now() + interval '30 days'
from r join (values
  ('Sorteo Primavera Allende', '10 km en un día', '', 'distance', '{"type":"daily_distance","min_km":10}'),
  ('Sorteo Primavera Allende', '25 km en la semana', '', 'distance', '{"type":"weekly_distance","min_km":25}'),
  ('Sorteo Primavera Allende', 'Ritmo constante', 'Entre 5:30 y 6:30 min/km', 'pace', '{"type":"pace_range","fastest_pace_s":330,"slowest_pace_s":390,"min_km":3}'),
  ('Zapatillas de running', 'Superá tu semana', 'Más km que la semana pasada', 'progress', '{"type":"beat_previous_week","min_previous_km":3}'),
  ('Zapatillas de running', '5 días seguidos', '', 'streak', '{"type":"streak","days":5,"min_km_per_day":2}'),
  ('Corredores todo terreno', 'Bajo la lluvia', '', 'weather', '{"type":"rain","min_precip_mm":0.3,"min_km":3}'),
  ('Corredores todo terreno', 'Frío intenso', '5 °C o menos', 'weather', '{"type":"cold","max_temp_c":5,"min_km":3}')
) as c(raffle, title, description, category, rule) on c.raffle = r.title;
