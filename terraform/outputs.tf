output "lambda_function" {
  value = aws_lambda_function.lambda
}

output "prefix_list_id" {
  value = aws_ec2_managed_prefix_list.ecs_service_prefix_list.id
}
