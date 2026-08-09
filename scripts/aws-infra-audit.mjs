import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const templatePath = new URL("../infra/aws/payshield-core.yaml", import.meta.url);
const githubRolePath = new URL("../infra/aws/github-deploy-role.yaml", import.meta.url);

const requiredControls = [
  ["private ECS networking", "AssignPublicIp: DISABLED"],
  ["private database", "PubliclyAccessible: false"],
  ["database encryption", "StorageEncrypted: true"],
  ["database deletion protection", "DeletionProtection: true"],
  ["database high availability", "MultiAZ: true"],
  ["35-day backups", "BackupRetentionPeriod: 35"],
  ["managed database credentials", "ManageMasterUserPassword: true"],
  ["TLS enforcement", 'rds.force_ssl: "1"'],
  ["immutable release images", "ImageTagMutability: IMMUTABLE"],
  ["image scanning", "ScanOnPush: true"],
  ["read-only container root", "ReadonlyRootFilesystem: true"],
  ["dropped Linux capabilities", "Drop: [ALL]"],
  ["deployment rollback", "Rollback: true"],
  ["WAF association", "AWS::WAFv2::WebACLAssociation"],
  ["load balancer access logging", "access_logs.s3.enabled"],
  ["application autoscaling", "AWS::ApplicationAutoScaling::ScalableTarget"],
  ["schema 0019", 'Value: "0019"'],
  ["migration script in image", "scripts/core-migrations.mjs"],
];

const requiredDeploymentControls = [
  ["GitHub environment-bound OIDC", "repo:${GitHubOrganization}/${GitHubRepository}:environment:${GitHubEnvironment}"],
  ["GitHub OIDC audience", "token.actions.githubusercontent.com:aud: sts.amazonaws.com"],
  ["dedicated CloudFormation execution role", "payshield-production-cloudformation"],
  ["dedicated GitHub deploy role", "payshield-production-github-deploy"],
  ["CloudFormation role pass restriction", "iam:PassedToService: cloudformation.amazonaws.com"],
  ["ECS role pass restriction", "iam:PassedToService: ecs-tasks.amazonaws.com"],
];

export function auditAwsInfrastructure({
  dockerfile = readFileSync(new URL("../Dockerfile.core", import.meta.url), "utf8"),
  githubRole = readFileSync(githubRolePath, "utf8"),
  template = readFileSync(templatePath, "utf8"),
} = {}) {
  const combined = `${template}\n${dockerfile}`;
  const failures = requiredControls
    .filter(([, marker]) => !combined.includes(marker))
    .map(([label]) => `Missing ${label}.`);
  failures.push(
    ...requiredDeploymentControls
      .filter(([, marker]) => !githubRole.includes(marker))
      .map(([label]) => `Missing ${label}.`),
  );

  if (!/USER\s+node\b/.test(dockerfile)) {
    failures.push("Core image must run as the non-root node user.");
  }

  if (!/COPY\s+scripts\/core-migrations\.mjs/.test(dockerfile)) {
    failures.push("Core image must contain the migration runner.");
  }

  return {
    controlsChecked: requiredControls.length + requiredDeploymentControls.length + 2,
    failures,
    ok: failures.length === 0,
    service: "payshield-aws-infrastructure",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const audit = auditAwsInfrastructure();
  console.log(JSON.stringify(audit, null, 2));

  if (!audit.ok) {
    process.exitCode = 1;
  }
}
