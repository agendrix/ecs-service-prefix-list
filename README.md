# ECS Service Prefix list 

_An AWS Lambda for automatically tracking ecs service task ip's in a Prefix list across regions_

[![Release](https://github.com/agendrix/ecs-service-prefix-list/actions/workflows/release.yml/badge.svg)](https://github.com/agendrix/ecs-service-prefix-list/actions/workflows/release.yml)
[![Tests](https://github.com/agendrix/ecs-service-prefix-list/actions/workflows/test.yml/badge.svg)](https://github.com/agendrix/ecs-service-prefix-list/actions/workflows/test.yml)
## Description

Security groups cannot reference a security group from another region.([doc](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-security-groups.html)). The goal of this module is to create a [managed AWS Prefix List](https://docs.aws.amazon.com/vpc/latest/userguide/managed-prefix-lists.html) that is automatically populated with the tasks ip adresses of an ECS service across region. Security groups from another region can reference this list to allow ingress traffic from a specific ECS service. 



## How to use with Terraform

### requested providers

`tracker`: AWS provider that wants to track the ecs service in another region 
`tracked`: AWS provider of the ecs service being tracked

Add the module to your [Terraform](https://www.terraform.io/) project:

```terraform
module "terraform_aws_lambda" {
  source       = "github.com/agendrix/ecs-service-prefix-list.git//terraform?ref=v1.0.0"

  ecs_cluster_arn = aws_ecs_cluster.cluster.arn
  ecs_service = aws_ecs_service.service.name

  providers = {
    tracker = aws.ca-central-1
    tracked = aws.eu-west-3
  } 
}
```
