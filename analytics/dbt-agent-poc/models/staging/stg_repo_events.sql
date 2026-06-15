select
  event_id,
  repo_id,
  event_type,
  cast(event_at as date) as event_at
from {{ ref('events') }}
