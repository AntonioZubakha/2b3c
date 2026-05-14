# Creates overlay networks required by docker-compose.prod.local.yml when they use external: true.
# Run once after `docker swarm init` and before `docker stack deploy -c docker-compose.prod.local.yml lgdx`,
# or after `docker stack rm` / network errors ("network ... not found").
# Requires: Docker Swarm (same node as stack deploy).
# Do not use $ErrorActionPreference = Stop: docker writes "not found" to stderr, which
# would abort the script before we can run network create.
$names = @("lgdx_lgdx-network", "lgdx_monitoring-network")
foreach ($n in $names) {
  & docker network inspect $n 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating overlay network: $n"
    & docker network create -d overlay --attachable $n
    if ($LASTEXITCODE -ne 0) {
      throw "docker network create failed for $n (is Swarm init? run: docker swarm init)"
    }
  } else {
    Write-Host "Network already exists: $n"
  }
}
Write-Host 'OK. Next: docker stack deploy -c docker-compose.prod.local.yml lgdx'
