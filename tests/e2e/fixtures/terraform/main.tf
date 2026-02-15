terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.98.0"
    }
  }
}

provider "aws" {
  region     = "us-east-1"
  access_key = "testing"
  secret_key = "testing"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  s3_use_path_style = true

  endpoints {
    s3  = var.aws_endpoint
    sts = var.aws_endpoint
  }
}

variable "aws_endpoint" {
  type    = string
  default = "http://moto:5000"
}

resource "aws_s3_bucket" "test" {
  bucket = "lousy-iam-e2e-test-bucket"
}
