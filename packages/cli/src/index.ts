#!/usr/bin/env bun
import { createCli } from "./presentation/cli";

await createCli().parseAsync(process.argv);
