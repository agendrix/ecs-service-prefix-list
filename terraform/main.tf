locals {
  lambda_zip = "${path.module}/lambda.zip"
}

resource "aws_ec2_managed_prefix_list" "ecs_service_prefix_list" {
  name           = "${var.ecs_cluster_arn}-${var.ecs_service}"
  address_family = "IPv4"
  max_entries    = 1000
}

resource "aws_lambda_function" "lambda" {
  function_name    = "ecs-service-prefix-list-${var.ecs_cluster_arn}-${var.ecs_service}"
  filename         = local.lambda_zip
  source_code_hash = filebase64sha256(local.lambda_zip)
  handler          = "index.handler"
  role             = aws_iam_role.lambda_execution_role.arn

  runtime = "nodejs16.x"

  environment {
    variables = {
      REGION         = data.aws_region.current.name
      PREFIX_LIST_ID = aws_ec2_managed_prefix_list.ecs_service_prefix_list.id
    }
  }

  dynamic "dead_letter_config" {
    for_each = var.sns_topic_to_notify_on_failure != null ? [var.sns_topic_to_notify_on_failure] : []
    iterator = sns_topic_arn
    content {
      target_arn = sns_topic_arn.value
    }
  }
}

resource "aws_iam_role" "lambda_execution_role" {
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "allow_put_events" {
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ec2:DescribeManagedPrefixLists",
          "ec2:GetManagedPrefixListEntries",
          "ec2:ModifyManagedPrefixLis"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "allow_sns_topic_notification" {
  count = var.sns_topic_to_notify_on_failure != null ? 1 : 0
  role  = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = "sns:Publish"
        Resource = var.sns_topic_to_notify_on_failure
      }
    ]
  })
}

resource "aws_lambda_permission" "allow_invocation_from_eventbridge" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_service_events.arn
}

resource "aws_cloudwatch_event_rule" "ecs_service_events" {
  name = "ecs-service-prefix-list-${var.ecs_cluster_arn}-${var.ecs_service}"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [var.ecs_cluster_arn],
      group      = ["service:${var.ecs_service}"]
      lastStatus = [
        "PENDING",
        "STOPPED"
      ]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_service_events" {
  rule = aws_cloudwatch_event_rule.ecs_service_events.name
  arn  = aws_lambda_function.lambda.arn
}

data "aws_region" "current" {}
