# ECS Service Prefix list 

_An AWS Lambda for automatically tracking ecs service task ip's in a Prefix list_

![Release](https://github.com/agendrix/route53-event-forwarder/workflows/Release/badge.svg) ![Tests](https://github.com/agendrix/route53-event-forwarder/workflows/Tests/badge.svg?branch=main)

## Description

Security groups cannot reference a security group from another region.([doc](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-security-groups.html)). The goal of this module is to create a [managed AWS Prefix List](https://docs.aws.amazon.com/vpc/latest/userguide/managed-prefix-lists.html) that is automatically populated with the tasks ip adresses of an ECS service. Security groups from another region can reference this list to allow ingress traffic from a specific ECS service. 

## How to use with Terraform

Add the module to your [Terraform](https://www.terraform.io/) project:

```terraform
module "terraform_aws_lambda" {
  source       = "github.com/agendrix/ecs-service-prefix-list.git//terraform?ref=v1.0.0"

  ecs_cluster_arn = aws_ecs_cluster.cluster.arc
  ecs_service = aws_ecs_service.service.name
}
```
