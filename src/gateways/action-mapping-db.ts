import type { ResourceActionEntry } from "../entities/resource-actions.js";
import type { ActionMappingDb } from "../use-cases/action-mapping-db.port.js";

const RESOURCE_ACTIONS: readonly ResourceActionEntry[] = [
    {
        terraformType: "aws_s3_bucket",
        service: "s3",
        actions: {
            read: [
                "s3:GetBucketLocation",
                "s3:GetBucketPolicy",
                "s3:GetBucketAcl",
                "s3:GetBucketCORS",
                "s3:GetBucketVersioning",
                "s3:GetBucketLogging",
                "s3:GetBucketTagging",
                "s3:GetEncryptionConfiguration",
                "s3:GetLifecycleConfiguration",
                "s3:GetReplicationConfiguration",
                "s3:GetAccelerateConfiguration",
                "s3:GetBucketObjectLockConfiguration",
                "s3:GetBucketPublicAccessBlock",
                "s3:GetBucketWebsite",
                "s3:ListBucket",
            ],
            create: [
                "s3:CreateBucket",
                "s3:PutBucketPolicy",
                "s3:PutBucketAcl",
                "s3:PutBucketCORS",
                "s3:PutBucketVersioning",
                "s3:PutBucketLogging",
                "s3:PutBucketTagging",
                "s3:PutEncryptionConfiguration",
                "s3:PutLifecycleConfiguration",
                "s3:PutBucketPublicAccessBlock",
            ],
            update: [
                "s3:PutBucketPolicy",
                "s3:PutBucketAcl",
                "s3:PutBucketCORS",
                "s3:PutBucketVersioning",
                "s3:PutBucketLogging",
                "s3:PutBucketTagging",
                "s3:PutEncryptionConfiguration",
                "s3:PutLifecycleConfiguration",
                "s3:PutBucketPublicAccessBlock",
            ],
            delete: ["s3:DeleteBucket", "s3:DeleteBucketPolicy"],
            tag: ["s3:PutBucketTagging"],
        },
    },
    {
        terraformType: "aws_ecs_cluster",
        service: "ecs",
        actions: {
            read: ["ecs:DescribeClusters", "ecs:ListTagsForResource"],
            create: ["ecs:CreateCluster"],
            update: ["ecs:UpdateCluster", "ecs:UpdateClusterSettings"],
            delete: ["ecs:DeleteCluster"],
            tag: ["ecs:TagResource", "ecs:UntagResource"],
        },
    },
    {
        terraformType: "aws_ecs_service",
        service: "ecs",
        actions: {
            read: ["ecs:DescribeServices", "ecs:ListTagsForResource"],
            create: ["ecs:CreateService"],
            update: ["ecs:UpdateService"],
            delete: ["ecs:DeleteService"],
            tag: ["ecs:TagResource", "ecs:UntagResource"],
        },
    },
    {
        terraformType: "aws_ecs_task_definition",
        service: "ecs",
        actions: {
            read: ["ecs:DescribeTaskDefinition", "ecs:ListTagsForResource"],
            create: ["ecs:RegisterTaskDefinition"],
            update: ["ecs:RegisterTaskDefinition"],
            delete: ["ecs:DeregisterTaskDefinition"],
            tag: ["ecs:TagResource", "ecs:UntagResource"],
        },
    },
    {
        terraformType: "aws_lambda_function",
        service: "lambda",
        actions: {
            read: [
                "lambda:GetFunction",
                "lambda:GetFunctionConfiguration",
                "lambda:GetFunctionCodeSigningConfig",
                "lambda:GetPolicy",
                "lambda:ListVersionsByFunction",
                "lambda:ListTags",
            ],
            create: ["lambda:CreateFunction"],
            update: [
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration",
                "lambda:PublishVersion",
            ],
            delete: ["lambda:DeleteFunction"],
            tag: ["lambda:TagResource", "lambda:UntagResource"],
        },
    },
    {
        terraformType: "aws_iam_role",
        service: "iam",
        actions: {
            read: [
                "iam:GetRole",
                "iam:GetRolePolicy",
                "iam:ListRolePolicies",
                "iam:ListAttachedRolePolicies",
                "iam:ListInstanceProfilesForRole",
            ],
            create: [
                "iam:CreateRole",
                "iam:PutRolePolicy",
                "iam:AttachRolePolicy",
            ],
            update: [
                "iam:UpdateRole",
                "iam:UpdateAssumeRolePolicy",
                "iam:PutRolePolicy",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:DeleteRolePolicy",
            ],
            delete: [
                "iam:DeleteRole",
                "iam:DeleteRolePolicy",
                "iam:DetachRolePolicy",
            ],
            tag: ["iam:TagRole", "iam:UntagRole"],
        },
    },
    {
        terraformType: "aws_iam_policy",
        service: "iam",
        actions: {
            read: [
                "iam:GetPolicy",
                "iam:GetPolicyVersion",
                "iam:ListPolicyVersions",
            ],
            create: ["iam:CreatePolicy"],
            update: ["iam:CreatePolicyVersion", "iam:DeletePolicyVersion"],
            delete: ["iam:DeletePolicy", "iam:DeletePolicyVersion"],
            tag: ["iam:TagPolicy", "iam:UntagPolicy"],
        },
    },
    {
        terraformType: "aws_vpc",
        service: "ec2",
        actions: {
            read: [
                "ec2:DescribeVpcs",
                "ec2:DescribeVpcAttribute",
                "ec2:DescribeTags",
            ],
            create: ["ec2:CreateVpc", "ec2:ModifyVpcAttribute"],
            update: ["ec2:ModifyVpcAttribute"],
            delete: ["ec2:DeleteVpc"],
            tag: ["ec2:CreateTags", "ec2:DeleteTags"],
        },
    },
    {
        terraformType: "aws_subnet",
        service: "ec2",
        actions: {
            read: ["ec2:DescribeSubnets", "ec2:DescribeTags"],
            create: ["ec2:CreateSubnet"],
            update: ["ec2:ModifySubnetAttribute"],
            delete: ["ec2:DeleteSubnet"],
            tag: ["ec2:CreateTags", "ec2:DeleteTags"],
        },
    },
    {
        terraformType: "aws_security_group",
        service: "ec2",
        actions: {
            read: [
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeSecurityGroupRules",
                "ec2:DescribeTags",
            ],
            create: [
                "ec2:CreateSecurityGroup",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:AuthorizeSecurityGroupEgress",
            ],
            update: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:AuthorizeSecurityGroupEgress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupEgress",
            ],
            delete: ["ec2:DeleteSecurityGroup"],
            tag: ["ec2:CreateTags", "ec2:DeleteTags"],
        },
    },
    {
        terraformType: "aws_lb",
        service: "elasticloadbalancing",
        actions: {
            read: [
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                "elasticloadbalancing:DescribeTags",
            ],
            create: ["elasticloadbalancing:CreateLoadBalancer"],
            update: [
                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                "elasticloadbalancing:SetSecurityGroups",
                "elasticloadbalancing:SetSubnets",
            ],
            delete: ["elasticloadbalancing:DeleteLoadBalancer"],
            tag: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
            ],
        },
    },
    {
        terraformType: "aws_lb_target_group",
        service: "elasticloadbalancing",
        actions: {
            read: [
                "elasticloadbalancing:DescribeTargetGroups",
                "elasticloadbalancing:DescribeTargetGroupAttributes",
                "elasticloadbalancing:DescribeTags",
            ],
            create: ["elasticloadbalancing:CreateTargetGroup"],
            update: [
                "elasticloadbalancing:ModifyTargetGroup",
                "elasticloadbalancing:ModifyTargetGroupAttributes",
            ],
            delete: ["elasticloadbalancing:DeleteTargetGroup"],
            tag: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
            ],
        },
    },
    {
        terraformType: "aws_lb_listener",
        service: "elasticloadbalancing",
        actions: {
            read: [
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeTags",
            ],
            create: ["elasticloadbalancing:CreateListener"],
            update: ["elasticloadbalancing:ModifyListener"],
            delete: ["elasticloadbalancing:DeleteListener"],
            tag: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
            ],
        },
    },
    {
        terraformType: "aws_cloudwatch_log_group",
        service: "logs",
        actions: {
            read: ["logs:DescribeLogGroups", "logs:ListTagsLogGroup"],
            create: ["logs:CreateLogGroup", "logs:PutRetentionPolicy"],
            update: ["logs:PutRetentionPolicy"],
            delete: ["logs:DeleteLogGroup"],
            tag: ["logs:TagResource", "logs:UntagResource"],
        },
    },
    {
        terraformType: "aws_route53_record",
        service: "route53",
        actions: {
            read: ["route53:GetHostedZone", "route53:ListResourceRecordSets"],
            create: ["route53:ChangeResourceRecordSets"],
            update: ["route53:ChangeResourceRecordSets"],
            delete: ["route53:ChangeResourceRecordSets"],
            tag: [],
        },
    },
    {
        terraformType: "aws_db_instance",
        service: "rds",
        actions: {
            read: ["rds:DescribeDBInstances", "rds:ListTagsForResource"],
            create: ["rds:CreateDBInstance"],
            update: ["rds:ModifyDBInstance"],
            delete: ["rds:DeleteDBInstance"],
            tag: ["rds:AddTagsToResource", "rds:RemoveTagsFromResource"],
        },
    },
] as const;

export function createActionMappingDb(): ActionMappingDb {
    const byTerraformType = new Map<string, ResourceActionEntry>();
    for (const entry of RESOURCE_ACTIONS) {
        byTerraformType.set(entry.terraformType, entry);
    }

    return {
        lookupByTerraformType(
            terraformType: string,
        ): ResourceActionEntry | undefined {
            return byTerraformType.get(terraformType);
        },
    };
}
