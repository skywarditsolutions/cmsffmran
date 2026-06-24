terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

# No `endpoints` block here on purpose: locally we run via `tflocal`, which
# injects LocalStack endpoints automatically, keeping this configuration
# identical for an AWS GovCloud deployment.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "RAN"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
