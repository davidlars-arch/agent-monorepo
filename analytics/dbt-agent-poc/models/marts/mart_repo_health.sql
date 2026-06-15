with repos as (
  select * from {{ ref('stg_repos') }}
),

events as (
  select
    repo_id,
    count(*) as event_count,
    max(event_at) as latest_event_at
  from {{ ref('stg_repo_events') }}
  group by 1
),

runs as (
  select
    repo_id,
    count(*) as run_count,
    sum(case when status = 'planned' then 1 else 0 end) as planned_run_count
  from {{ ref('runs') }}
  group by 1
)

select
  repos.repo_id,
  repos.repo_name,
  repos.repo_kind,
  repos.owner,
  repos.status,
  coalesce(events.event_count, 0) as event_count,
  events.latest_event_at,
  coalesce(runs.run_count, 0) as run_count,
  coalesce(runs.planned_run_count, 0) as planned_run_count
from repos
left join events using (repo_id)
left join runs using (repo_id)
