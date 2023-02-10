variable "ecs_cluster_arn" {
  description = "ECS cluster in which the service to track is running"
  type        = string
}

variable "ecs_service" {
  description = "Name of the ECS service to track"
  type        = string
}

