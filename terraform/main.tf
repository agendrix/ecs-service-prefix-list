locals {
  lambda_zip   = "${path.module}/lambda.zip"
  cluster_name = reverse(split("/", reverse(split(":", var.ecs_cluster_arn))[0]))[0]
}

resource "aws_ec2_managed_prefix_list" "ecs_service_prefix_list" {
  name           = "${var.ecs_cluster_arn}-${var.ecs_service}"
  address_family = "IPv4"
  max_entries    = var.max_entries

  lifecycle {
    ignore_changes = [entry]
  }

  provider = aws.tracker
}

resource "aws_cloudwatch_log_group" "log_group" {
  name              = "/aws/lambda/${aws_lambda_function.lambda.function_name}"
  retention_in_days = 7

  provider = aws.tracked
}

resource "aws_lambda_function" "lambda" {
  function_name    = "ecs-service-prefix-list-${local.cluster_name}-${var.ecs_service}"
  filename         = local.lambda_zip
  source_code_hash = filebase64sha256(local.lambda_zip)
  handler          = "index.handler"
  role             = aws_iam_role.lambda_execution_role.arn
  timeout          = "300"

  runtime = "nodejs16.x"

  environment {
    variables = {
      TRACKER_REGION = data.aws_region.tracker.name
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

  provider = aws.tracked
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

  provider = aws.tracked
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
          "ec2:ModifyManagedPrefixList"
        ]
        Resource = "*"
      },
      {
        "Effect" = "Allow"
        "Action" = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        "Resource" = "${aws_cloudwatch_log_group.log_group.arn}:*"
      }
    ]
  })

  provider = aws.tracked
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

  provider = aws.tracked
}

resource "aws_lambda_permission" "allow_invocation_from_eventbridge" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ecs_service_events.arn

  provider = aws.tracked
}

resource "aws_cloudwatch_event_rule" "ecs_service_events" {
  name = "ecs-service-prefix-list-${local.cluster_name}-${var.ecs_service}"

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

  provider = aws.tracked
}

resource "aws_cloudwatch_event_target" "ecs_service_events" {
  rule = aws_cloudwatch_event_rule.ecs_service_events.name
  arn  = aws_lambda_function.lambda.arn

  provider = aws.tracked
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${title(local.cluster_name)} - ${title(var.ecs_service)} - Prefix List Lambda Errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  statistic           = "Maximum"
  period              = 60
  threshold           = 0
  datapoints_to_alarm = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  dimensions = {
    Resource = aws_lambda_function.lambda.function_name
  }

  provider = aws.tracked
}

data "aws_region" "tracked" {
  provider = aws.tracked
}

data "aws_region" "tracker" {
  provider = aws.tracker
}
