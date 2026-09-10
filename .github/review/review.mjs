import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 40 * 1024 * 1024;
export const schema = {
	type: "object",
	additionalProperties: false,
	required: ["complete", "summary", "findings"],
	properties: {
		complete: { type: "boolean" },
		summary: { type: "string", minLength: 1, maxLength: 6000 },
		findings: {
			type: "array",
			maxItems: 30,
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"category",
					"severity",
					"path",
					"line",
					"explanation",
					"remedy",
				],
				properties: {
					category: {
						enum: [
							"correctness",
							"security",
							"requirements",
							"verification",
							"architecture",
						],
					},
					severity: { enum: ["P0", "P1", "P2"] },
					path: { type: "string", minLength: 1, maxLength: 500 },
					line: { type: ["integer", "null"], minimum: 1 },
					explanation: { type: "string", minLength: 1, maxLength: 1500 },
					remedy: { type: "string", minLength: 1, maxLength: 1000 },
				},
			},
		},
	},
};

export function safePath(path) {
	return (
		typeof path === "string" &&
		path.length > 0 &&
		!path.startsWith("/") &&
		!path.includes("\\") &&
		![...path].some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) &&
		path
			.split("/")
			.every((part) => part && part !== "." && part !== ".." && part !== ".git")
	);
}

export function validateResult(result, changedFiles) {
	if (
		!result ||
		typeof result.complete !== "boolean" ||
		typeof result.summary !== "string" ||
		!result.summary.trim() ||
		result.summary.length > 6000 ||
		!Array.isArray(result.findings) ||
		result.findings.length > 30 ||
		Object.keys(result).some(
			(key) => !["complete", "summary", "findings"].includes(key),
		)
	) {
		throw new Error("Invalid or incomplete structured review output");
	}
	for (const finding of result.findings) {
		const properties = schema.properties.findings.items.properties;
		if (
			!finding ||
			Object.keys(finding).length !== 6 ||
			!properties.category.enum.includes(finding.category) ||
			!properties.severity.enum.includes(finding.severity) ||
			!safePath(finding.path) ||
			!changedFiles.includes(finding.path) ||
			!(
				finding.line === null ||
				(Number.isSafeInteger(finding.line) && finding.line > 0)
			) ||
			!["explanation", "remedy"].every(
				(key) =>
					typeof finding[key] === "string" &&
					finding[key].trim() &&
					finding[key].length <= properties[key].maxLength,
			)
		) {
			throw new Error("Invalid review finding");
		}
	}
	return result.complete
		? result.findings.length
			? "REQUEST_CHANGES"
			: "APPROVE"
		: "COMMENT";
}

export function isCurrent(state, pr) {
	return (
		pr.state === "open" &&
		pr.head.sha === state.head &&
		pr.base.sha === state.base &&
		(!state.briefHash || state.briefHash === briefHash(pr))
	);
}

export function briefHash(pr) {
	return createHash("sha256")
		.update(JSON.stringify([pr.title, pr.body]))
		.digest("hex");
}

export function enforceEvidence(
	result,
	missingPaths,
	requestedModel,
	usedModels,
) {
	const limits = [];
	if (missingPaths.length)
		limits.push(
			"Changed files were omitted from the source snapshot; inspect manifest.json and escalate.",
		);
	if (
		!usedModels.length ||
		usedModels.some((model) => model !== requestedModel)
	) {
		limits.push(
			"The reported model differs from the selected model or was not reported; verify account/model routing.",
		);
	}
	return limits.length
		? {
				...result,
				complete: false,
				summary: `${result.summary}\n\n${limits.join(" ")}`.slice(-6000),
			}
		: result;
}

export function reviewArguments(model, prompt) {
	return [
		"--print",
		"--model",
		model,
		"--effort",
		"high",
		"--max-turns",
		"40",
		"--output-format",
		"json",
		"--json-schema",
		JSON.stringify(schema),
		"--safe-mode",
		"--restricted",
		"--permission-prompts",
		"none",
		"--setting-sources",
		"",
		"--strict-mcp-config",
		"--mcp-config",
		'{"mcpServers":{}}',
		"--tools",
		"Read,Glob,Grep",
		"--allowedTools",
		"Read,Glob,Grep",
		"--no-session-persistence",
		"--system-prompt",
		prompt,
		"Review context.json and change.diff using head/, base/, and manifest.json. Return the structured result.",
	];
}

export function reviewEnvironment(environment, authDirectory) {
	const selected = Object.fromEntries(
		["PATH", "HOME", "TMPDIR", "LANG", "CLAUDE_CODE_OAUTH_TOKEN"]
			.filter((key) => environment[key])
			.map((key) => [key, environment[key]]),
	);
	return {
		...selected,
		CLAUDE_CONFIG_DIR: authDirectory,
		DISABLE_AUTOUPDATER: "1",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
	};
}

function save(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		typeof value === "string" || Buffer.isBuffer(value)
			? value
			: JSON.stringify(value, null, 2),
	);
}
function read(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
function root() {
	if (!process.env.RUNNER_TEMP || !process.env.GITHUB_REPOSITORY)
		throw new Error("Missing workflow environment");
	return join(
		process.env.RUNNER_TEMP,
		`claude-review-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
	);
}
function repository() {
	const value = process.env.GITHUB_REPOSITORY;
	if (!/^[\w.-]+\/[\w.-]+$/.test(value || ""))
		throw new Error("Invalid repository");
	return value;
}
async function api(path, method = "GET", body) {
	const response = await fetch(`https://api.github.com${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${process.env.GH_TOKEN}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(60000),
	});
	if (!response.ok)
		throw new Error(`GitHub ${method} ${path} returned ${response.status}`);
	return response.status === 204 ? null : response.json();
}
async function pages(path) {
	const entries = [];
	for (let page = 1; page <= 50; page++) {
		const batch = await api(
			`${path + (path.includes("?") ? "&" : "?")}per_page=100&page=${page}`,
		);
		entries.push(...batch);
		if (batch.length < 100) return entries;
	}
	throw new Error(
		"Discussion or changed-file pagination limit reached; split or inspect manually",
	);
}
function git(args, cwd, token) {
	const environment = {
		PATH: process.env.PATH,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_LITERAL_PATHSPECS: "1",
	};
	if (token) {
		environment.GIT_CONFIG_COUNT = "1";
		environment.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
		environment.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
	}
	try {
		return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
			cwd,
			env: environment,
			maxBuffer: MAX_BYTES,
			timeout: 120000,
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch {
		throw new Error(
			"Source retrieval failed; git output withheld to protect authentication",
		);
	}
}

export function snapshot(objects, ref, destination) {
	const entries = git(["ls-tree", "-rlz", ref], objects)
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	const omitted = [];
	let bytes = 0;
	for (const entry of entries) {
		const match = /^(\d+) (\w+) ([0-9a-f]+)\s+(\d+|-)\t([\s\S]+)$/.exec(entry);
		if (!match) throw new Error("Invalid source manifest");
		const [, mode, type, oid, sizeText, path] = match;
		const size = Number(sizeText);
		// Do not materialize symlinks, submodules, credentials, or bulk private data.
		if (!safePath(path)) throw new Error("Unsafe source path");
		const excluded =
			/(^|\/)(\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials)$/.test(path) ||
			/(^|\/)(data\/(raw|interim|processed|review)|reports\/(latest|archived)|app\/public\/data)(\/|$)/.test(
				path,
			);
		if (
			excluded ||
			type !== "blob" ||
			!["100644", "100755"].includes(mode) ||
			size > 1024 * 1024 ||
			bytes + size > MAX_BYTES
		) {
			omitted.push({
				path,
				reason: excluded
					? "private/configuration path"
					: "nonregular or size limit",
			});
			continue;
		}
		const content = git(["cat-file", "blob", oid], objects);
		if (content.includes(0)) {
			omitted.push({ path, reason: "binary" });
			continue;
		}
		bytes += size;
		save(join(destination, path), content);
	}
	return omitted;
}

async function prepare() {
	const event = read(process.env.GITHUB_EVENT_PATH);
	const number = Number(
		event.pull_request?.number ||
			event.issue?.number ||
			event.inputs?.pr_number,
	);
	if (!Number.isSafeInteger(number) || number <= 0)
		throw new Error("Invalid PR number");
	const repo = repository();
	if (process.env.GITHUB_EVENT_NAME === "issue_comment") {
		if (!/^\/claude-review(?:\s|$)/.test(event.comment.body)) return;
		const permission = await api(
			`/repos/${repo}/collaborators/${encodeURIComponent(event.sender.login)}/permission`,
		);
		if (!["admin", "maintain", "write"].includes(permission.permission)) {
			throw new Error("Only repository writers can request a paid re-review");
		}
	}
	const pr = await api(`/repos/${repo}/pulls/${number}`);
	if (pr.state !== "open") return;
	const state = {
		repo,
		number,
		head: pr.head.sha,
		base: pr.base.sha,
		briefHash: briefHash(pr),
	};
	if (![state.head, state.base].every((value) => /^[0-9a-f]{40}$/.test(value)))
		throw new Error("Invalid revision");
	save(join(root(), "state.json"), state);
	const check = await api(`/repos/${repo}/check-runs`, "POST", {
		name: "Claude review",
		head_sha: state.head,
		status: "in_progress",
		details_url: `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`,
		output: {
			title: "Independent review pending",
			summary: "Claude must review this revision before approval.",
		},
	});
	state.check = check.id;
	save(join(root(), "state.json"), state);
	appendFileSync(process.env.GITHUB_OUTPUT, "ready=true\n");
	// Failures after this point still complete the check through the always() publisher.
	const [
		comparison,
		files,
		comments,
		reviews,
		inlineComments,
		checks,
		statuses,
	] = await Promise.all([
		api(`/repos/${repo}/compare/${state.base}...${state.head}`),
		pages(`/repos/${repo}/pulls/${number}/files`),
		pages(`/repos/${repo}/issues/${number}/comments`),
		pages(`/repos/${repo}/pulls/${number}/reviews`),
		pages(`/repos/${repo}/pulls/${number}/comments`),
		api(`/repos/${repo}/commits/${state.head}/check-runs?per_page=100`),
		api(`/repos/${repo}/commits/${state.head}/status?per_page=100`),
	]);
	if (files.length !== pr.changed_files || files.length >= 3000)
		throw new Error("Changed-file list may be truncated");
	const mergeBase = comparison.merge_base_commit.sha;
	if (!/^[0-9a-f]{40}$/.test(mergeBase)) throw new Error("Invalid merge base");
	state.files = files.map((file) => file.filename);
	save(join(root(), "state.json"), state);
	const objects = join(root(), "objects");
	mkdirSync(objects, { recursive: true });
	git(["init", "--bare"], objects);
	git(
		[
			"fetch",
			"--depth=1",
			"--no-tags",
			`https://github.com/${repo}.git`,
			mergeBase,
			`refs/pull/${number}/head:refs/review/head`,
		],
		objects,
		process.env.GH_TOKEN,
	);
	if (
		git(["rev-parse", "refs/review/head"], objects).toString().trim() !==
		state.head
	) {
		throw new Error("PR changed during source retrieval; await the next run");
	}
	const input = join(root(), "input");
	mkdirSync(input, { recursive: true });
	const omitted = {
		base: snapshot(objects, mergeBase, join(input, "base")),
		head: snapshot(objects, state.head, join(input, "head")),
	};
	const changedPaths = new Set(
		files.flatMap((file) =>
			[file.filename, file.previous_filename].filter(Boolean),
		),
	);
	state.missingPaths = [
		...new Set(
			[...omitted.base, ...omitted.head]
				.filter((item) => changedPaths.has(item.path))
				.map((item) => item.path),
		),
	];
	save(join(root(), "state.json"), state);
	// Use the same exclusion rules for diff output; excluded private paths are not sent to Claude.
	const excluded = new Set(
		[...omitted.base, ...omitted.head]
			.filter((item) => item.reason === "private/configuration path")
			.map((item) => item.path),
	);
	const diffPaths = [...changedPaths].filter((path) => !excluded.has(path));
	save(
		join(input, "change.diff"),
		diffPaths.length
			? git(
					[
						"diff",
						"--no-ext-diff",
						"--no-textconv",
						"--no-renames",
						mergeBase,
						state.head,
						"--",
						...diffPaths,
					],
					objects,
				)
			: "All changed paths were excluded. Review is incomplete.\n",
	);
	save(join(input, "manifest.json"), omitted);
	const context = {
		repository: repo,
		number,
		head: state.head,
		base: state.base,
		mergeBase,
		title: pr.title,
		body: pr.body,
		draft: pr.draft,
		files: files.map(({ filename, status, additions, deletions }) => ({
			filename,
			status,
			additions,
			deletions,
		})),
		comments: comments.map(({ user, body, created_at }) => ({
			author: user.login,
			body,
			created_at,
		})),
		reviews: reviews.map(({ user, body, state, commit_id }) => ({
			author: user.login,
			body,
			state,
			commit_id,
		})),
		inlineComments: inlineComments.map(
			({ user, body, path, line, commit_id }) => ({
				author: user.login,
				body,
				path,
				line,
				commit_id,
			}),
		),
		checks: checks.check_runs
			.filter((check) => check.name !== "Claude review")
			.map(({ name, head_sha, status, conclusion, html_url }) => ({
				name,
				head_sha,
				status,
				conclusion,
				html_url,
			})),
		statuses: statuses.statuses.map(
			({ context, state, description, target_url }) => ({
				context,
				state,
				description,
				target_url,
			}),
		),
	};
	if (
		JSON.stringify(context).length > 500000 ||
		checks.total_count > 100 ||
		statuses.total_count > 100
	)
		throw new Error("Review context exceeds supported limit");
	save(join(input, "context.json"), context);
}

function configuration() {
	if (!process.env.CLAUDE_CODE_OAUTH_TOKEN)
		throw new Error(
			"Set the CLAUDE_CODE_OAUTH_TOKEN repository secret using your subscription login",
		);
	const model = process.env.CLAUDE_REVIEW_MODEL;
	// A concrete ID makes the account/billing choice explicit; no silent best-model or API fallback.
	if (!/^claude-[a-z0-9.-]+$/.test(model || ""))
		throw new Error(
			"Set CLAUDE_REVIEW_MODEL to an explicit model ID confirmed to use your included subscription allowance",
		);
}

function review() {
	configuration();
	const auth = join(root(), "authentication");
	const policy = readFileSync(join(directory, "prompt.md"), "utf8");
	const args = reviewArguments(process.env.CLAUDE_REVIEW_MODEL, policy);
	args.push(
		"--settings",
		JSON.stringify({
			disableAllHooks: true,
			permissions: {
				deny: [
					"Read(//proc/**)",
					"Read(//dev/**)",
					"Read(//sys/**)",
					`Read(/${auth}/**)`,
				],
			},
		}),
	);
	let output;
	try {
		output = execFileSync("claude", args, {
			cwd: join(root(), "input"),
			env: reviewEnvironment(process.env, auth),
			timeout: 18 * 60 * 1000,
			maxBuffer: MAX_BYTES,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		throw new Error(
			"Claude failed or timed out. Check subscription/model access and usage; no API fallback was attempted",
		);
	}
	const envelope = JSON.parse(output.toString("utf8"));
	if (envelope.is_error || envelope.subtype !== "success")
		throw new Error("Claude did not complete the review");
	const state = read(join(root(), "state.json"));
	validateResult(envelope.structured_output, state.files);
	const requestedModel = process.env.CLAUDE_REVIEW_MODEL;
	const usedModels = Object.keys(envelope.modelUsage || {});
	const verdict = enforceEvidence(
		envelope.structured_output,
		state.missingPaths,
		requestedModel,
		usedModels,
	);
	const result = { ...verdict, requestedModel, usedModels };
	save(join(root(), "result.json"), result);
}

export function reviewBody(result, state) {
	const findings = result.findings.map(
		(finding) =>
			"- [" +
			finding.severity +
			"] " +
			finding.category +
			" — " +
			finding.path +
			(finding.line ? `:${finding.line}` : "") +
			"\n  " +
			finding.explanation +
			"\n  Remedy: " +
			finding.remedy,
	);
	const body = [
		"## Claude independent review",
		"",
		`Revision: ${state.head} | Base: ${state.base}`,
		"Requested model: " +
			result.requestedModel +
			" | Reported models: " +
			(result.usedModels.join(", ") || "not reported"),
		"",
		result.summary,
		"",
		...findings,
		"",
		"Codex makes changes. Adam owns merge and product acceptance. CI and preview acceptance remain separate gates.",
		`<!-- oaktown-claude-review:${state.head}:${state.base} -->`,
	].join("\n");
	if (body.length > 60000)
		throw new Error("Review exceeds GitHub comment limit");
	return body;
}

export async function publishResult(state, result, request, outcome) {
	const prefix = `/repos/${state.repo}`;
	const pr = await request(`${prefix}/pulls/${state.number}`);
	if (!isCurrent(state, pr)) {
		await request(`${prefix}/check-runs/${state.check}`, "PATCH", {
			status: "completed",
			conclusion: "cancelled",
			output: {
				title: "Superseded revision",
				summary:
					"The PR changed or closed. This run cannot approve the current revision.",
			},
		});
		return "superseded";
	}
	if (outcome !== "success" || !result)
		throw new Error(
			"Review unavailable: configuration, source retrieval, or Claude execution failed",
		);
	const { requestedModel, usedModels, ...verdict } = result;
	const event = validateResult(verdict, state.files);
	const body = reviewBody(result, state);
	await request(`${prefix}/pulls/${state.number}/reviews`, "POST", {
		commit_id: state.head,
		event,
		body,
	});
	// Recheck after posting: a push racing the POST must never produce a green current check.
	const latest = await request(`${prefix}/pulls/${state.number}`);
	const current = isCurrent(state, latest);
	await request(`${prefix}/check-runs/${state.check}`, "PATCH", {
		status: "completed",
		conclusion: !current
			? "cancelled"
			: event === "APPROVE"
				? "success"
				: "failure",
		output: { title: !current ? "Superseded revision" : event, summary: body },
	});
	return !current ? "superseded" : event;
}

async function publish() {
	const state = read(join(root(), "state.json"));
	let result;
	try {
		result = read(join(root(), "result.json"));
	} catch {
		/* Failure remains explicit. */
	}
	try {
		const verdict = await publishResult(
			state,
			result,
			api,
			process.env.REVIEW_OUTCOME,
		);
		if (!["APPROVE", "superseded"].includes(verdict)) process.exitCode = 1;
	} catch (error) {
		await api(`/repos/${state.repo}/check-runs/${state.check}`, "PATCH", {
			status: "completed",
			conclusion: "failure",
			output: {
				title: "Review blocked",
				summary: `${error.message}. Codex should investigate and escalate to Adam if unresolved.`,
			},
		});
		throw error;
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const actions = { prepare, configuration, review, publish };
	const action = actions[process.argv[2]];
	if (!action)
		throw new Error("Expected prepare, configuration, review, or publish");
	await action();
}
