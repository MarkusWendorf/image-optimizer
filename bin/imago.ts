#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ImagoStack } from "../lib/imago-stack";

const app = new cdk.App();
new ImagoStack(app, "ImageOptimizerStack", {});
