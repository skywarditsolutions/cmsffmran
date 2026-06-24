# Customer-managed key used for field-level encryption of consumer PII/PHI.
# Mirrors the CMS ARS requirement that sensitive data is encrypted at rest with
# a controlled key.
resource "aws_kms_key" "pii" {
  description             = "RAN consumer PII/PHI field-level encryption key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "pii" {
  name          = "alias/${var.name_prefix}-pii"
  target_key_id = aws_kms_key.pii.key_id
}
