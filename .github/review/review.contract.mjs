import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	briefHash,
	enforceEvidence,
	isCurrent,
	publishResult,
	reviewArguments,
	reviewEnvironment,
	safePath,
	snapshot,
	validateResult,
} from "./review.mjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const state = {
	repo: "example/test",
	number: 1,
	head: sha,
	base,
	check: 2,
	files: ["src/app.ts"],
};
const pr = { state: "open", head: { sha }, base: { sha: base } };
const clean = {
	complete: true,
	summary: "Test-only review result.",
	findings: [],
};
const result = {
	...clean,
	requestedModel: "claude-test",
	usedModels: ["claude-test"],
};
const finding = {
	category: "correctness",
	severity: "P1",
	path: "src/app.ts",
	line: 2,
	explanation: "Test-only finding.",
	remedy: "Add the missing test condition.",
};

test("approval requires complete output and no blockers", () => {
	assert.equal(validateResult(clean, state.files), "APPROVE");
	assert.equal(
		validateResult({ ...clean, findings: [finding] }, state.files),
		"REQUEST_CHANGES",
	);
	assert.equal(
		validateResult({ ...clean, complete: false }, state.files),
		"COMMENT",
	);
	for (const invalid of [
		null,
		{},
		{ ...clean, summary: "" },
		{ ...clean, complete: "true" },
		{ ...clean, verdict: "APPROVE" },
		{ ...clean, findings: [{ ...finding, category: "style" }] },
		{ ...clean, findings: [{ ...finding, path: "not-in-diff.ts" }] },
		{ ...clean, findings: [{ ...finding, line: -1 }] },
	]) {
		assert.throws(() => validateResult(invalid, state.files));
	}
});

test("only an open PR at the exact head and base is current", () => {
	assert.equal(isCurrent(state, pr), true);
	assert.equal(isCurrent(state, { ...pr, state: "closed" }), false);
	assert.equal(isCurrent(state, { ...pr, head: { sha: base } }), false);
	assert.equal(isCurrent(state, { ...pr, base: { sha } }), false);
});

test("changed requirements invalidate a review even without a new commit", () => {
	const original = { ...pr, title: "Feature", body: "Approved scope" };
	const captured = { ...state, briefHash: briefHash(original) };
	assert.equal(isCurrent(captured, original), true);
	assert.equal(
		isCurrent(captured, { ...original, body: "Different scope" }),
		false,
	);
});

test("missing source and model fallback force incomplete review", () => {
	for (const [missing, models] of [
		[["omitted.ts"], ["claude-test"]],
		[[], []],
		[[], ["claude-other"]],
	]) {
		const limited = enforceEvidence(clean, missing, "claude-test", models);
		assert.equal(validateResult(limited, state.files), "COMMENT");
	}
	assert.deepEqual(
		enforceEvidence(clean, [], "claude-test", ["claude-test"]),
		clean,
	);
});

test("Claude gets no shell, write tools, MCP configuration, or GitHub/API credential", () => {
	const args = reviewArguments("claude-test", "policy");
	assert.equal(args[args.indexOf("--tools") + 1], "Read,Glob,Grep");
	assert.ok(args.includes("--safe-mode"));
	assert.ok(args.includes("--restricted"));
	assert.equal(args[args.indexOf("--permission-prompts") + 1], "none");
	assert.ok(args.includes("--strict-mcp-config"));
	assert.equal(args[args.indexOf("--setting-sources") + 1], "");
	const env = reviewEnvironment(
		{
			PATH: "/bin",
			HOME: "/test",
			GH_TOKEN: "test-only",
			GITHUB_TOKEN: "test-only",
			ANTHROPIC_API_KEY: "test-only",
			CLAUDE_CODE_OAUTH_TOKEN: "test-subscription",
			NODE_OPTIONS: "untrusted",
		},
		"/auth",
	);
	assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, "test-subscription");
	for (const key of [
		"GH_TOKEN",
		"GITHUB_TOKEN",
		"ANTHROPIC_API_KEY",
		"NODE_OPTIONS",
	])
		assert.equal(env[key], undefined);
});

test("unsafe source paths cannot leave the snapshot", () => {
	for (const path of [
		"../secret",
		"/secret",
		"a/../../b",
		"a\\b",
		".git/config",
		"x/./b",
		"a\nb",
	])
		assert.equal(safePath(path), false);
	assert.equal(safePath("src/space in name.ts"), true);
});

function mockApi(prs = [pr]) {
	const calls = [];
	let index = 0;
	return {
		calls,
		request: async (path, method = "GET", body) => {
			calls.push({ path, method, body });
			return method === "GET" ? prs[Math.min(index++, prs.length - 1)] : {};
		},
	};
}

test("publisher submits a real approval bound to the reviewed commit", async () => {
	const api = mockApi();
	assert.equal(
		await publishResult(state, result, api.request, "success"),
		"APPROVE",
	);
	const post = api.calls.find((call) => call.method === "POST");
	assert.equal(post.body.event, "APPROVE");
	assert.equal(post.body.commit_id, sha);
	assert.equal(api.calls.at(-1).body.conclusion, "success");
});

test("blockers request changes and incomplete review never approves", async () => {
	for (const [change, expected] of [
		[{ findings: [finding] }, "REQUEST_CHANGES"],
		[{ complete: false }, "COMMENT"],
	]) {
		const api = mockApi();
		assert.equal(
			await publishResult(
				state,
				{ ...result, ...change },
				api.request,
				"success",
			),
			expected,
		);
		assert.equal(api.calls.at(-1).body.conclusion, "failure");
	}
});

test("obsolete revision never posts approval", async () => {
	const api = mockApi([{ ...pr, head: { sha: base } }]);
	assert.equal(
		await publishResult(state, result, api.request, "success"),
		"superseded",
	);
	assert.equal(
		api.calls.some((call) => call.method === "POST"),
		false,
	);
	assert.equal(api.calls.at(-1).body.conclusion, "cancelled");
});

test("push racing approval cannot make the new revision green", async () => {
	const api = mockApi([pr, { ...pr, head: { sha: base } }]);
	assert.equal(
		await publishResult(state, result, api.request, "success"),
		"superseded",
	);
	assert.equal(api.calls.at(-1).body.conclusion, "cancelled");
});

test("failed execution or malformed output never creates a review", async () => {
	for (const [value, outcome] of [
		[result, "failure"],
		[null, "success"],
		[{ ...result, complete: null }, "success"],
	]) {
		const api = mockApi();
		await assert.rejects(publishResult(state, value, api.request, outcome));
		assert.equal(
			api.calls.some((call) => call.method === "POST"),
			false,
		);
	}
});

test("snapshot copies regular text only without following symlinks or exposing excluded data", () => {
	const folder = mkdtempSync(join(tmpdir(), "claude-review-test-"));
	const source = join(folder, "source");
	mkdirSync(source);
	const git = (...args) =>
		execFileSync(
			process.env.REVIEW_TEST_GIT || "git",
			["-c", "core.hooksPath=/dev/null", ...args],
			{ cwd: source, stdio: "pipe" },
		);
	git("init");
	writeFileSync(join(source, "app.ts"), "export const value = 1;\n");
	writeFileSync(join(source, ".env"), "TEST_ONLY=not-a-real-secret\n");
	mkdirSync(join(source, "data/raw"), { recursive: true });
	writeFileSync(
		join(source, "data/raw/test.txt"),
		"private-path test fixture\n",
	);
	writeFileSync(join(source, "binary"), Buffer.from([0, 1]));
	symlinkSync("/etc/passwd", join(source, "link"));
	git("add", ".");
	git(
		"-c",
		"user.email=test@example.invalid",
		"-c",
		"user.name=Test",
		"commit",
		"-m",
		"Test fixture",
	);
	const tree = git("rev-parse", "HEAD").toString().trim();
	const target = join(folder, "snapshot");
	const omitted = snapshot(source, tree, target);
	assert.equal(
		readFileSync(join(target, "app.ts"), "utf8"),
		"export const value = 1;\n",
	);
	for (const path of [".env", "data/raw/test.txt", "link", "binary"]) {
		assert.equal(existsSync(join(target, path)), false);
		assert.ok(omitted.some((item) => item.path === path));
	}
});
