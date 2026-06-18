# Cognito Module

resource "aws_cognito_user_pool" "pool" {
  name = "elderpinq-${var.environment}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "role" # Custom attribute custom:role
    required                 = false

    string_attribute_constraints {
      min_length = 2
      max_length = 20
    }
  }

  tags = {
    Name        = "elderpinq-${var.environment}-user-pool"
    Environment = var.environment
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "elderpinq-${var.environment}-user-pool-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}
