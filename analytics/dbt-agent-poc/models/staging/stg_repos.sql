select
  repo_id,
  repo_name,
  repo_kind,
  owner,
  status
from {{ ref('repos') }}
