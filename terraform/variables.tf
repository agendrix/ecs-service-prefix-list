variable "ecs_cluster_arn" {
  description = "ECS cluster in which the service to track is running"
  type        = string
}

variable "ecs_service" {
  description = "Name of the ECS service to track"
  type        = string
}

variable "sns_topic_to_notify_on_failure" {
  description = "Arn of the sns topic to notify on lambda invocation failure."
  type        = string
  default     = null
}

variable "max_entries" {
  description = <<desc
    Maximum number of entries in the prefix list.
    When you reference a prefix list in a resource, the maximum number of entries for the prefix lists counts against the quota for the number of entries for the resource."
  desc
  type        = number
  default     = 60 # Default security group ingress rule quota
}
