import { defineCommand, runMain } from "citty";

const main = defineCommand({
    meta: {
        name: "lousy-iam",
        description:
            "Analyze and generate least-privilege AWS IAM policies from CDK applications",
    },
});

runMain(main);
