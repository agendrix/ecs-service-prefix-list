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
