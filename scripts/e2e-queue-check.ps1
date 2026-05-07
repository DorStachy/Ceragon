$queues = @(
  'ceragon-production-release-observation',
  'ceragon-production-release-observation-dlq',
  'ceragon-production-artifact-fetch-background',
  'ceragon-production-artifact-fetch-background-dlq',
  'ceragon-production-analysis-static-background',
  'ceragon-production-analysis-static-background-dlq',
  'ceragon-production-analysis-dynamic-background',
  'ceragon-production-analysis-dynamic-background-dlq',
  'ceragon-production-analysis-dynamic-urgent',
  'ceragon-production-analysis-dynamic-urgent-dlq',
  'ceragon-production-intel-dynamic-jobs',
  'ceragon-production-intel-dynamic-jobs-dlq',
  'ceragon-production-intel-static-jobs',
  'ceragon-production-intel-static-jobs-dlq',
  'ceragon-production-intel-result-write',
  'ceragon-production-intel-result-write-dlq',
  'ceragon-production-hotset-events',
  'ceragon-production-hotset-events-dlq',
  'ceragon-production-verdict-write',
  'ceragon-production-verdict-write-dlq'
)
foreach ($q in $queues) {
  $url = "https://sqs.eu-north-1.amazonaws.com/113627991972/$q"
  $json = aws sqs get-queue-attributes --queue-url $url --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible --output json 2>$null
  $r = $json | ConvertFrom-Json
  Write-Output "$q vis=$($r.Attributes.ApproximateNumberOfMessages) inflight=$($r.Attributes.ApproximateNumberOfMessagesNotVisible)"
}
