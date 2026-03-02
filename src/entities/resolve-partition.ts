export function resolvePartition(region: string | null): string {
    if (!region || region === "*") {
        return "aws";
    }
    if (region.startsWith("us-gov-")) {
        return "aws-us-gov";
    }
    if (region.startsWith("cn-")) {
        return "aws-cn";
    }
    return "aws";
}
