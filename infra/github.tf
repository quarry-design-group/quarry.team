# github.tf
#
# The Worker runtime secrets Terraform generates, written into the repository's
# deploy environments. GitHub is the one inventory of the Worker's secrets:
# every Deploy Web run ships the WORKER_* secrets of its environment, named in
# the workflow's `worker-secrets` map, with the new Worker version
# (.github/scripts/worker-secrets.mjs, `wrangler deploy --secrets-file`). The Turnstile widget secrets originate here, so Terraform
# writes them; the provider encrypts each value client-side before the API
# call, so it never passes through a shell or a job log. Rotating a widget
# rewrites both environments on the next apply, and the next deploy ships it.
#
# Refresh reads only each secret's metadata (GitHub never returns a value), so
# plans and the drift check see a secret edited or deleted outside Terraform.
# As with every sensitive attribute, the value is stored in state (R2), next
# to the widget resource that already carries it.

locals {
  # Secret name -> the Terraform value it carries.
  worker_generated_secrets = {
    WORKER_TURNSTILE_SECRET            = module.web.turnstile_secret
    WORKER_TURNSTILE_GRIEVANCES_SECRET = module.web.turnstile_grievances_secret
  }

  # One entry per environment x secret; keys are "<environment>/<secret>".
  worker_environment_secrets = {
    for pair in setproduct(var.deploy_environments, keys(local.worker_generated_secrets)) :
    "${pair[0]}/${pair[1]}" => { environment = pair[0], secret_name = pair[1] }
  }
}

resource "github_actions_environment_secret" "worker" {
  for_each = local.worker_environment_secrets

  repository  = var.github_repository
  environment = each.value.environment
  secret_name = each.value.secret_name
  value       = local.worker_generated_secrets[each.value.secret_name]
}
